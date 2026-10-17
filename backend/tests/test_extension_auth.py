import hashlib
from datetime import datetime, timezone

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth import (
    hash_credential,
    require_admin,
    require_extension_auth,
    require_extension_protection,
)
from app.database import (
    audit_logs_collection,
    employees_collection,
    extension_pairing_codes_collection,
    incidents_collection,
)
from app.main import app

# Create a test FastAPI application to test dependencies without exposing debug routes in production
_auth_test_app = FastAPI()


@_auth_test_app.get("/test/extension/context")
def get_context_route(employee: dict = Depends(require_extension_auth)):
    return {"success": True, "employee": employee}


@_auth_test_app.post("/test/extension/inspect")
def inspect_route(
    payload: dict,
    employee: dict = Depends(require_extension_protection),
):
    return {
        "success": True,
        "authenticated_employee_id": employee["employee_id"],
        "client_claimed_id": payload.get("employee_id"),
        "protection_active": employee["extension"]["protection_enabled"],
    }


test_client = TestClient(_auth_test_app)
api_client = TestClient(app)


def mock_admin_user():
    return {"email": "admin@agiesai.test", "role": "admin"}


@pytest.fixture(autouse=True)
def setup_auth_test_data():
    """Ensure clean test state before each test."""
    test_emp_ids = [
        "EMP-AUTH-001",
        "EMP-AUTH-002",
        "EMP-AUTH-003",
        "EMP-AUTH-004",
        "EMP-AUTH-005",
        "EMP-AUTH-006",
        "EMP-AUTH-007",
    ]
    employees_collection.delete_many({"employee_id": {"$in": test_emp_ids}})
    extension_pairing_codes_collection.delete_many({"employee_id": {"$in": test_emp_ids}})
    incidents_collection.delete_many({"employee_id": {"$in": test_emp_ids}})

    now = datetime.now(timezone.utc)
    token_valid = "agies_ext_valid_secret_token_12345"
    token_hash_valid = hash_credential(token_valid)

    # Standard active, paired employee with access & protection enabled
    emp1 = {
        "employee_id": "EMP-AUTH-001",
        "name": "Auth User 1",
        "email": "auth1@example.com",
        "department": "Engineering",
        "role": "Developer",
        "extension_active": True,
        "status": "Active",
        "extension": {
            "paired": True,
            "access_enabled": True,
            "protection_enabled": True,
            "credential_hash": token_hash_valid,
            "paired_at": now,
            "last_seen": now,
            "device_info": "Chrome 120 / macOS",
        },
        "created_at": now,
    }

    # Employee with access_enabled = False
    emp2 = {
        "employee_id": "EMP-AUTH-002",
        "name": "Auth User 2",
        "email": "auth2@example.com",
        "department": "Finance",
        "role": "Analyst",
        "extension_active": True,
        "status": "Active",
        "extension": {
            "paired": True,
            "access_enabled": False,
            "protection_enabled": True,
            "credential_hash": hash_credential("agies_ext_token_disabled_access"),
            "paired_at": now,
            "last_seen": now,
            "device_info": "Chrome 120 / Windows",
        },
        "created_at": now,
    }

    # Employee with protection_enabled = False (inspection operations disabled)
    emp3 = {
        "employee_id": "EMP-AUTH-003",
        "name": "Auth User 3",
        "email": "auth3@example.com",
        "department": "Legal",
        "role": "Counsel",
        "extension_active": True,
        "status": "Active",
        "extension": {
            "paired": True,
            "access_enabled": True,
            "protection_enabled": False,
            "credential_hash": hash_credential("agies_ext_token_protection_disabled"),
            "paired_at": now,
            "last_seen": now,
            "device_info": "Firefox / Linux",
        },
        "created_at": now,
    }

    # Employee with status = 'Disabled'
    emp4 = {
        "employee_id": "EMP-AUTH-004",
        "name": "Auth User 4",
        "email": "auth4@example.com",
        "department": "Sales",
        "role": "Rep",
        "extension_active": True,
        "status": "Disabled",
        "extension": {
            "paired": True,
            "access_enabled": True,
            "protection_enabled": True,
            "credential_hash": hash_credential("agies_ext_token_inactive_emp"),
            "paired_at": now,
            "last_seen": now,
            "device_info": "Edge / Windows",
        },
        "created_at": now,
    }

    # Employee with extension_active = False
    emp5 = {
        "employee_id": "EMP-AUTH-005",
        "name": "Auth User 5",
        "email": "auth5@example.com",
        "department": "Marketing",
        "role": "Designer",
        "extension_active": False,
        "status": "Active",
        "extension": {
            "paired": True,
            "access_enabled": True,
            "protection_enabled": True,
            "credential_hash": hash_credential("agies_ext_token_extension_inactive"),
            "paired_at": now,
            "last_seen": now,
            "device_info": "Safari / macOS",
        },
        "created_at": now,
    }

    # Employee that is unpaired (paired = False)
    emp6 = {
        "employee_id": "EMP-AUTH-006",
        "name": "Auth User 6",
        "email": "auth6@example.com",
        "department": "Security",
        "role": "Auditor",
        "extension_active": True,
        "status": "Active",
        "extension": {
            "paired": False,
            "access_enabled": True,
            "protection_enabled": True,
            "credential_hash": hash_credential("agies_ext_token_unpaired"),
            "paired_at": None,
            "last_seen": None,
            "device_info": None,
        },
        "created_at": now,
    }

    # Second active paired employee (EMP-AUTH-007) for cross-employee IDOR tests
    emp7 = {
        "employee_id": "EMP-AUTH-007",
        "name": "Auth User 7",
        "email": "auth7@example.com",
        "department": "Engineering",
        "role": "Developer",
        "extension_active": True,
        "status": "Active",
        "extension": {
            "paired": True,
            "access_enabled": True,
            "protection_enabled": True,
            "credential_hash": hash_credential("agies_ext_valid_secret_token_77777"),
            "paired_at": now,
            "last_seen": now,
            "device_info": "Chrome / Linux",
        },
        "created_at": now,
    }

    employees_collection.insert_many([emp1, emp2, emp3, emp4, emp5, emp6, emp7])

    yield

    employees_collection.delete_many({"employee_id": {"$in": test_emp_ids}})
    extension_pairing_codes_collection.delete_many({"employee_id": {"$in": test_emp_ids}})
    incidents_collection.delete_many({"employee_id": {"$in": test_emp_ids}})
    audit_logs_collection.delete_many({"employee_id": {"$in": test_emp_ids}})


def test_1_missing_bearer_credential_rejected():
    """TEST 1: Missing bearer credential is rejected with 401 Unauthorized."""
    # No header
    res = test_client.get("/test/extension/context")
    assert res.status_code == 401
    assert "WWW-Authenticate" in res.headers
    assert res.headers["WWW-Authenticate"] == "Bearer"
    assert res.json()["detail"] == "Invalid authentication credentials"

    # Empty header
    res2 = test_client.get("/test/extension/context", headers={"Authorization": ""})
    assert res2.status_code == 401


def test_2_malformed_bearer_header_rejected():
    """TEST 2: Malformed bearer headers are rejected with 401 Unauthorized."""
    malformed_headers = [
        "Bearer",
        "Bearer ",
        "Bearer    ",
        "Basic dXNlcjpwYXNz",
        "Token some_random_token",
        "Bearer token_part1 token_part2",
        "InvalidScheme some_token",
        "random_text",
    ]

    for header_val in malformed_headers:
        res = test_client.get(
            "/test/extension/context",
            headers={"Authorization": header_val},
        )
        assert res.status_code == 401, f"Failed for header: {header_val}"
        assert res.json()["detail"] == "Invalid authentication credentials"
        assert res.headers.get("WWW-Authenticate") == "Bearer"


def test_3_invalid_credential_rejected():
    """TEST 3: Invalid credentials that do not match any stored hash are rejected with generic error."""
    fake_token = "agies_ext_non_existent_token_00000"
    res = test_client.get(
        "/test/extension/context",
        headers={"Authorization": f"Bearer {fake_token}"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid authentication credentials"
    assert res.headers.get("WWW-Authenticate") == "Bearer"


def test_4_valid_paired_credential_authenticates_correct_employee():
    """TEST 4: A valid paired credential authenticates the correct employee context."""
    token = "agies_ext_valid_secret_token_12345"
    res = test_client.get(
        "/test/extension/context",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    emp = data["employee"]

    assert emp["employee_id"] == "EMP-AUTH-001"
    assert emp["name"] == "Auth User 1"
    assert emp["email"] == "auth1@example.com"
    assert emp["department"] == "Engineering"
    assert emp["role"] == "Developer"
    assert emp["status"] == "Active"
    assert emp["extension_active"] is True
    assert emp["extension"]["paired"] is True
    assert emp["extension"]["access_enabled"] is True
    assert emp["extension"]["protection_enabled"] is True
    assert emp["extension"]["device_info"] == "Chrome 120 / macOS"
    # Ensure credential_hash is NOT present in returned context
    assert "credential_hash" not in emp["extension"]
    assert "_id" not in emp


def test_5_client_supplied_employee_id_cannot_spoof_identity():
    """TEST 5: A client-supplied employee ID in payload cannot spoof authenticated identity."""
    token = "agies_ext_valid_secret_token_12345"  # Belongs to EMP-AUTH-001
    attacker_spoof_payload = {
        "employee_id": "EMP-AUTH-002",  # Attempting to impersonate EMP-AUTH-002
        "text": "Inspect this payload",
    }

    res = test_client.post(
        "/test/extension/inspect",
        headers={"Authorization": f"Bearer {token}"},
        json=attacker_spoof_payload,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    # The authenticated identity from server-side DB must be EMP-AUTH-001
    assert data["authenticated_employee_id"] == "EMP-AUTH-001"
    assert data["client_claimed_id"] == "EMP-AUTH-002"


def test_6_unpaired_employee_rejected():
    """TEST 6: An unpaired employee (paired=False) is rejected."""
    token = "agies_ext_token_unpaired"
    res = test_client.get(
        "/test/extension/context",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code in (401, 403)
    assert res.json()["detail"] == "Invalid authentication credentials"


def test_7_disabled_extension_access_rejected():
    """TEST 7: Disabled extension access is rejected with 403 Forbidden."""
    # 7a: access_enabled = False
    res_access = test_client.get(
        "/test/extension/context",
        headers={"Authorization": "Bearer agies_ext_token_disabled_access"},
    )
    assert res_access.status_code == 403
    assert res_access.json()["detail"] == "Extension access disabled"

    # 7b: extension_active = False
    res_ext_active = test_client.get(
        "/test/extension/context",
        headers={"Authorization": "Bearer agies_ext_token_extension_inactive"},
    )
    assert res_ext_active.status_code == 403
    assert res_ext_active.json()["detail"] == "Extension access disabled"

    # 7c: employee status = 'Disabled'
    res_emp_status = test_client.get(
        "/test/extension/context",
        headers={"Authorization": "Bearer agies_ext_token_inactive_emp"},
    )
    assert res_emp_status.status_code == 403
    assert res_emp_status.json()["detail"] == "Extension access disabled"


def test_8_disabled_protection_rejected_for_protected_inspection():
    """TEST 8: Disabled protection allows basic auth but rejects protected inspection operations."""
    token = "agies_ext_token_protection_disabled"

    # Basic extension auth succeeds
    res_auth = test_client.get(
        "/test/extension/context",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_auth.status_code == 200
    assert res_auth.json()["employee"]["employee_id"] == "EMP-AUTH-003"
    assert res_auth.json()["employee"]["extension"]["protection_enabled"] is False

    # Protected inspection dependency rejects with 403
    res_inspect = test_client.post(
        "/test/extension/inspect",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "Confidential query"},
    )
    assert res_inspect.status_code == 403
    assert res_inspect.json()["detail"] == "Extension protection is disabled"


def test_9_revoked_or_replaced_credentials_stop_authenticating():
    """TEST 9: Revoked or replaced credentials stop authenticating once the stored hash changes."""
    old_token = "agies_ext_valid_secret_token_12345"

    # 1. Old token works initially
    res1 = test_client.get(
        "/test/extension/context",
        headers={"Authorization": f"Bearer {old_token}"},
    )
    assert res1.status_code == 200

    # 2. Update employee credential_hash (e.g. after re-pairing or rotation)
    new_token = "agies_ext_new_rotated_token_99999"
    employees_collection.update_one(
        {"employee_id": "EMP-AUTH-001"},
        {"$set": {"extension.credential_hash": hash_credential(new_token)}},
    )

    # 3. Old token is immediately rejected
    res_old = test_client.get(
        "/test/extension/context",
        headers={"Authorization": f"Bearer {old_token}"},
    )
    assert res_old.status_code == 401
    assert res_old.json()["detail"] == "Invalid authentication credentials"

    # 4. New token authenticates successfully
    res_new = test_client.get(
        "/test/extension/context",
        headers={"Authorization": f"Bearer {new_token}"},
    )
    assert res_new.status_code == 200
    assert res_new.json()["employee"]["employee_id"] == "EMP-AUTH-001"


def test_10_credentials_and_hashes_not_exposed_in_api_responses_or_logs():
    """TEST 10: Plaintext credentials and hashes are never exposed in employee responses or audit logs."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        # GET /api/employees
        res_list = api_client.get("/api/employees")
        assert res_list.status_code == 200
        for emp in res_list.json()["employees"]:
            ext = emp.get("extension") or {}
            assert "credential_hash" not in ext

        # GET /api/employees/EMP-AUTH-001
        res_single = api_client.get("/api/employees/EMP-AUTH-001")
        assert res_single.status_code == 200
        ext_single = res_single.json()["employee"].get("extension") or {}
        assert "credential_hash" not in ext_single

        # Check authenticated context dependency response
        res_auth = test_client.get(
            "/test/extension/context",
            headers={"Authorization": "Bearer agies_ext_valid_secret_token_12345"},
        )
        assert res_auth.status_code == 200
        auth_ext = res_auth.json()["employee"].get("extension") or {}
        assert "credential_hash" not in auth_ext

        # Audit logs check: ensure EXTENSION_PAIRED or other logs do not contain raw token or hash
        logs = list(audit_logs_collection.find({}, {"_id": 0}))
        for log in logs:
            assert "agies_ext_valid_secret_token_12345" not in str(log)
    finally:
        app.dependency_overrides.pop(require_admin, None)


def test_11_end_to_end_pairing_to_bearer_authentication():
    """TEST 11: Full workflow from pairing code generation -> pairing -> bearer authenticated request."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        # 1. Admin generates pairing code for EMP-AUTH-001
        code_res = api_client.post("/api/employees/EMP-AUTH-001/extension/pairing-code")
        assert code_res.status_code == 200
        code = code_res.json()["code"]

        # 2. Extension redeems pairing code
        pair_res = api_client.post(
            "/api/extension/pair",
            json={"code": code, "device_info": "Chrome Extension v2.1.0"},
        )
        assert pair_res.status_code == 200
        issued_credential = pair_res.json()["credential"]
        assert issued_credential.startswith("agies_ext_")

        # 3. Extension uses issued bearer credential to authenticate
        auth_res = test_client.get(
            "/test/extension/context",
            headers={"Authorization": f"Bearer {issued_credential}"},
        )
        assert auth_res.status_code == 200
        auth_data = auth_res.json()["employee"]
        assert auth_data["employee_id"] == "EMP-AUTH-001"
        assert auth_data["extension"]["paired"] is True
        assert auth_data["extension"]["device_info"] == "Chrome Extension v2.1.0"
    finally:
        app.dependency_overrides.pop(require_admin, None)


def test_12_detect_unauthenticated_rejected():
    """TEST 12: Unauthenticated POST /api/detect requests are rejected with 401."""
    # No Authorization header
    res_no_auth = api_client.post(
        "/api/detect",
        json={"text": "Check this text for security leaks", "platform": "ChatGPT"},
    )
    assert res_no_auth.status_code == 401
    assert res_no_auth.headers.get("WWW-Authenticate") == "Bearer"
    assert res_no_auth.json()["detail"] == "Invalid authentication credentials"

    # Malformed header
    res_malformed = api_client.post(
        "/api/detect",
        headers={"Authorization": "Basic dXNlcjpwYXNz"},
        json={"text": "Check this text for security leaks"},
    )
    assert res_malformed.status_code == 401

    # Invalid credential
    res_invalid = api_client.post(
        "/api/detect",
        headers={"Authorization": "Bearer agies_ext_invalid_fake_token"},
        json={"text": "Check this text for security leaks"},
    )
    assert res_invalid.status_code == 401


def test_13_detect_valid_paired_credential_success():
    """TEST 13: Valid paired credential allows sensitive detection requests."""
    token = "agies_ext_valid_secret_token_12345"  # EMP-AUTH-001
    res = api_client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "Help me write a professional email.", "platform": "Claude"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["employee_id"] == "EMP-AUTH-001"
    assert data["employee_name"] == "Auth User 1"
    assert data["platform"] == "Claude"
    assert "detection" in data
    assert "risk" in data
    assert "policy" in data


def test_14_detect_client_supplied_employee_id_ignored_no_spoofing():
    """TEST 14: Client-supplied employee_id in payload cannot spoof identity on /api/detect."""
    token = "agies_ext_valid_secret_token_12345"  # EMP-AUTH-001
    # Attacker passes employee_id for EMP-AUTH-002 in body
    res = api_client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "text": "Send secret API key sk-live123456789012345678 to assistant",
            "employee_id": "EMP-AUTH-002",
            "platform": "ChatGPT",
        },
    )
    assert res.status_code == 200
    data = res.json()
    # The authenticated identity must be derived strictly from the Bearer token (EMP-AUTH-001)
    assert data["employee_id"] == "EMP-AUTH-001"
    assert data["employee_name"] == "Auth User 1"

    # If an incident was created, it must record EMP-AUTH-001
    incident_id = data.get("incident_id")
    if incident_id:
        incident = incidents_collection.find_one({"incident_id": incident_id})
        assert incident["employee_id"] == "EMP-AUTH-001"


def test_15_detect_disabled_protection_rejected():
    """TEST 15: Extension with protection_enabled=False cannot submit /api/detect requests."""
    token = "agies_ext_token_protection_disabled"  # EMP-AUTH-003 (protection_enabled=False)
    res = api_client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "Scan this text"},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "Extension protection is disabled"


def test_16_detect_disabled_access_or_unpaired_rejected():
    """TEST 16: Extensions with disabled access, inactive employee status, or unpaired state are rejected."""
    # 1. access_enabled = False (EMP-AUTH-002)
    res_no_access = api_client.post(
        "/api/detect",
        headers={"Authorization": "Bearer agies_ext_token_disabled_access"},
        json={"text": "Scan text"},
    )
    assert res_no_access.status_code == 403
    assert res_no_access.json()["detail"] == "Extension access disabled"

    # 2. status = 'Disabled' (EMP-AUTH-004)
    res_disabled_emp = api_client.post(
        "/api/detect",
        headers={"Authorization": "Bearer agies_ext_token_inactive_emp"},
        json={"text": "Scan text"},
    )
    assert res_disabled_emp.status_code == 403
    assert res_disabled_emp.json()["detail"] == "Extension access disabled"

    # 3. extension_active = False (EMP-AUTH-005)
    res_ext_inactive = api_client.post(
        "/api/detect",
        headers={"Authorization": "Bearer agies_ext_token_extension_inactive"},
        json={"text": "Scan text"},
    )
    assert res_ext_inactive.status_code == 403
    assert res_ext_inactive.json()["detail"] == "Extension access disabled"

    # 4. paired = False (EMP-AUTH-006)
    res_unpaired = api_client.post(
        "/api/detect",
        headers={"Authorization": "Bearer agies_ext_token_unpaired"},
        json={"text": "Scan text"},
    )
    assert res_unpaired.status_code in (401, 403)
    assert res_unpaired.json()["detail"] == "Invalid authentication credentials"


def test_17_detect_decisions_and_privacy_preserved():
    """TEST 17: Preserves policy decision logic (ALLOW/WARN/BLOCK) and privacy (no prompt/secret logging)."""
    token = "agies_ext_valid_secret_token_12345"  # EMP-AUTH-001

    # Case 1: Safe text -> ALLOW decision, no incident created
    res_safe = api_client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "Write a short poem about nature."},
    )
    assert res_safe.status_code == 200
    safe_data = res_safe.json()
    assert safe_data["policy"]["decision"] == "ALLOW"
    assert safe_data["incident_id"] is None

    # Case 2: Sensitive text (Credit Card) -> BLOCK decision, incident created
    secret_prompt = "Payment card number is 4111 1111 1111 1111 for checkout"
    res_block = api_client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": secret_prompt},
    )
    assert res_block.status_code == 200
    block_data = res_block.json()
    assert block_data["policy"]["decision"] == "BLOCK"
    incident_id = block_data["incident_id"]
    assert incident_id is not None

    # Verify incident metadata and privacy: raw text is NEVER stored in database
    incident_doc = incidents_collection.find_one({"incident_id": incident_id})
    assert incident_doc is not None
    assert incident_doc["employee_id"] == "EMP-AUTH-001"
    assert "4111 1111 1111 1111" not in str(incident_doc)
    assert secret_prompt not in str(incident_doc)
    assert "text" not in incident_doc

    # Verify audit log privacy
    audit_log = audit_logs_collection.find_one({"incident_id": incident_id})
    assert audit_log is not None
    assert "4111 1111 1111 1111" not in str(audit_log)
    assert secret_prompt not in str(audit_log)


def _create_test_warn_incident(incident_id: str, employee_id: str) -> dict:
    inc = {
        "incident_id": incident_id,
        "timestamp": datetime.now(timezone.utc),
        "status": "Open",
        "platform": "ChatGPT",
        "employee_id": employee_id,
        "employee_name": f"User {employee_id}",
        "risk_score": 65,
        "risk_level": "MEDIUM",
        "action": "WARN",
        "policy": "Default",
        "policy_message": "Sensitive warning",
        "detected": True,
        "finding_count": 1,
        "finding_types": ["EMAIL"],
    }
    incidents_collection.insert_one(inc)
    return inc


# ===========================================================================
# Incident-Action Authorization Regression Tests
# ===========================================================================


def test_18_incident_action_administrator_success():
    """Admin session successfully records incident action on WARN incident."""
    inc_id = "INC-AUTH-WARN-001"
    _create_test_warn_incident(inc_id, "EMP-AUTH-001")
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = api_client.post(
            f"/api/incidents/{inc_id}/action",
            json={"action": "CONTINUE_ANYWAY"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["incident_id"] == inc_id
        assert data["action"] == "CONTINUE_ANYWAY"
        assert data["message"] == "Incident action recorded"

        # Verify audit log entry
        audit_doc = audit_logs_collection.find_one(
            {"incident_id": inc_id, "event": "CONTINUE_ANYWAY"}
        )
        assert audit_doc is not None
        assert audit_doc["employee_id"] == "EMP-AUTH-001"
    finally:
        app.dependency_overrides.clear()
        incidents_collection.delete_many({"incident_id": inc_id})
        audit_logs_collection.delete_many({"incident_id": inc_id})


def test_19_incident_action_extension_owner_success():
    """Paired extension owner records action on their own WARN incident."""
    inc_id = "INC-AUTH-WARN-002"
    _create_test_warn_incident(inc_id, "EMP-AUTH-001")
    token = "agies_ext_valid_secret_token_12345"  # EMP-AUTH-001
    try:
        res = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={"Authorization": f"Bearer {token}"},
            json={"action": "WARNING_CANCELLED"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["incident_id"] == inc_id
        assert data["action"] == "WARNING_CANCELLED"

        # Verify audit log created with employee's identity
        audit_doc = audit_logs_collection.find_one(
            {"incident_id": inc_id, "event": "WARNING_CANCELLED"}
        )
        assert audit_doc is not None
        assert audit_doc["employee_id"] == "EMP-AUTH-001"

        # Confirm incident document status was NOT modified
        inc_doc = incidents_collection.find_one({"incident_id": inc_id})
        assert inc_doc["status"] == "Open"
    finally:
        incidents_collection.delete_many({"incident_id": inc_id})
        audit_logs_collection.delete_many({"incident_id": inc_id})


def test_20_incident_action_cross_employee_rejected():
    """Extension caller cannot record action on another employee's incident (IDOR prevented)."""
    inc_id = "INC-AUTH-WARN-003"
    _create_test_warn_incident(inc_id, "EMP-AUTH-001")
    # EMP-AUTH-007 attempts to mutate EMP-AUTH-001's incident
    token_other = "agies_ext_valid_secret_token_77777"  # EMP-AUTH-007
    try:
        res = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={"Authorization": f"Bearer {token_other}"},
            json={"action": "CONTINUE_ANYWAY"},
        )
        assert res.status_code == 403
        assert "another employee" in res.json()["detail"].lower()

        # Verify zero audit log mutation
        audit_doc = audit_logs_collection.find_one({"incident_id": inc_id})
        assert audit_doc is None
    finally:
        incidents_collection.delete_many({"incident_id": inc_id})


def test_21_incident_action_client_supplied_id_ignored():
    """Client-supplied employee_id in payload cannot spoof identity or bypass ownership check."""
    inc_id = "INC-AUTH-WARN-004"
    _create_test_warn_incident(inc_id, "EMP-AUTH-001")
    # EMP-AUTH-007 supplies EMP-AUTH-001 in body
    token_other = "agies_ext_valid_secret_token_77777"
    try:
        res = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={"Authorization": f"Bearer {token_other}"},
            json={"action": "CONTINUE_ANYWAY", "employee_id": "EMP-AUTH-001"},
        )
        assert res.status_code == 403
    finally:
        incidents_collection.delete_many({"incident_id": inc_id})


def test_22_incident_action_invalid_and_malformed_bearer_rejected_no_fallback():
    """Invalid or malformed bearer is rejected with 401 and never falls back to admin session."""
    inc_id = "INC-AUTH-WARN-005"
    _create_test_warn_incident(inc_id, "EMP-AUTH-001")
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        # Malformed Authorization header
        res_malformed = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
            json={"action": "CONTINUE_ANYWAY"},
        )
        assert res_malformed.status_code == 401

        # Invalid token value
        res_invalid = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={"Authorization": "Bearer agies_ext_non_existent_token"},
            json={"action": "CONTINUE_ANYWAY"},
        )
        assert res_invalid.status_code == 401
        assert res_invalid.json()["detail"] == "Invalid authentication credentials"
    finally:
        app.dependency_overrides.clear()
        incidents_collection.delete_many({"incident_id": inc_id})


def test_23_incident_action_disabled_and_inactive_extension_rejected():
    """De-provisioned or disabled extension bearer is rejected with 401 or 403."""
    inc_id = "INC-AUTH-WARN-006"
    _create_test_warn_incident(inc_id, "EMP-AUTH-004")
    try:
        # Inactive/disabled employee (EMP-AUTH-004) -> 403
        res_disabled = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={"Authorization": "Bearer agies_ext_token_inactive_emp"},
            json={"action": "CONTINUE_ANYWAY"},
        )
        assert res_disabled.status_code == 403

        # Access revoked (EMP-AUTH-002, access_enabled=False) -> 403
        res_revoked = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={"Authorization": "Bearer agies_ext_token_disabled_access"},
            json={"action": "CONTINUE_ANYWAY"},
        )
        assert res_revoked.status_code == 403

        # Unpaired (EMP-AUTH-006) -> 401
        res_unpaired = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={"Authorization": "Bearer agies_ext_token_unpaired"},
            json={"action": "CONTINUE_ANYWAY"},
        )
        assert res_unpaired.status_code == 401
    finally:
        incidents_collection.delete_many({"incident_id": inc_id})


def test_24_incident_action_missing_and_non_warn_incident_rejected():
    """Non-existent incident returns 404; non-WARN incident returns 400."""
    token = "agies_ext_valid_secret_token_12345"
    # Missing incident -> 404
    res_404 = api_client.post(
        "/api/incidents/INC-NONEXISTENT-99999/action",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "CONTINUE_ANYWAY"},
    )
    assert res_404.status_code == 404
    assert res_404.json()["detail"] == "Incident not found"

    # Non-WARN incident (e.g. BLOCK) -> 400
    inc_id = "INC-AUTH-BLOCK-001"
    incidents_collection.insert_one({
        "incident_id": inc_id,
        "employee_id": "EMP-AUTH-001",
        "action": "BLOCK",
        "status": "Open",
    })
    try:
        res_400 = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={"Authorization": f"Bearer {token}"},
            json={"action": "CONTINUE_ANYWAY"},
        )
        assert res_400.status_code == 400
        assert "only valid for WARN" in res_400.json()["detail"]
    finally:
        incidents_collection.delete_many({"incident_id": inc_id})


def test_25_incident_action_invalid_action_rejected():
    """Action value not in ALLOWED_INCIDENT_ACTIONS is rejected with 400."""
    token = "agies_ext_valid_secret_token_12345"
    res = api_client.post(
        "/api/incidents/INC-FAKE/action",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "UNAUTHORIZED_ACTION"},
    )
    assert res.status_code == 400
    assert "Invalid action" in res.json()["detail"]


def test_26_incident_action_admin_csrf_protection_still_enforced():
    """Cookie-based admin request with untrusted Origin is blocked by CSRF (403); trusted Origin succeeds."""
    inc_id = "INC-AUTH-WARN-007"
    _create_test_warn_incident(inc_id, "EMP-AUTH-001")
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        # 1. Untrusted Origin + Cookie auth -> 403 CSRF verification failed
        res_csrf = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={"Origin": "http://evil-attacker.example"},
            json={"action": "CONTINUE_ANYWAY"},
        )
        assert res_csrf.status_code == 403
        assert res_csrf.json()["detail"] == "CSRF verification failed"

        # 2. Trusted Origin + Cookie auth -> 200 OK
        res_trusted = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={"Origin": "http://localhost:5173"},
            json={"action": "CONTINUE_ANYWAY"},
        )
        assert res_trusted.status_code == 200
        assert res_trusted.json()["success"] is True

        # 3. Bearer auth from untrusted Origin -> allowed through to Bearer auth
        token = "agies_ext_valid_secret_token_12345"
        res_bearer_origin = api_client.post(
            f"/api/incidents/{inc_id}/action",
            headers={
                "Authorization": f"Bearer {token}",
                "Origin": "chrome-extension://abcdefghijklmnop",
            },
            json={"action": "WARNING_CANCELLED"},
        )
        assert res_bearer_origin.status_code == 200
    finally:
        app.dependency_overrides.clear()
        incidents_collection.delete_many({"incident_id": inc_id})
        audit_logs_collection.delete_many({"incident_id": inc_id})


def test_21_detect_all_seven_platforms_accepted():
    """TEST 21: Verify all seven supported platform identifiers are accepted on /api/detect."""
    token = "agies_ext_valid_secret_token_12345"  # EMP-AUTH-001
    platforms = [
        "ChatGPT",
        "Gemini",
        "Claude",
        "Copilot",
        "Perplexity",
        "DeepSeek",
        "Grok",
    ]

    for plat in platforms:
        res = api_client.post(
            "/api/detect",
            headers={"Authorization": f"Bearer {token}"},
            json={"text": f"Analyze this standard query on {plat}.", "platform": plat},
        )
        assert res.status_code == 200, f"Failed for platform {plat}"
        data = res.json()
        assert data["success"] is True
        assert data["platform"] == plat, f"Expected {plat}, got {data['platform']}"
        assert data["employee_id"] == "EMP-AUTH-001"


def test_22_detect_unknown_platform_fallback_to_chatgpt():
    """TEST 22: Unrecognized or invalid platform identifiers fall back safely to ChatGPT."""
    token = "agies_ext_valid_secret_token_12345"  # EMP-AUTH-001
    res = api_client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "Query for unknown engine.", "platform": "UnsupportedAIEngine"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["platform"] == "ChatGPT", "Unknown platform must safely default to ChatGPT"

