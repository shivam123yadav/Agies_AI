import logging
import os
from typing import Optional, Set
from urllib.parse import urlsplit

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("agiesai.sentinel.csrf")

CSRF_PROTECTED_METHODS = frozenset({"POST", "PATCH", "PUT", "DELETE"})

# Non-cookie or extension-authenticated state-changing routes exempt from admin CSRF
CSRF_EXEMPT_PATHS = frozenset({
    "/api/extension/pair",
    "/api/detect",
})

DEFAULT_DEV_TRUSTED_ORIGINS = frozenset({
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://testserver",
})


def is_valid_configured_origin(raw: str) -> bool:
    """Strictly validate an origin entry in CSRF_TRUSTED_ORIGINS.

    An origin MUST be exactly scheme://host[:port], with no path, query, fragment, or userinfo.
    """
    if not raw or not isinstance(raw, str):
        return False
    raw = raw.strip()
    if not raw or "@" in raw:
        return False
    try:
        parsed = urlsplit(raw)
        if parsed.scheme.lower() not in {"http", "https"}:
            return False
        if not parsed.netloc:
            return False
        if parsed.query or parsed.fragment:
            return False
        if parsed.path and parsed.path != "/":
            return False
        _ = parsed.port
        return True
    except Exception:
        return False


def normalize_origin(raw: Optional[str]) -> Optional[str]:
    """Parse and normalize an origin or referer URL into scheme://host[:port].

    Returns lowercase normalized origin without trailing slashes.
    Rejects userinfo (@), unsupported schemes, missing hostnames, or malformed URLs.
    """
    if not raw or not isinstance(raw, str):
        return None
    raw = raw.strip()
    if not raw or "@" in raw:
        return None
    try:
        parsed = urlsplit(raw)
        if not parsed.scheme or not parsed.netloc:
            return None
        scheme = parsed.scheme.lower()
        if scheme not in {"http", "https"}:
            return None
        _ = parsed.port
        netloc = parsed.netloc.lower()
        return f"{scheme}://{netloc}"
    except Exception:
        return None


def get_csrf_trusted_origins() -> Set[str]:
    """Return the set of configured trusted origins.

    Parses CSRF_TRUSTED_ORIGINS environment variable. In development/test,
    defaults to standard local development origins if not configured.
    In production, raises RuntimeError if missing, empty, or containing invalid origins.
    """
    env = os.getenv("ENVIRONMENT", "development").strip().lower()
    raw = os.getenv("CSRF_TRUSTED_ORIGINS")

    if raw is not None and raw.strip():
        origins: Set[str] = set()
        for item in raw.replace(",", " ").split():
            item_clean = item.strip()
            if not item_clean:
                continue
            if is_valid_configured_origin(item_clean):
                norm = normalize_origin(item_clean)
                if norm:
                    origins.add(norm)
                    continue
            if env in {"production", "prod"}:
                raise RuntimeError(
                    f"Invalid origin in CSRF_TRUSTED_ORIGINS configuration: {item!r}"
                )
        if not origins and env in {"production", "prod"}:
            raise RuntimeError(
                "CSRF_TRUSTED_ORIGINS environment variable contains no valid origins in production."
            )
        return origins

    if env in {"production", "prod"}:
        raise RuntimeError(
            "CSRF_TRUSTED_ORIGINS environment variable is required and must be configured in production."
        )

    return set(DEFAULT_DEV_TRUSTED_ORIGINS)


def validate_csrf_configuration() -> None:
    """Validate CSRF configuration on application startup.

    Fails startup in production if CSRF_TRUSTED_ORIGINS is missing or invalid.
    """
    get_csrf_trusted_origins()


def extract_request_origin(request: Request) -> Optional[str]:
    """Extract origin from request headers.

    Checks 'Origin' header first. If absent, falls back to 'Referer' header.
    Never trusts 'Host' or forwarded headers.
    """
    origin = request.headers.get("origin")
    if origin:
        return normalize_origin(origin)

    referer = request.headers.get("referer")
    if referer:
        return normalize_origin(referer)

    return None


def verify_csrf(request: Request) -> bool:
    """Verify incoming request satisfies CSRF origin requirements.

    Returns True if allowed, False if CSRF verification fails.
    """
    # 1. Safe HTTP methods (GET, HEAD, OPTIONS) do not mutate state
    if request.method not in CSRF_PROTECTED_METHODS:
        return True

    # 2. Endpoints explicitly exempt from ambient cookie CSRF
    path = request.url.path.rstrip("/")
    if path in CSRF_EXEMPT_PATHS:
        return True

    # 3. For protected mutations, require a valid and trusted origin
    trusted_origins = get_csrf_trusted_origins()
    req_origin = extract_request_origin(request)

    if not req_origin or req_origin not in trusted_origins:
        logger.warning(
            "CSRF verification failed for %s %s: origin %r not in trusted list",
            request.method,
            request.url.path,
            req_origin,
        )
        return False

    return True


class CSRFMiddleware(BaseHTTPMiddleware):
    """Enforces strict Origin/Referer CSRF protection on state-changing requests."""

    async def dispatch(self, request: Request, call_next):
        if not verify_csrf(request):
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF verification failed"},
            )
        return await call_next(request)
