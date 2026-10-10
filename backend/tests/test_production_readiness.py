"""Step 11.1: Production Configuration and Database Readiness Regression Tests.

Verifies:
1. Production startup fails when MONGODB_URI is absent, unauthenticated, lacks TLS, or is invalid.
2. Production startup fails when administrator credentials (ADMIN_EMAIL, ADMIN_PASSWORD) are absent.
3. Existing production session secret (>=32 chars) and CSRF trusted origins checks remain enforced.
4. Critical index-creation failures prevent the application from declaring readiness (fails closed with 503).
5. Non-critical indexes can be deferred without preventing readiness.
6. Valid production configuration initializes successfully.
7. Development and test configuration continues to work with seamless defaults.
8. No secret values, passwords, or database credentials appear in logs or error messages.
"""

import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import PyMongoError

from app.config import (
    MIN_SESSION_SECRET_LENGTH,
    is_production_env,
    validate_admin_credentials_config,
    validate_mongodb_uri,
    validate_production_configuration,
    validate_session_secret,
)
from app.database import (
    admin_sessions_collection,
    are_critical_indexes_ready,
    check_database,
    ensure_critical_indexes,
    ensure_database_indexes,
    ensure_non_critical_indexes,
    is_database_ready,
)
from app.main import app

VALID_PROD_SESSION_SECRET = "production-session-secret-key-32chars-long!"
VALID_PROD_CSRF_ORIGIN = "https://sentinel.company.com"
VALID_PROD_ADMIN_EMAIL = "admin@company.com"
VALID_PROD_ADMIN_PASSWORD = "StrongProductionPassword123!"
VALID_PROD_MONGODB_URI = "mongodb+srv://dbuser:SecretPass123!@cluster0.example.mongodb.net/agiesai_sentinel?authSource=admin"


@pytest.fixture(autouse=True)
def reset_database_indexes_state():
    """Ensure database critical indexes are cleanly initialized before and after each test."""
    try:
        ensure_database_indexes()
    except Exception:
        pass
    yield
    try:
        ensure_database_indexes()
    except Exception:
        pass


@pytest.fixture
def base_prod_env():
    """Fixture providing a baseline valid production environment."""
    return {
        "ENVIRONMENT": "production",
        "SESSION_SECRET": VALID_PROD_SESSION_SECRET,
        "CSRF_TRUSTED_ORIGINS": VALID_PROD_CSRF_ORIGIN,
        "ADMIN_EMAIL": VALID_PROD_ADMIN_EMAIL,
        "ADMIN_PASSWORD": VALID_PROD_ADMIN_PASSWORD,
        "MONGODB_URI": VALID_PROD_MONGODB_URI,
    }


# ===========================================================================
# 1. Production MONGODB_URI Requirement & Validation
# ===========================================================================


def test_production_fails_when_mongodb_uri_is_absent(base_prod_env):
    """Production configuration fails closed when MONGODB_URI is absent or empty."""
    # Missing URI
    env = dict(base_prod_env)
    del env["MONGODB_URI"]
    with patch.dict(os.environ, env, clear=True):
        with pytest.raises(RuntimeError) as exc_info:
            validate_production_configuration()
        assert "MONGODB_URI" in str(exc_info.value)
        assert "required in production" in str(exc_info.value)

    # Empty string URI
    env["MONGODB_URI"] = "   "
    with patch.dict(os.environ, env, clear=True):
        with pytest.raises(RuntimeError) as exc_info:
            validate_production_configuration()
        assert "MONGODB_URI" in str(exc_info.value)


def test_production_fails_when_mongodb_uri_is_local_unauthenticated(base_prod_env):
    """Production configuration rejects local unauthenticated MongoDB instances."""
    local_uris = [
        "mongodb://127.0.0.1:27017",
        "mongodb://localhost:27017/agiesai_sentinel",
        "mongodb://0.0.0.0:27017",
    ]
    for uri in local_uris:
        env = dict(base_prod_env, MONGODB_URI=uri)
        with patch.dict(os.environ, env, clear=True):
            with pytest.raises(RuntimeError) as exc_info:
                validate_production_configuration()
            assert "unauthenticated" in str(exc_info.value).lower() or "credentials" in str(exc_info.value).lower()


def test_production_fails_when_mongodb_uri_has_invalid_scheme(base_prod_env):
    """Production configuration rejects non-MongoDB URI schemes."""
    invalid_schemes = [
        "http://user:pass@db.example.com:27017/db",
        "https://user:pass@db.example.com:27017/db",
        "postgres://user:pass@db.example.com:5432/db",
        "redis://user:pass@db.example.com:6379",
    ]
    for uri in invalid_schemes:
        env = dict(base_prod_env, MONGODB_URI=uri)
        with patch.dict(os.environ, env, clear=True):
            with pytest.raises(RuntimeError) as exc_info:
                validate_production_configuration()
            assert "scheme" in str(exc_info.value).lower()


def test_production_fails_when_mongodb_uri_lacks_credentials(base_prod_env):
    """Production configuration requires explicit authentication credentials."""
    unauthenticated_uris = [
        "mongodb://db.example.com:27017/agiesai_sentinel?tls=true",
        "mongodb+srv://cluster0.example.mongodb.net/agiesai_sentinel",
    ]
    for uri in unauthenticated_uris:
        env = dict(base_prod_env, MONGODB_URI=uri)
        with patch.dict(os.environ, env, clear=True):
            with pytest.raises(RuntimeError) as exc_info:
                validate_production_configuration()
            assert "credentials" in str(exc_info.value).lower()


def test_production_fails_when_mongodb_uri_lacks_tls(base_prod_env):
    """Production configuration requires TLS/SSL encryption."""
    # Standard mongodb:// without ?tls=true or ?ssl=true
    no_tls_standard = "mongodb://user:pass@db.example.com:27017/agiesai_sentinel"
    env_std = dict(base_prod_env, MONGODB_URI=no_tls_standard)
    with patch.dict(os.environ, env_std, clear=True):
        with pytest.raises(RuntimeError) as exc_info:
            validate_production_configuration()
        assert "tls" in str(exc_info.value).lower() or "ssl" in str(exc_info.value).lower()

    # mongodb+srv with explicit tls=false
    disabled_tls_srv = "mongodb+srv://user:pass@cluster0.example.mongodb.net/agiesai_sentinel?tls=false"
    env_srv = dict(base_prod_env, MONGODB_URI=disabled_tls_srv)
    with patch.dict(os.environ, env_srv, clear=True):
        with pytest.raises(RuntimeError) as exc_info:
            validate_production_configuration()
        assert "tls" in str(exc_info.value).lower() or "ssl" in str(exc_info.value).lower()


# ===========================================================================
# 2. Administrator Credentials Requirement
# ===========================================================================


def test_production_fails_when_admin_email_is_absent(base_prod_env):
    """Production configuration fails if ADMIN_EMAIL is missing or empty."""
    # Missing
    env = dict(base_prod_env)
    del env["ADMIN_EMAIL"]
    with patch.dict(os.environ, env, clear=True):
        with pytest.raises(RuntimeError) as exc_info:
            validate_production_configuration()
        assert "ADMIN_EMAIL" in str(exc_info.value)

    # Empty
    env["ADMIN_EMAIL"] = "  "
    with patch.dict(os.environ, env, clear=True):
        with pytest.raises(RuntimeError) as exc_info:
            validate_production_configuration()
        assert "ADMIN_EMAIL" in str(exc_info.value)


def test_production_fails_when_admin_password_is_absent(base_prod_env):
    """Production configuration fails if ADMIN_PASSWORD is missing or empty."""
    # Missing
    env = dict(base_prod_env)
    del env["ADMIN_PASSWORD"]
    with patch.dict(os.environ, env, clear=True):
        with pytest.raises(RuntimeError) as exc_info:
            validate_production_configuration()
        assert "ADMIN_PASSWORD" in str(exc_info.value)

    # Empty
    env["ADMIN_PASSWORD"] = ""
    with patch.dict(os.environ, env, clear=True):
        with pytest.raises(RuntimeError) as exc_info:
            validate_production_configuration()
        assert "ADMIN_PASSWORD" in str(exc_info.value)


# ===========================================================================
# 3. Existing Secret & CSRF Preserved Checks
# ===========================================================================


def test_production_session_secret_and_csrf_preserved(base_prod_env):
    """Production configuration preserves secret length and CSRF allowlist validation."""
    # Short session secret
    env_short_secret = dict(base_prod_env, SESSION_SECRET="too-short")
    with patch.dict(os.environ, env_short_secret, clear=True):
        with pytest.raises(RuntimeError) as exc_info:
            validate_production_configuration()
        assert "SESSION_SECRET" in str(exc_info.value)

    # Missing CSRF origins
    env_no_csrf = dict(base_prod_env)
    del env_no_csrf["CSRF_TRUSTED_ORIGINS"]
    with patch.dict(os.environ, env_no_csrf, clear=True):
        with pytest.raises(RuntimeError) as exc_info:
            validate_production_configuration()
        assert "CSRF_TRUSTED_ORIGINS" in str(exc_info.value)


# ===========================================================================
# 4. Valid Production Configuration Success
# ===========================================================================


def test_valid_production_configuration_succeeds(base_prod_env):
    """Valid production configuration passes all gates without error."""
    with patch.dict(os.environ, base_prod_env, clear=True):
        # Should execute cleanly without raising any exception
        validate_production_configuration()

    # Standard mongodb:// with ?tls=true also succeeds
    valid_std_uri = "mongodb://secuser:SecPass456!@mongo.corp.internal:27017/sentinel?tls=true&authSource=admin"
    env_std = dict(base_prod_env, MONGODB_URI=valid_std_uri)
    with patch.dict(os.environ, env_std, clear=True):
        validate_production_configuration()


# ===========================================================================
# 5. Development & Test Compatibility
# ===========================================================================


def test_development_mode_defaults_and_compatibility():
    """In development or test mode, absent MONGODB_URI defaults to local instance seamlessly."""
    dev_env = {
        "ENVIRONMENT": "development",
        "SESSION_SECRET": "short-dev-secret",
    }
    with patch.dict(os.environ, dev_env, clear=True):
        assert not is_production_env()
        uri = validate_mongodb_uri(None, is_production=False)
        assert uri == "mongodb://127.0.0.1:27017"

        # Admin email/password not strictly required in dev startup
        validate_admin_credentials_config(is_production=False)


# ===========================================================================
# 6. Critical Index Enforcement and Readiness Failures
# ===========================================================================


def test_critical_index_failure_raises_and_marks_not_ready():
    """Critical index failure raises RuntimeError and marks database not ready."""
    with patch.object(
        admin_sessions_collection,
        "create_index",
        side_effect=PyMongoError("Simulated index collision or disk failure"),
    ):
        with pytest.raises(RuntimeError) as exc_info:
            ensure_critical_indexes()
        assert "readiness failure" in str(exc_info.value).lower()
        assert "admin_sessions" in str(exc_info.value)
        assert not are_critical_indexes_ready()


def test_critical_index_failure_degrades_health_check():
    """When critical indexes fail, /api/health reports 'degraded' and 'indexes_ready: False'."""
    client = TestClient(app)

    # Force critical indexes ready state to False
    with patch("app.main.are_critical_indexes_ready", return_value=False):
        res = client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "degraded"
        assert data["indexes_ready"] is False


def test_critical_index_failure_blocks_protected_routes():
    """Protected admin routes fail closed (503 Service Unavailable) when critical indexes are not ready."""
    client = TestClient(app)

    with patch.dict(os.environ, {"ADMIN_EMAIL": "testadmin@company.test", "ADMIN_PASSWORD": "TestPassword123!"}):
        login_res = client.post(
            "/api/auth/login",
            json={"email": "testadmin@company.test", "password": "TestPassword123!"},
        )
        assert login_res.status_code == 200

    with patch("app.auth.are_critical_indexes_ready", return_value=False):
        res = client.get("/api/auth/me")
        assert res.status_code == 503
        assert "temporarily unavailable" in res.json()["detail"].lower()


def test_non_critical_index_failure_is_deferred_without_crashing():
    """Non-critical indexes log a warning on failure without raising or aborting readiness."""
    mock_coll = MagicMock()
    mock_coll.create_index.side_effect = PyMongoError("Deferred TTL failure")
    mock_coll.name = "test_non_critical"

    specs = [(mock_coll, [("field", 1)], {})]
    with patch("app.database.NON_CRITICAL_INDEX_SPECS", specs):
        # ensure_non_critical_indexes must NOT raise
        ensure_non_critical_indexes()


# ===========================================================================
# 7. Privacy & Zero Credential Leaking in Errors / Logs
# ===========================================================================


def test_no_secret_values_appear_in_error_messages(base_prod_env):
    """Exception messages never include sensitive passwords, secrets, or raw connection strings."""
    secret_pass = "P@ssw0rdSuperSecretToNeverLeak999!"
    secret_key = "TopSecretSessionKeyMustNotAppear!"
    raw_uri_with_secret = f"mongodb://user:{secret_pass}@127.0.0.1:27017/db"

    env = dict(
        base_prod_env,
        MONGODB_URI=raw_uri_with_secret,
        SESSION_SECRET=secret_key,
        ADMIN_PASSWORD=secret_pass,
    )
    with patch.dict(os.environ, env, clear=True):
        try:
            validate_production_configuration()
        except RuntimeError as e:
            err_msg = str(e)
            assert secret_pass not in err_msg
            assert secret_key not in err_msg
            assert raw_uri_with_secret not in err_msg
