import logging
import os
import secrets
from typing import Optional
from urllib.parse import parse_qs, urlsplit

from app.csrf import validate_csrf_configuration

logger = logging.getLogger("agiesai.sentinel.config")

MIN_SESSION_SECRET_LENGTH = 32
DEFAULT_DEV_MONGODB_URI = "mongodb://127.0.0.1:27017"


def is_production_env() -> bool:
    """Return True if current environment is configured as production."""
    env = os.getenv("ENVIRONMENT", "development").strip().lower()
    return env in {"production", "prod"}


def validate_mongodb_uri(raw_uri: Optional[str], is_production: Optional[bool] = None) -> str:
    """Validate MongoDB connection URI.

    In production:
    - MONGODB_URI must be explicitly set (no silent local fallback).
    - Must use mongodb:// or mongodb+srv:// scheme.
    - Must include username and password authentication credentials.
    - Must enforce TLS/SSL (mongodb+srv uses TLS by default unless disabled;
      mongodb:// requires ?tls=true or ?ssl=true).
    - Localhost/127.0.0.1 without credentials/TLS is strictly forbidden.
    - NEVER includes credentials or full URI in error messages.

    In development/test:
    - Defaults to local mongodb://127.0.0.1:27017 if unset.
    """
    if is_production is None:
        is_production = is_production_env()

    if not is_production:
        if not raw_uri or not raw_uri.strip():
            return DEFAULT_DEV_MONGODB_URI
        return raw_uri.strip()

    # --- Production Validation ---
    if not raw_uri or not raw_uri.strip():
        raise RuntimeError(
            "MONGODB_URI environment variable is required in production and cannot be empty. "
            "Silent fallback to local MongoDB is disabled."
        )

    clean_uri = raw_uri.strip()
    try:
        parsed = urlsplit(clean_uri)
    except Exception:
        raise RuntimeError("MONGODB_URI in production is malformed or cannot be parsed.")

    scheme = parsed.scheme.lower()
    if scheme not in {"mongodb", "mongodb+srv"}:
        raise RuntimeError(
            "Invalid MONGODB_URI scheme in production. Must use 'mongodb://' or 'mongodb+srv://'."
        )

    if not parsed.netloc:
        raise RuntimeError("Invalid MONGODB_URI: missing database network address or hostname.")

    # Disallow unauthenticated local instances in production
    hostname = (parsed.hostname or "").lower()
    if hostname in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
        if not parsed.username or not parsed.password:
            raise RuntimeError(
                "Local unauthenticated MongoDB is not permitted in production. "
                "Production requires an authenticated cluster configuration."
            )

    # Require authentication credentials
    if not parsed.username or not parsed.password:
        raise RuntimeError(
            "MONGODB_URI must include authentication credentials (username and password) in production."
        )

    # Require TLS/SSL
    query_params = parse_qs(parsed.query.lower())
    if scheme == "mongodb+srv":
        # mongodb+srv defaults to TLS enabled. Ensure it is not explicitly disabled.
        tls_val = query_params.get("tls", ["true"])[0]
        ssl_val = query_params.get("ssl", ["true"])[0]
        if tls_val in {"false", "0", "no"} or ssl_val in {"false", "0", "no"}:
            raise RuntimeError(
                "MONGODB_URI in production cannot disable TLS/SSL encryption (tls=false or ssl=false)."
            )
    else:
        # Standard mongodb:// must explicitly require TLS/SSL in production
        tls_val = query_params.get("tls", ["false"])[0]
        ssl_val = query_params.get("ssl", ["false"])[0]
        has_tls = tls_val in {"true", "1", "yes"} or ssl_val in {"true", "1", "yes"}
        if not has_tls:
            raise RuntimeError(
                "MONGODB_URI in production must enforce TLS/SSL encryption (e.g. '?tls=true' or '?ssl=true')."
            )

    return clean_uri


def validate_admin_credentials_config(is_production: Optional[bool] = None) -> None:
    """Validate administrator credentials environment variables.

    In production, ADMIN_EMAIL and ADMIN_PASSWORD must be non-empty strings.
    """
    if is_production is None:
        is_production = is_production_env()

    if not is_production:
        return

    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")

    if not admin_email or not admin_email.strip():
        raise RuntimeError(
            "ADMIN_EMAIL environment variable is required and cannot be empty in production."
        )

    if not admin_password or not admin_password.strip():
        raise RuntimeError(
            "ADMIN_PASSWORD environment variable is required and cannot be empty in production."
        )


def validate_session_secret(is_production: Optional[bool] = None) -> str:
    """Validate SESSION_SECRET environment variable.

    In production, SESSION_SECRET must be non-default and at least 32 characters.
    In development, an ephemeral key is generated if unset.
    """
    if is_production is None:
        is_production = is_production_env()

    secret = os.getenv("SESSION_SECRET")
    insecure_defaults = {"default-secret-key-change-in-prod", "change-me", "secret"}

    if not secret or secret in insecure_defaults or len(secret) < MIN_SESSION_SECRET_LENGTH:
        if is_production:
            raise RuntimeError(
                f"A strong, non-default SESSION_SECRET (at least {MIN_SESSION_SECRET_LENGTH} characters) is required in production."
            )
        if not secret:
            logger.warning("SESSION_SECRET not set; generating an ephemeral development session key.")
            secret = secrets.token_hex(32)

    return secret


def validate_production_configuration() -> None:
    """Run full production configuration gate.

    Validates:
    1. MONGODB_URI (explicit, auth, TLS, valid syntax)
    2. ADMIN_EMAIL and ADMIN_PASSWORD (non-empty)
    3. SESSION_SECRET (>= 32 chars, non-default)
    4. CSRF_TRUSTED_ORIGINS (valid origins format, non-empty)
    """
    is_prod = is_production_env()
    raw_uri = os.getenv("MONGODB_URI")
    validate_mongodb_uri(raw_uri, is_production=is_prod)
    validate_admin_credentials_config(is_production=is_prod)
    validate_session_secret(is_production=is_prod)
    validate_csrf_configuration()
