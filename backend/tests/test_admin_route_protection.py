"""
Step 7 -- Admin Route Protection Tests

Verifies that:
  1. Every admin-only route returns 401 when no admin session is present.
  2. Every admin-only route returns the expected response when an admin session
     is active.
  3. Extension-authenticated routes still accept valid extension credentials
     and reject missing or invalid ones.
  4. Public auth endpoints (login, logout) remain functional without a session.
  5. POST /api/extension/pair remains functional with a valid pairing code.
  6. Sensitive data (passwords, credential hashes) never appears in responses.
"""

import hashlib
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.database import (
    audit_logs_collection,
    employees_collection,
    extension_pairing_codes_collection,
    incidents_collection,
    policies_collection,
)
from app.main import app

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TEST_ADMIN_EMAIL = "step7admin@agiesai.test"
TEST_ADMIN_PASSWORD = "Step7TestPassword!xyz"

client = TestClient(app)


def _hash_credential(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def configure_admin_env():
    """Ensure ADMIN_EMAIL/ADMIN_PASSWORD/SESSION_SECRET are set for every test."""
    with patch.dict(
        os.environ,
        {
            "ADMIN_EMAIL": TEST_ADMIN_EMAIL,
            "ADMIN_PASSWORD": TEST_ADMIN_PASSWORD,
            "SESSION_SECRET": "step7-test-session-secret-32chars!!",
        },
        clear=False,
    ):
        yield


@pytest.fixture
def authed_client():
    """Return a TestClient that already holds a valid admin session."""
    session_client = TestClient(app)
    res = session_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert res.status_code == 200, f"Login failed: {res.text}"
    return session_client


@pytest.fixture
def anon_client():
    """Return a fresh TestClient with no session."""
    return TestClient(app)


@pytest.fixture
def test_employee():
    """Insert a test employee directly into the database and clean up afterwards."""
    emp_id = f"EMP-S7-{uuid4().hex[:6].upper()}"
    employees_collection.delete_many({"employee_id": emp_id})
    extension_pairing_codes_collection.delete_many({"employee_id": emp_id})

    now = datetime.now(timezone.utc)
    employees_collection.insert_one(
        {
            "employee_id": emp_id,
            "name": "Step7 Test Employee",
            "email": f"step7-{emp_id.lower()}@example.com",
            "department": "Engineering",
            "role": "Developer",
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
            "created_at": now,
            "last_active": None,
        }
    )

    yield emp_id

    employees_collection.delete_many({"employee_id": emp_id})
    extension_pairing_codes_collection.delete_many({"employee_id": emp_id})
    incidents_collection.delete_many({"employee_id": emp_id})


@pytest.fixture
def paired_extension(test_employee, authed_client):
    """Pair an extension for test_employee and return (employee_id, credential)."""
    emp_id = test_employee

    code_res = authed_client.post(f"/api/employees/{emp_id}/extension/pairing-code")
    assert code_res.status_code == 200
    code = code_res.json()["code"]

    pair_res = TestClient(app).post(
        "/api/extension/pair",
        json={"code": code, "device_info": "Step7 Test Device"},
    )
    assert pair_res.status_code == 200
    credential = pair_res.json()["credential"]

    return emp_id, credential


# ---------------------------------------------------------------------------
# All admin-only routes for the parametrized 401 sweep
# ---------------------------------------------------------------------------

ADMIN_ONLY_ROUTES = [
    # method, path, body
    # Incidents
    ("GET",    "/api/incidents",              None),
    ("GET",    "/api/incidents/INC-FAKE",     None),
    ("PATCH",  "/api/incidents/INC-FAKE/status",  {"status": "Resolved"}),
    ("POST",   "/api/incidents/INC-FAKE/action",  {"action": "WARNING_CANCELLED"}),
    # Detection rules
    ("GET",    "/api/detection-rules",        None),
    ("POST",   "/api/detection-rules",        {"name": "x", "category": "x", "detection_type": "LOCAL", "severity": "Low", "pattern": "x", "description": "x"}),
    ("PATCH",  "/api/detection-rules/RUL-999/status",  {"status": "Disabled"}),
    ("PATCH",  "/api/detection-rules/RUL-999",         {"name": "x"}),
    # Employees
    ("GET",    "/api/employees",              None),
    ("GET",    "/api/employees/EMP-FAKE",     None),
    ("POST",   "/api/employees",              {"name": "x", "email": "x@x.co", "department": "x", "role": "x"}),
    ("PATCH",  "/api/employees/EMP-FAKE",     {"name": "x", "email": "x@x.co", "department": "x", "role": "x"}),
    # Extension pairing-code (admin-only)
    ("POST",   "/api/employees/EMP-FAKE/extension/pairing-code", None),
    # Extension revoke (admin-only)
    ("POST",   "/api/employees/EMP-FAKE/extension/revoke",       None),
    # Analytics
    ("GET",    "/api/analytics/organization", None),
    # Policies
    ("GET",    "/api/policies",               None),
    ("POST",   "/api/policies",               {"name": "x", "category": "x", "risk_min": 90, "risk_max": 95, "action": "BLOCK", "status": "Draft", "description": "x"}),
    ("PATCH",  "/api/policies/POL-FAKE",      {"name": "x", "category": "x", "risk_min": 90, "risk_max": 95, "action": "BLOCK", "status": "Draft", "description": "x"}),
    ("DELETE", "/api/policies/POL-FAKE",      None),
    # Audit log
    ("GET",    "/api/audit-log",              None),
    # Auth session identity
    ("GET",    "/api/auth/me",                None),
]


# ===========================================================================
# TEST GROUP 1 -- Unauthenticated requests to every admin route return 401
# ===========================================================================


@pytest.mark.parametrize("method,path,body", ADMIN_ONLY_ROUTES)
def test_1_unauthenticated_admin_routes_return_401(anon_client, method, path, body):
    """Every admin-only route must reject anonymous requests with HTTP 401."""
    kwargs = {}
    if body is not None:
        kwargs["json"] = body

    response = getattr(anon_client, method.lower())(path, **kwargs)

    assert response.status_code == 401, (
        f"{method} {path} returned {response.status_code}, expected 401.\nBody: {response.text}"
    )
    data = response.json()
    assert "detail" in data
    assert TEST_ADMIN_PASSWORD not in response.text


# ===========================================================================
# TEST GROUP 2 -- Authenticated admin sessions reach protected routes correctly
# ===========================================================================


def test_2a_get_incidents_authenticated(authed_client):
    res = authed_client.get("/api/incidents")
    assert res.status_code == 200
    assert res.json()["success"] is True
    assert "incidents" in res.json()


def test_2b_get_employees_authenticated(authed_client):
    res = authed_client.get("/api/employees")
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_2c_get_detection_rules_authenticated(authed_client):
    res = authed_client.get("/api/detection-rules")
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_2d_get_policies_authenticated(authed_client):
    res = authed_client.get("/api/policies")
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_2e_get_analytics_authenticated(authed_client):
    res = authed_client.get("/api/analytics/organization?range_days=30")
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_2f_get_audit_log_authenticated(authed_client):
    res = authed_client.get("/api/audit-log")
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_2g_create_and_update_employee_authenticated(authed_client):
    """POST and PATCH /api/employees work with admin session."""
    unique_email = f"step7emp-{uuid4().hex[:6]}@example.com"
    create_res = authed_client.post(
        "/api/employees",
        json={"name": "Step7 Employee", "email": unique_email, "department": "QA", "role": "Tester", "extension_active": True, "status": "Active"},
    )
    assert create_res.status_code == 200
    emp_id = create_res.json()["employee"]["employee_id"]

    try:
        update_res = authed_client.patch(
            f"/api/employees/{emp_id}",
            json={"name": "Step7 Updated", "email": unique_email, "department": "QA", "role": "Senior Tester", "extension_active": True, "status": "Active"},
        )
        assert update_res.status_code == 200
        assert update_res.json()["employee"]["role"] == "Senior Tester"
    finally:
        employees_collection.delete_many({"employee_id": emp_id})


def test_2h_create_and_delete_policy_authenticated(authed_client):
    """POST and DELETE /api/policies work with admin session."""
    create_res = authed_client.post(
        "/api/policies",
        json={"name": f"Step7 Policy {uuid4().hex[:4]}", "category": "Test", "risk_min": 96, "risk_max": 99, "action": "WARN", "status": "Draft", "description": "Temp."},
    )
    assert create_res.status_code == 200
    policy_id = create_res.json()["policy"]["policy_id"]

    try:
        del_res = authed_client.delete(f"/api/policies/{policy_id}")
        assert del_res.status_code == 200
        assert del_res.json()["policy_id"] == policy_id
    finally:
        policies_collection.delete_many({"policy_id": policy_id})


def test_2i_incident_status_update_authenticated(authed_client, test_employee):
    """PATCH /api/incidents/{id}/status changes status with admin session."""
    emp_id = test_employee
    inc_id = f"INC-S7-{uuid4().hex[:6].upper()}"
    incidents_collection.insert_one({
        "incident_id": inc_id,
        "timestamp": datetime.now(timezone.utc),
        "status": "Open",
        "employee_id": emp_id,
        "risk_score": 75,
        "risk_level": "HIGH",
        "action": "BLOCK",
        "policy": "Default",
        "detected": True,
        "finding_count": 1,
        "finding_types": ["EMAIL"],
        "context_level": "LOW",
        "context_modifier": 0,
        "context_signals": [],
    })
    try:
        res = authed_client.patch(f"/api/incidents/{inc_id}/status", json={"status": "Acknowledged"})
        assert res.status_code == 200
        assert res.json()["incident"]["status"] == "Acknowledged"
    finally:
        incidents_collection.delete_many({"incident_id": inc_id})


def test_2j_get_employee_by_id_authenticated(authed_client, test_employee):
    """GET /api/employees/{id} returns employee data; credential_hash never exposed."""
    emp_id = test_employee
    res = authed_client.get(f"/api/employees/{emp_id}")
    assert res.status_code == 200
    assert res.json()["employee"]["employee_id"] == emp_id
    assert "credential_hash" not in res.text


def test_2k_pairing_code_generation_authenticated(authed_client, test_employee):
    """POST /api/employees/{id}/extension/pairing-code generates a code."""
    emp_id = test_employee
    res = authed_client.post(f"/api/employees/{emp_id}/extension/pairing-code")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "code" in data
    assert len(data["code"]) > 0


def test_2l_get_auth_me_authenticated(authed_client):
    """GET /api/auth/me returns current authenticated admin session identity."""
    res = authed_client.get("/api/auth/me")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["authenticated"] is True
    assert data["admin"]["email"] == TEST_ADMIN_EMAIL.lower()
    assert data["admin"]["role"] == "admin"


# ===========================================================================
# TEST GROUP 3 -- Logout invalidates protected access
# ===========================================================================


def test_3_logout_then_protected_route_returns_401():
    """After logout, admin-only requests must return 401."""
    session_client = TestClient(app)

    login_res = session_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert login_res.status_code == 200

    assert session_client.get("/api/incidents").status_code == 200

    logout_res = session_client.post("/api/auth/logout")
    assert logout_res.status_code == 200

    assert session_client.get("/api/incidents").status_code == 401
    assert session_client.get("/api/employees").status_code == 401
    assert session_client.get("/api/policies").status_code == 401
    assert session_client.get("/api/audit-log").status_code == 401


# ===========================================================================
# TEST GROUP 4 -- Extension-authenticated routes remain intact
# ===========================================================================


def test_4a_detect_requires_extension_credential(test_employee):
    """POST /api/detect returns 401 without a bearer token."""
    res = TestClient(app).post("/api/detect", json={"text": "test"})
    assert res.status_code == 401


def test_4b_detect_rejects_invalid_extension_credential(test_employee):
    """POST /api/detect returns 401 with an invalid bearer token."""
    res = TestClient(app).post(
        "/api/detect",
        json={"text": "test"},
        headers={"Authorization": "Bearer invalid_not_in_db"},
    )
    assert res.status_code == 401


def test_4c_detect_accepts_valid_extension_credential(paired_extension):
    """POST /api/detect returns 200 with a valid paired credential."""
    _emp_id, credential = paired_extension
    res = TestClient(app).post(
        "/api/detect",
        json={"text": "hello world"},
        headers={"Authorization": f"Bearer {credential}"},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_4d_admin_cookie_does_not_grant_detect_access(authed_client, paired_extension):
    """
    Admin session cookie must NOT grant access to /api/detect.

    /api/detect uses require_extension_protection (bearer token).
    An admin session without an Authorization header must be rejected.
    """
    _emp_id, _credential = paired_extension
    # authed_client has admin cookie but no Authorization: Bearer header
    res = authed_client.post("/api/detect", json={"text": "hello world"})
    assert res.status_code == 401, (
        "Admin cookie must not grant access to extension-only /api/detect"
    )


# ===========================================================================
# TEST GROUP 5 -- Public endpoints remain accessible without a session
# ===========================================================================


def test_5a_root_is_public(anon_client):
    assert anon_client.get("/").status_code == 200


def test_5b_health_is_public(anon_client):
    assert anon_client.get("/api/health").status_code == 200


def test_5c_login_is_public(anon_client):
    res = anon_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_5d_logout_accessible_without_session(anon_client):
    """POST /api/auth/logout must not 401 without a session (graceful no-op)."""
    res = anon_client.post("/api/auth/logout")
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_5e_extension_pair_public_with_valid_code(test_employee, authed_client):
    """POST /api/extension/pair works without an admin session (uses pairing code)."""
    emp_id = test_employee

    code_res = authed_client.post(f"/api/employees/{emp_id}/extension/pairing-code")
    assert code_res.status_code == 200
    code = code_res.json()["code"]

    fresh_client = TestClient(app)
    pair_res = fresh_client.post("/api/extension/pair", json={"code": code})
    assert pair_res.status_code == 200
    assert pair_res.json()["success"] is True
    assert "credential" in pair_res.json()
    assert "credential_hash" not in pair_res.text


def test_5f_extension_pair_rejects_invalid_code(anon_client):
    """POST /api/extension/pair with an invalid code returns 400, not 401."""
    res = anon_client.post("/api/extension/pair", json={"code": "XXXX-XXXX"})
    assert res.status_code == 400


# ===========================================================================
# TEST GROUP 6 -- No sensitive data in error responses
# ===========================================================================


def test_6a_401_responses_contain_no_sensitive_data(anon_client):
    """401 error bodies from admin-only routes must not leak credentials."""
    for method, path, body in ADMIN_ONLY_ROUTES:
        kwargs = {"json": body} if body else {}
        res = getattr(anon_client, method.lower())(path, **kwargs)
        if res.status_code == 401:
            assert TEST_ADMIN_PASSWORD not in res.text, (
                f"Password leaked in 401 from {method} {path}"
            )
            assert "credential_hash" not in res.text, (
                f"credential_hash leaked in 401 from {method} {path}"
            )


def test_6b_invalid_login_does_not_leak_password():
    """POST /api/auth/login with wrong password returns 401 without leaking it."""
    fresh_client = TestClient(app)
    res = fresh_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": "wrong-password-exposed"},
    )
    assert res.status_code == 401
    assert "wrong-password-exposed" not in res.text
    assert TEST_ADMIN_PASSWORD not in res.text


def test_6c_employee_responses_never_expose_credential_hash(authed_client, test_employee):
    """GET /api/employees and GET /api/employees/{id} must never expose credential_hash."""
    emp_id = test_employee
    assert "credential_hash" not in authed_client.get("/api/employees").text
    assert "credential_hash" not in authed_client.get(f"/api/employees/{emp_id}").text
