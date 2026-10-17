import ipaddress
import logging
import math
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Set

from fastapi import HTTPException, Request, status
from pymongo import ReturnDocument

from app.database import audit_logs_collection, login_rate_limits_collection

logger = logging.getLogger("agiesai.sentinel.rate_limiter")

# Default Policy: 5 failed attempts per IP, 10 failed attempts per account in 15 mins
DEFAULT_IP_MAX_ATTEMPTS = 5
DEFAULT_ACCOUNT_MAX_ATTEMPTS = 10
DEFAULT_WINDOW_SECONDS = 900  # 15 minutes
DEFAULT_LOCKOUT_SECONDS = 900  # 15 minutes


def _parse_int_env(name: str, default: int) -> int:
    val = os.getenv(name)
    if val is None or not val.strip():
        return default
    try:
        parsed = int(val.strip())
        return parsed if parsed > 0 else default
    except ValueError:
        logger.warning("Invalid integer for %s: %r. Using default %d", name, val, default)
        return default


def get_rate_limit_config() -> dict:
    return {
        "ip_max_attempts": _parse_int_env("LOGIN_RATE_LIMIT_IP_MAX_ATTEMPTS", DEFAULT_IP_MAX_ATTEMPTS),
        "account_max_attempts": _parse_int_env("LOGIN_RATE_LIMIT_ACCOUNT_MAX_ATTEMPTS", DEFAULT_ACCOUNT_MAX_ATTEMPTS),
        "window_seconds": _parse_int_env("LOGIN_RATE_LIMIT_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS),
        "lockout_seconds": _parse_int_env("LOGIN_RATE_LIMIT_LOCKOUT_SECONDS", DEFAULT_LOCKOUT_SECONDS),
    }


# Pairing Rate Limit Policy: 5 failed attempts per IP in 15 mins
DEFAULT_PAIRING_IP_MAX_ATTEMPTS = 5
DEFAULT_PAIRING_WINDOW_SECONDS = 900  # 15 minutes
DEFAULT_PAIRING_LOCKOUT_SECONDS = 900  # 15 minutes


def get_pairing_rate_limit_config() -> dict:
    return {
        "ip_max_attempts": _parse_int_env("PAIRING_RATE_LIMIT_IP_MAX_ATTEMPTS", DEFAULT_PAIRING_IP_MAX_ATTEMPTS),
        "window_seconds": _parse_int_env("PAIRING_RATE_LIMIT_WINDOW_SECONDS", DEFAULT_PAIRING_WINDOW_SECONDS),
        "lockout_seconds": _parse_int_env("PAIRING_RATE_LIMIT_LOCKOUT_SECONDS", DEFAULT_PAIRING_LOCKOUT_SECONDS),
    }


def get_trusted_proxies() -> Set[str]:
    raw = os.getenv("TRUSTED_PROXIES", "").strip()
    if not raw:
        return set()
    return {p.strip() for p in raw.replace(",", " ").split() if p.strip()}


def get_client_ip(request: Request) -> str:
    """Extract client IP address carefully.

    Only trusts X-Forwarded-For if the direct peer is in TRUSTED_PROXIES.
    Otherwise uses the direct peer socket IP (request.client.host).
    """
    direct_ip = request.client.host if request.client else "127.0.0.1"
    trusted_proxies = get_trusted_proxies()

    if not trusted_proxies:
        return direct_ip

    # If direct connection is from a verified trusted proxy, extract client IP
    if direct_ip in trusted_proxies:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            parts = [p.strip() for p in forwarded_for.split(",") if p.strip()]
            if parts:
                # Right-most untrusted IP in chain is the client IP
                for candidate in reversed(parts):
                    if candidate not in trusted_proxies:
                        try:
                            # Validate IP syntax
                            ipaddress.ip_address(candidate)
                            return candidate
                        except ValueError:
                            pass
                return parts[0]

    return direct_ip


def _normalize_account(email: str) -> str:
    return email.strip().lower() if email else ""


def _check_key_limit(
    key: str,
    max_attempts: int,
    window_seconds: int,
    lockout_seconds: int,
    now: datetime,
) -> Optional[int]:
    """Check if a specific rate limit key is currently locked out or exceeded.

    Returns retry_after in integer seconds if rate limited, or None if allowed.
    """
    doc = login_rate_limits_collection.find_one({"key": key})
    if not doc:
        return None

    locked_until = doc.get("locked_until")
    if locked_until:
        # Normalize timezone if naive
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until > now:
            remaining = math.ceil((locked_until - now).total_seconds())
            return max(1, remaining)

    # Check if existing attempts fall within the current window
    first_attempt_at = doc.get("first_attempt_at")
    if first_attempt_at:
        if first_attempt_at.tzinfo is None:
            first_attempt_at = first_attempt_at.replace(tzinfo=timezone.utc)
        if (now - first_attempt_at).total_seconds() > window_seconds:
            # Window expired; previous attempts no longer count
            return None

    attempts = doc.get("attempts", 0)
    if attempts >= max_attempts:
        # Should have been locked out; compute remaining window
        if first_attempt_at:
            window_end = first_attempt_at + timedelta(seconds=window_seconds)
            remaining = math.ceil((window_end - now).total_seconds())
            return max(1, remaining)
        return max(1, lockout_seconds)

    return None


def check_login_rate_limit(
    request: Request,
    email: str,
    now: Optional[datetime] = None,
) -> None:
    """Enforce rate limits prior to credential verification.

    Checks both client IP and account identifier.
    Raises HTTP 429 Too Many Requests with Retry-After header if either is locked.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    config = get_rate_limit_config()
    client_ip = get_client_ip(request)
    account = _normalize_account(email)

    ip_key = f"ip:{client_ip}"
    account_key = f"account:{account}" if account else None

    # 1. Check IP limit
    ip_retry = _check_key_limit(
        ip_key,
        config["ip_max_attempts"],
        config["window_seconds"],
        config["lockout_seconds"],
        now,
    )

    # 2. Check Account limit
    account_retry = None
    if account_key:
        account_retry = _check_key_limit(
            account_key,
            config["account_max_attempts"],
            config["window_seconds"],
            config["lockout_seconds"],
            now,
        )

    retry_after = max(ip_retry or 0, account_retry or 0)
    if retry_after > 0:
        logger.warning(
            "Login rate limit exceeded for ip=%s account=%s (retry_after=%ds)",
            client_ip,
            account,
            retry_after,
        )
        audit_logs_collection.insert_one(
            {
                "timestamp": now,
                "event": "ADMIN_LOGIN_RATE_LIMITED",
                "client_ip": client_ip,
                "account": account,
                "retry_after": retry_after,
            }
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )


def _record_key_failure(
    key: str,
    key_type: str,
    max_attempts: int,
    window_seconds: int,
    lockout_seconds: int,
    now: datetime,
) -> None:
    """Atomically increment failed attempts for a key in MongoDB."""
    ttl_expiry = now + timedelta(seconds=max(window_seconds, lockout_seconds) + 60)
    cutoff = now - timedelta(seconds=window_seconds)

    # 1. Atomically upsert or increment document using $inc and $setOnInsert
    updated = login_rate_limits_collection.find_one_and_update(
        {"key": key},
        {
            "$inc": {"attempts": 1},
            "$set": {
                "last_attempt_at": now,
                "expires_at": ttl_expiry,
            },
            "$setOnInsert": {
                "type": key_type,
                "first_attempt_at": now,
                "locked_until": None,
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    # 2. Check if the active sliding window had expired before this increment
    first_at = updated.get("first_attempt_at") if updated else None
    if first_at:
        if first_at.tzinfo is None:
            first_at = first_at.replace(tzinfo=timezone.utc)
        if first_at < cutoff:
            # Window expired; reset window with attempts=1
            reset_doc = login_rate_limits_collection.find_one_and_update(
                {"key": key, "first_attempt_at": updated["first_attempt_at"]},
                {
                    "$set": {
                        "attempts": 1,
                        "first_attempt_at": now,
                        "last_attempt_at": now,
                        "locked_until": None,
                        "expires_at": ttl_expiry,
                    }
                },
                return_document=ReturnDocument.AFTER,
            )
            if reset_doc:
                updated = reset_doc

    # 3. If attempts reached or exceeded threshold, set locked_until atomically
    if updated and updated.get("attempts", 0) >= max_attempts and not updated.get("locked_until"):
        lock = now + timedelta(seconds=lockout_seconds)
        login_rate_limits_collection.update_one(
            {"key": key, "locked_until": None},
            {"$set": {"locked_until": lock, "expires_at": lock + timedelta(seconds=60)}},
        )


def record_login_failure(
    request: Request,
    email: str,
    now: Optional[datetime] = None,
) -> None:
    """Record an invalid administrator login attempt."""
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    config = get_rate_limit_config()
    client_ip = get_client_ip(request)
    account = _normalize_account(email)

    ip_key = f"ip:{client_ip}"
    _record_key_failure(
        ip_key,
        "ip",
        config["ip_max_attempts"],
        config["window_seconds"],
        config["lockout_seconds"],
        now,
    )

    if account:
        account_key = f"account:{account}"
        _record_key_failure(
            account_key,
            "account",
            config["account_max_attempts"],
            config["window_seconds"],
            config["lockout_seconds"],
            now,
        )


def reset_login_rate_limit(request: Request, email: str) -> None:
    """Clear failed attempt records for the authenticated account after successful login.

    Deliberately does not delete the shared client IP counter. Resetting the IP counter
    on success would allow an attacker with one valid credential to repeatedly wipe IP-based
    strikes while brute-forcing other accounts, and would allow a login by one account to
    clear strikes accumulated by other accounts sharing the same IP.
    """
    account = _normalize_account(email)
    if account:
        login_rate_limits_collection.delete_one({"key": f"account:{account}"})


def check_pairing_rate_limit(
    request: Request,
    now: Optional[datetime] = None,
) -> None:
    """Enforce rate limits on extension pairing attempts by client IP.

    Checks IP limit prior to pairing code hash verification and database query.
    Raises HTTP 429 Too Many Requests with Retry-After header if locked out or limit exceeded.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    config = get_pairing_rate_limit_config()
    client_ip = get_client_ip(request)
    ip_key = f"pair_ip:{client_ip}"

    retry_after = _check_key_limit(
        ip_key,
        config["ip_max_attempts"],
        config["window_seconds"],
        config["lockout_seconds"],
        now,
    )

    if retry_after is not None and retry_after > 0:
        logger.warning(
            "Extension pairing rate limit exceeded for ip=%s (retry_after=%ds)",
            client_ip,
            retry_after,
        )
        audit_logs_collection.insert_one(
            {
                "timestamp": now,
                "event": "EXTENSION_PAIRING_RATE_LIMITED",
                "client_ip": client_ip,
                "retry_after": retry_after,
            }
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many pairing attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )


def record_pairing_failure(
    request: Request,
    now: Optional[datetime] = None,
) -> None:
    """Record an unsuccessful extension pairing attempt for rate limiting."""
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    config = get_pairing_rate_limit_config()
    client_ip = get_client_ip(request)
    ip_key = f"pair_ip:{client_ip}"

    _record_key_failure(
        ip_key,
        "pair_ip",
        config["ip_max_attempts"],
        config["window_seconds"],
        config["lockout_seconds"],
        now,
    )

