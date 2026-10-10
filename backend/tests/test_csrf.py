"""Step 8: CSRF Protection Tests for AgiesAI Sentinel Admin Authentication.

Verifies:
1. Trusted-origin admin login succeeds with valid credentials.
2. Untrusted-origin and missing-origin login requests are rejected with 403 Forbidden.
3. Referer fallback works when Origin is missing (trusted succeeds, untrusted fails).
4. Authenticated admin mutations (POST, PATCH, DELETE) succeed with trusted origins.
5. Untrusted and missing origins are rejected with 403 for protected mutations.
6. Header spoofing (Host, X-Forwarded-Host, userinfo, prefix/suffix domains) cannot bypass CSRF.
7. Safe reads (GET) continue to work with or without origin headers.
8. Extension pairing (/api/extension/pair) and Bearer detection (/api/detect) remain functional
   without admin CSRF origin requirements.
9. Distinguishes 403 CSRF rejection from 401 Authentication failure.
10. Production startup validation fails closed when CSRF_TRUSTED_ORIGINS is missing or invalid.
"""

import os
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.csrf import (
    get_csrf_trusted_origins,
    normalize_origin,
    validate_csrf_configuration,
)
from app.database import (
    employees_collection,
    extension_pairing_codes_collection,
    policies_collection,
)
from app.main import app

TEST_ADMIN_EMAIL = "csrfadmin@agiesai.test"
TEST_ADMIN_PASSWORD = "StrongCsrfPassword123!"
TRUSTED_ORIGIN = "http://localhost:5173"
UNTRUSTED_ORIGIN = "http://malicious-attacker.example"


@pytest.fixture(autouse=True)
def configure_csrf_test_env():
    """Ensure consistent test admin and CSRF environment configuration."""
    with patch.dict(
        os.environ,
        {
            "ADMIN_EMAIL": TEST_ADMIN_EMAIL,
            "ADMIN_PASSWORD": TEST_ADMIN_PASSWORD,
            "SESSION_SECRET": "csrf-test-session-secret-key-32chars!",
            "ENVIRONMENT": "development",
            "CSRF_TRUSTED_ORIGINS": f"{TRUSTED_ORIGIN},http://127.0.0.1:5173,http://testserver",
        },
        clear=False,
    ):
        yield


@pytest.fixture
def test_employee():
    emp_id = f"EMP-CSRF-{uuid4().hex[:6].upper()}"
    employees_collection.delete_many({"employee_id": emp_id})
    extension_pairing_codes_collection.delete_many({"employee_id": emp_id})

    emp = {
        "employee_id": emp_id,
        "name": "CSRF Test Subject",
        "email": f"csrf.{emp_id.lower()}@example.com",
        "department": "Security",
        "role": "Analyst",
        "extension_active": True,
        "status": "Active",
        "extension": {
            "paired": False,
            "access_enabled": True,
            "protection_enabled": True,
            "credential_hash": None,
            "paired_at": None,
            "last_seen": None,
            "device_info": None,
        },
    }
    employees_collection.insert_one(emp)
    yield emp_id
    employees_collection.delete_many({"employee_id": emp_id})
    extension_pairing_codes_collection.delete_many({"employee_id": emp_id})


# ===========================================================================
# 1. Login CSRF Defense
# ===========================================================================


def test_login_succeeds_with_trusted_origin():
    """POST /api/auth/login succeeds when Origin header matches trusted allowlist."""
    client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    res = client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True
    assert "sentinel_session" in client.cookies


def test_login_succeeds_with_trusted_referer_fallback():
    """POST /api/auth/login succeeds when Origin is absent but Referer is trusted."""
    client = TestClient(app, headers={"Referer": f"{TRUSTED_ORIGIN}/login"})
    res = client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_login_rejected_with_untrusted_origin():
    """POST /api/auth/login returns 403 Forbidden when Origin is untrusted."""
    client = TestClient(app, headers={"Origin": UNTRUSTED_ORIGIN})
    res = client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "CSRF verification failed"
    assert "sentinel_session" not in client.cookies


def test_login_rejected_with_missing_origin_and_referer():
    """POST /api/auth/login returns 403 Forbidden when both Origin and Referer are absent."""
    # headers={} explicitly disables default testclient origin header
    client = TestClient(app, headers={})
    res = client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "CSRF verification failed"
    assert "sentinel_session" not in client.cookies


def test_login_rejected_with_untrusted_referer():
    """POST /api/auth/login returns 403 when Origin is absent and Referer is untrusted."""
    client = TestClient(app, headers={"Referer": f"{UNTRUSTED_ORIGIN}/phishing"})
    res = client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "CSRF verification failed"


# ===========================================================================
# 2. Logout CSRF Defense
# ===========================================================================


def test_logout_succeeds_with_trusted_origin():
    """POST /api/auth/logout succeeds with trusted origin."""
    client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    logout_res = client.post("/api/auth/logout")
    assert logout_res.status_code == 200
    assert logout_res.json()["success"] is True


def test_logout_rejected_with_untrusted_origin():
    """POST /api/auth/logout returns 403 Forbidden with untrusted origin."""
    client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    # Attacker site attempts to log out the user via CSRF
    logout_res = client.post("/api/auth/logout", headers={"Origin": UNTRUSTED_ORIGIN})
    assert logout_res.status_code == 403
    assert logout_res.json()["detail"] == "CSRF verification failed"


def test_logout_rejected_with_missing_origin():
    """POST /api/auth/logout returns 403 when origin is missing."""
    client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    logout_res = client.post("/api/auth/logout", headers={"Origin": ""})
    assert logout_res.status_code == 403


# ===========================================================================
# 3. Authenticated Administrative Mutations (POST, PATCH, DELETE)
# ===========================================================================


def test_authenticated_admin_mutation_succeeds_with_trusted_origin(test_employee):
    """Authenticated state mutations succeed when request origin is trusted."""
    emp_id = test_employee
    client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    login_res = client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert login_res.status_code == 200

    # 1. POST pairing-code
    code_res = client.post(f"/api/employees/{emp_id}/extension/pairing-code")
    assert code_res.status_code == 200
    assert "code" in code_res.json()

    # 2. PATCH employee
    patch_res = client.patch(
        f"/api/employees/{emp_id}",
        json={"name": "CSRF Updated", "email": f"updated.{emp_id.lower()}@example.com", "department": "Sec", "role": "Lead", "status": "Active"},
    )
    assert patch_res.status_code == 200


def test_authenticated_admin_mutation_rejected_with_untrusted_origin(test_employee):
    """Authenticated state mutations are rejected with 403 when Origin is untrusted."""
    emp_id = test_employee
    client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )

    # Attack: User is logged in, but malicious site triggers a PATCH request
    attacker_res = client.patch(
        f"/api/employees/{emp_id}",
        json={"name": "Malicious Alteration", "email": f"evil.{emp_id.lower()}@example.com", "department": "Sec", "role": "Hacker", "status": "Disabled"},
        headers={"Origin": UNTRUSTED_ORIGIN},
    )
    assert attacker_res.status_code == 403
    assert attacker_res.json()["detail"] == "CSRF verification failed"

    # Verify database was NOT modified
    doc = employees_collection.find_one({"employee_id": emp_id})
    assert doc["name"] != "Malicious Alteration"


def test_authenticated_admin_mutation_rejected_with_missing_origin(test_employee):
    """Authenticated state mutations are rejected with 403 when Origin and Referer are absent."""
    emp_id = test_employee
    client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )

    res = client.post(
        f"/api/employees/{emp_id}/extension/pairing-code",
        headers={"Origin": ""},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "CSRF verification failed"


def test_authenticated_policy_deletion_protected_by_csrf():
    """DELETE /api/policies/{id} requires valid origin and rejects untrusted origin."""
    client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )

    # Create policy
    create_res = client.post(
        "/api/policies",
        json={"name": "CSRF Temp Policy", "category": "Test", "risk_min": 10, "risk_max": 20, "action": "WARN", "status": "Draft", "description": "Temp"},
    )
    assert create_res.status_code == 200
    policy_id = create_res.json()["policy"]["policy_id"]

    try:
        # Untrusted DELETE attempt -> 403
        del_untrusted = client.delete(
            f"/api/policies/{policy_id}",
            headers={"Origin": UNTRUSTED_ORIGIN},
        )
        assert del_untrusted.status_code == 403

        # Policy still exists in database
        assert policies_collection.find_one({"policy_id": policy_id}) is not None

        # Trusted DELETE -> 200
        del_trusted = client.delete(
            f"/api/policies/{policy_id}",
            headers={"Origin": TRUSTED_ORIGIN},
        )
        assert del_trusted.status_code == 200
    finally:
        policies_collection.delete_many({"policy_id": policy_id})


# ===========================================================================
# 4. Anti-Bypass and Origin Spoofing Tests
# ===========================================================================


@pytest.mark.parametrize(
    "spoofed_origin",
    [
        "http://localhost:5173.attacker.com",         # Prefix domain spoofing
        "http://attacker-localhost:5173",             # Suffix domain spoofing
        "http://evil.com?http://localhost:5173",      # Query parameter trick
        "http://localhost:5173@evil.com",             # Userinfo authority trick
        "null",                                       # Sandboxed iframe origin
        "javascript:alert(1)",                        # Pseudo scheme
        "http://localhost:9999",                      # Untrusted port
        "https://localhost:5173",                     # Scheme mismatch (http vs https)
    ],
)
def test_origin_spoofing_attempts_rejected(spoofed_origin):
    """CSRF defense cannot be bypassed by tricky, malformed, or subdomain-matching origins."""
    client = TestClient(app, headers={"Origin": spoofed_origin})
    res = client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "CSRF verification failed"


def test_header_spoofing_does_not_bypass_csrf():
    """Supplying Host, X-Forwarded-Host, or X-Forwarded-For does not bypass missing/untrusted origin."""
    client = TestClient(app, headers={
        "Origin": UNTRUSTED_ORIGIN,
        "Host": "localhost:5173",
        "X-Forwarded-Host": "localhost:5173",
        "X-Forwarded-Proto": "http",
    })
    res = client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "CSRF verification failed"


# ===========================================================================
# 5. Distinguishing 403 (CSRF Rejection) from 401 (Authentication Failure)
# ===========================================================================


def test_distinguish_csrf_403_from_auth_401():
    """Unauthenticated requests:

    - Untrusted Origin -> 403 CSRF rejection (stopped at CSRF boundary)
    - Trusted Origin -> 401 Authentication failure (passed CSRF, failed require_admin)
    """
    # 1. Untrusted origin + no session -> 403
    untrusted_client = TestClient(app, headers={"Origin": UNTRUSTED_ORIGIN})
    res_403 = untrusted_client.post("/api/employees", json={"name": "X", "email": "x@x.co", "department": "X", "role": "X"})
    assert res_403.status_code == 403
    assert res_403.json()["detail"] == "CSRF verification failed"

    # 2. Trusted origin + no session -> 401
    trusted_client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    res_401 = trusted_client.post("/api/employees", json={"name": "X", "email": "x@x.co", "department": "X", "role": "X"})
    assert res_401.status_code == 401
    assert res_401.json()["detail"] == "Admin authentication required"


# ===========================================================================
# 6. Safe Reads (GET, HEAD, OPTIONS) Not Affected
# ===========================================================================


def test_safe_reads_work_with_or_without_origin():
    """GET requests never require CSRF validation."""
    client = TestClient(app, headers={})  # Missing origin
    # Public read
    assert client.get("/").status_code == 200
    assert client.get("/api/health").status_code == 200

    # Authenticated read with untrusted origin
    auth_client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    auth_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    # Read incidents with untrusted origin header -> 200 OK
    get_res = auth_client.get("/api/incidents", headers={"Origin": UNTRUSTED_ORIGIN})
    assert get_res.status_code == 200

    # Read /api/auth/me without origin -> 200 OK
    me_res = auth_client.get("/api/auth/me", headers={"Origin": ""})
    assert me_res.status_code == 200


# ===========================================================================
# 7. Extension Endpoints Remain Exempt from Admin CSRF
# ===========================================================================


def test_extension_pairing_exempt_from_admin_csrf(test_employee):
    """POST /api/extension/pair is public and does not require trusted browser Origin."""
    emp_id = test_employee
    admin_client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    admin_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    code_res = admin_client.post(f"/api/employees/{emp_id}/extension/pairing-code")
    code = code_res.json()["code"]

    # 1. Extension pairs without any Origin header
    ext_client = TestClient(app, headers={})
    pair_res = ext_client.post("/api/extension/pair", json={"code": code})
    assert pair_res.status_code == 200
    assert pair_res.json()["success"] is True


def test_extension_detect_exempt_from_admin_csrf(test_employee):
    """POST /api/detect uses Bearer auth and does not require admin browser Origin."""
    emp_id = test_employee
    admin_client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})
    admin_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    code_res = admin_client.post(f"/api/employees/{emp_id}/extension/pairing-code")
    code = code_res.json()["code"]

    ext_client = TestClient(app, headers={})
    pair_res = ext_client.post("/api/extension/pair", json={"code": code})
    token = pair_res.json()["credential"]

    # Extension calls /api/detect with Bearer token and NO origin
    detect_res = ext_client.post(
        "/api/detect",
        json={"text": "hello test world"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detect_res.status_code == 200
    assert detect_res.json()["success"] is True

    # Extension calls /api/detect with arbitrary extension origin (e.g. chrome-extension://...)
    detect_chrome_res = ext_client.post(
        "/api/detect",
        json={"text": "another test"},
        headers={
            "Authorization": f"Bearer {token}",
            "Origin": "chrome-extension://abcdefghijklmnop",
        },
    )
    assert detect_chrome_res.status_code == 200


# ===========================================================================
# 8. Production Configuration Validation (Fail Startup Closed)
# ===========================================================================


def test_production_fails_startup_when_csrf_trusted_origins_missing():
    """In production (both 'production' and 'prod'), missing CSRF_TRUSTED_ORIGINS fails startup with RuntimeError."""
    for prod_env in ["production", "prod"]:
        with patch.dict(os.environ, {"ENVIRONMENT": prod_env, "CSRF_TRUSTED_ORIGINS": ""}, clear=False):
            with pytest.raises(RuntimeError) as exc_info:
                validate_csrf_configuration()
            assert "CSRF_TRUSTED_ORIGINS" in str(exc_info.value)


@pytest.mark.parametrize(
    "invalid_origin",
    [
        "not-a-valid-origin",
        "https://sentinel.company.com/admin",       # subpaths not allowed in origin
        "https://sentinel.company.com?foo=bar",     # query params not allowed
        "https://sentinel.company.com#frag",        # fragment not allowed
        "https://user:pass@sentinel.company.com",   # userinfo not allowed
        "ftp://sentinel.company.com",               # unsupported scheme
    ],
)
def test_production_fails_startup_when_csrf_trusted_origins_invalid(invalid_origin):
    """In production, invalid origin entries in CSRF_TRUSTED_ORIGINS raise RuntimeError."""
    for prod_env in ["production", "prod"]:
        with patch.dict(os.environ, {"ENVIRONMENT": prod_env, "CSRF_TRUSTED_ORIGINS": invalid_origin}, clear=False):
            with pytest.raises(RuntimeError) as exc_info:
                validate_csrf_configuration()
            assert "Invalid origin" in str(exc_info.value) or "no valid origins" in str(exc_info.value)


def test_production_succeeds_when_valid_csrf_trusted_origins_configured():
    """In production (both 'production' and 'prod'), properly configured CSRF_TRUSTED_ORIGINS validates successfully."""
    for prod_env in ["production", "prod"]:
        with patch.dict(os.environ, {"ENVIRONMENT": prod_env, "CSRF_TRUSTED_ORIGINS": "https://sentinel.acme.example"}, clear=False):
            origins = get_csrf_trusted_origins()
            assert "https://sentinel.acme.example" in origins
