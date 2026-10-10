import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, Request, status
from pymongo.errors import PyMongoError

from app.database import (
    admin_sessions_collection,
    are_critical_indexes_ready,
    employees_collection,
)

logger = logging.getLogger("agiesai.sentinel.auth")

ADMIN_SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60  # 14 days, matching SessionMiddleware


def hash_credential(credential: str) -> str:
    """Return SHA-256 hash digest of extension credential or session identifier."""
    return hashlib.sha256(credential.encode("utf-8")).hexdigest()


def verify_admin_credentials(email: str, password: str) -> bool:
    """Verify administrator credentials against environment configuration in constant time."""
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_email or not admin_password:
        return False

    email_matches = hmac.compare_digest(email.strip().lower(), admin_email.strip().lower())
    password_matches = hmac.compare_digest(password, admin_password)
    return email_matches and password_matches


def create_admin_session(admin_email: str) -> Dict[str, Any]:
    """Create a fresh server-verifiable admin session and return cookie session payload.

    Generates a cryptographically strong session identifier, stores only its SHA-256
    hash in admin_sessions_collection, and returns the session dictionary to store in
    the signed session cookie. Avoids storing raw session cookies or session secrets.
    """
    session_id = secrets.token_hex(32)
    session_id_hash = hash_credential(session_id)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=ADMIN_SESSION_MAX_AGE_SECONDS)
    normalized_email = admin_email.strip().lower()

    admin_sessions_collection.insert_one(
        {
            "session_id_hash": session_id_hash,
            "admin_email": normalized_email,
            "created_at": now,
            "expires_at": expires_at,
            "revoked": False,
            "revoked_at": None,
        }
    )

    return {
        "email": normalized_email,
        "role": "admin",
        "session_id": session_id,
        "authenticated_at": now.isoformat(),
    }


def revoke_admin_session(session_id: Optional[str]) -> bool:
    """Revoke an active admin session server-side.

    Marks the session document as revoked in admin_sessions_collection.
    Returns True if an active session was found and revoked, False otherwise.
    """
    if not session_id or not isinstance(session_id, str):
        return False

    session_id_hash = hash_credential(session_id)
    now = datetime.now(timezone.utc)
    try:
        result = admin_sessions_collection.update_one(
            {"session_id_hash": session_id_hash, "revoked": False},
            {"$set": {"revoked": True, "revoked_at": now}},
        )
        return result.modified_count > 0
    except Exception as e:
        logger.error(f"Failed to revoke admin session in database: {e}", exc_info=True)
        return False


def revoke_all_admin_sessions(admin_email: Optional[str] = None) -> int:
    """Revoke all active admin sessions (or all for a specific email) server-side.

    Returns the count of revoked sessions.
    """
    query: Dict[str, Any] = {"revoked": False}
    if admin_email:
        query["admin_email"] = admin_email.strip().lower()

    now = datetime.now(timezone.utc)
    try:
        result = admin_sessions_collection.update_many(
            query,
            {"$set": {"revoked": True, "revoked_at": now}},
        )
        return result.modified_count
    except Exception as e:
        logger.error(f"Failed to revoke all admin sessions in database: {e}", exc_info=True)
        return 0


def is_admin_session_valid(session_id: Optional[str]) -> bool:
    """Verify that a session identifier exists, is not revoked, and is unexpired."""
    if not session_id or not isinstance(session_id, str):
        return False

    session_id_hash = hash_credential(session_id)
    try:
        session_record = admin_sessions_collection.find_one({"session_id_hash": session_id_hash})
    except PyMongoError as e:
        logger.error(f"Session validation query failed due to database error: {e}", exc_info=True)
        # Fail closed on database failure
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable",
        )
    except Exception as e:
        logger.error(f"Session validation query encountered unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable",
        )

    if not session_record:
        return False

    if session_record.get("revoked", False):
        return False

    expires_at = session_record.get("expires_at")
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) >= expires_at:
            return False

    return True


def require_admin(request: Request) -> Dict[str, Any]:
    """Protect admin-only API endpoints.

    Verifies the active session contains an authenticated administrator context
    and that the session identifier has not been revoked or expired server-side.
    """
    admin = request.session.get("admin")

    if not admin or not isinstance(admin, dict) or admin.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
        )

    if not are_critical_indexes_ready():
        logger.error("Protected admin route accessed but critical database indexes are not ready.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable",
        )

    session_id = admin.get("session_id")
    if not is_admin_session_valid(session_id):
        request.session.clear()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
        )

    return admin


def _sanitize_extension_context(raw_ext: Any) -> Dict[str, Any]:
    """Sanitize extension object so credential_hash is never exposed."""
    if not isinstance(raw_ext, dict):
        raw_ext = {}
    return {
        "paired": bool(raw_ext.get("paired", False)),
        "access_enabled": bool(raw_ext.get("access_enabled", True)),
        "protection_enabled": bool(raw_ext.get("protection_enabled", True)),
        "paired_at": raw_ext.get("paired_at"),
        "last_seen": raw_ext.get("last_seen"),
        "device_info": raw_ext.get("device_info"),
    }


def require_extension_auth(request: Request) -> Dict[str, Any]:
    """Authenticate incoming extension requests using Authorization Bearer token.

    Step 4: Extension Bearer Authentication.
    - Reads 'Authorization: Bearer <credential>' header.
    - Rejects missing, malformed, or blank credentials with generic 401 Unauthorized.
    - Hashes credential via SHA-256 and queries employees_collection by extension.credential_hash.
    - Enforces server-side state: status == 'Active', extension_active is True,
      extension.paired is True, extension.access_enabled is True.
    - Returns minimal authenticated employee context without sensitive keys (e.g. credential_hash).
    - Never logs plaintext credentials or credential hashes.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = auth_header.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    cred_hash = hash_credential(token)
    employee = employees_collection.find_one({"extension.credential_hash": cred_hash})
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    ext_state = employee.get("extension")
    if not isinstance(ext_state, dict):
        ext_state = {}

    # Check paired state
    if not ext_state.get("paired"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check employee status and active toggles
    if employee.get("status") != "Active" or not employee.get("extension_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Extension access disabled",
        )

    # Check administrator-controlled access toggle
    if not ext_state.get("access_enabled", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Extension access disabled",
        )

    sanitized_ext = _sanitize_extension_context(ext_state)

    return {
        "employee_id": employee.get("employee_id"),
        "name": employee.get("name"),
        "email": employee.get("email"),
        "department": employee.get("department"),
        "role": employee.get("role"),
        "status": employee.get("status"),
        "extension_active": bool(employee.get("extension_active", True)),
        "extension": sanitized_ext,
    }


def require_extension_protection(
    employee: Dict[str, Any] = Depends(require_extension_auth),
) -> Dict[str, Any]:
    """Enforce that extension protection is enabled for protected inspection operations.

    Depends on require_extension_auth and additionally verifies extension.protection_enabled is True.
    """
    ext = employee.get("extension") or {}
    if not ext.get("protection_enabled", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Extension protection is disabled",
        )
    return employee