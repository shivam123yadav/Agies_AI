"""Tests for extension credential revocation feature."""

import hashlib
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_admin
from app.database import (
    employees_collection,
    extension_pairing_codes_collection,
    audit_logs_collection,
)

client = TestClient(app)


def mock_admin_user():
    return {"email": "asce@admin.co", "role": "admin"}


@pytest.fixture(autouse=True)
def setup_test_data():
    """Ensure clean test data state before and after each test."""
    test_emp_ids = ["EMP-REVOKE-001", "EMP-REVOKE-002"]
    employees_collection.delete_many({"employee_id": {"$in": test_emp_ids}})
    extension_pairing_codes_collection.delete_many({"employee_id": {"$in": test_emp_ids}})
    audit_logs_collection.delete_many({"employee_id": {"$in": test_emp_ids}})

    now = datetime.now(timezone.utc)
    emp1 = {
        "employee_id": "EMP-REVOKE-001",
        "name": "Revoke Test User 1",
        "email": "revoke1@example.com",
        "department": "Engineering",
        "role": "Developer",
        "extension_active": False,
        "status": "Active",
        "extension": {
            "paired": False,
            "access_enabled": True,
            "protection_enabled": True,
            "credential_hash": None,
            "paired_at": None,
            "revoked_at": None,
            "last_seen": None,
            "device_info": None,
        },
        "created_at": now,
    }
    emp2 = {
        "employee_id": "EMP-REVOKE-002",
        "name": "Revoke Test User 2",
        "email": "revoke2@example.com",
        "department": "Finance",
        "role": "Analyst",
        "extension_active": False,
        "status": "Active",
        "extension": {
            "paired": False,
            "access_enabled": True,
            "protection_enabled": True,
            "credential_hash": None,
            "paired_at": None,
            "revoked_at": None,
            "last_seen": None,
            "device_info": None,
        },
        "created_at": now,
    }
    employees_collection.insert_many([emp1, emp2])

    yield

    employees_collection.delete_many({"employee_id": {"$in": test_emp_ids}})
    extension_pairing_codes_collection.delete_many({"employee_id": {"$in": test_emp_ids}})
    audit_logs_collection.delete_many({"employee_id": {"$in": test_emp_ids}})


def _admin_generate_code(employee_id: str) -> str:
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = client.post(f"/api/employees/{employee_id}/extension/pairing-code")
        assert res.status_code == 200
        return res.json()["code"]
    finally:
        app.dependency_overrides.clear()


def _pair_employee(employee_id: str) -> str:
    code = _admin_generate_code(employee_id)
    res = client.post("/api/extension/pair", json={"code": code})
    assert res.status_code == 200
    return res.json()["credential"]


def test_1_successful_administrator_revocation():
    """TEST 1: Admin successfully revokes an employee's active extension credential."""
    emp_id = "EMP-REVOKE-001"
    _pair_employee(emp_id)

    emp_before = employees_collection.find_one({"employee_id": emp_id})
    assert emp_before["extension"]["paired"] is True
    assert emp_before["extension"]["credential_hash"] is not None
    assert emp_before["extension_active"] is True

    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["employee_id"] == emp_id
    finally:
        app.dependency_overrides.clear()

    emp_after = employees_collection.find_one({"employee_id": emp_id})
    assert emp_after["extension"]["paired"] is False
    assert emp_after["extension"]["credential_hash"] is None
    assert emp_after["extension"]["paired_at"] is None
    assert emp_after["extension"]["revoked_at"] is not None
    assert emp_after["extension_active"] is False


def test_2_revoked_credential_rejected_on_next_authenticated_request():
    """TEST 2: The previously valid Bearer credential is immediately rejected with 401."""
    emp_id = "EMP-REVOKE-001"
    credential = _pair_employee(emp_id)

    # 1. Valid before revocation
    res_valid = client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {credential}"},
        json={"text": "Reviewing standard quarterly reports.", "employee_id": emp_id, "platform": "ChatGPT"},
    )
    assert res_valid.status_code == 200

    # 2. Revoke credential
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res_revoke = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res_revoke.status_code == 200
    finally:
        app.dependency_overrides.clear()

    # 3. Old credential is rejected immediately
    res_rejected = client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {credential}"},
        json={"text": "Reviewing standard quarterly reports.", "employee_id": emp_id, "platform": "ChatGPT"},
    )
    assert res_rejected.status_code == 401
    assert res_rejected.json()["detail"] == "Invalid authentication credentials"


def test_3_revoking_one_employee_does_not_affect_another():
    """TEST 3: Revoking Employee 1 does not invalidate Employee 2's credential."""
    emp1 = "EMP-REVOKE-001"
    emp2 = "EMP-REVOKE-002"
    cred1 = _pair_employee(emp1)
    cred2 = _pair_employee(emp2)

    # Revoke employee 1
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = client.post(f"/api/employees/{emp1}/extension/revoke")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()

    # Employee 1 fails
    res1 = client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {cred1}"},
        json={"text": "Query 1", "employee_id": emp1, "platform": "ChatGPT"},
    )
    assert res1.status_code == 401

    # Employee 2 continues to succeed
    res2 = client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {cred2}"},
        json={"text": "Query 2", "employee_id": emp2, "platform": "ChatGPT"},
    )
    assert res2.status_code == 200

    emp2_doc = employees_collection.find_one({"employee_id": emp2})
    assert emp2_doc["extension"]["paired"] is True
    assert emp2_doc["extension_active"] is True


def test_4_revocation_of_already_unpaired_employee_is_safe():
    """TEST 4: Revoking an already-unpaired employee succeeds safely and idempotently."""
    emp_id = "EMP-REVOKE-001"
    # Employee 1 is initially unpaired
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res1 = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res1.status_code == 200
        assert res1.json()["success"] is True

        # Second call is idempotent and safe
        res2 = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res2.status_code == 200
        assert res2.json()["success"] is True
    finally:
        app.dependency_overrides.clear()

    emp_doc = employees_collection.find_one({"employee_id": emp_id})
    assert emp_doc["extension"]["paired"] is False
    assert emp_doc["extension"]["credential_hash"] is None


def test_5_unauthenticated_revocation_request_rejected():
    """TEST 5: Unauthenticated requests cannot invoke the revocation endpoint."""
    app.dependency_overrides.clear()
    res = client.post("/api/employees/EMP-REVOKE-001/extension/revoke")
    assert res.status_code == 401
    assert "Admin authentication required" in res.json()["detail"]


def test_6_extension_bearer_credential_cannot_authorize_revocation():
    """TEST 6: An extension Bearer credential cannot authorize revocation."""
    emp_id = "EMP-REVOKE-001"
    credential = _pair_employee(emp_id)

    app.dependency_overrides.clear()
    res = client.post(
        f"/api/employees/{emp_id}/extension/revoke",
        headers={"Authorization": f"Bearer {credential}"},
    )
    assert res.status_code == 401
    assert "Admin authentication required" in res.json()["detail"]


def test_7_pending_pairing_codes_are_invalidated_by_revocation():
    """TEST 7: Revocation invalidates all pending unused pairing codes for that employee."""
    emp_id = "EMP-REVOKE-001"
    code = _admin_generate_code(emp_id)

    # Revoke before pairing
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res_revoke = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res_revoke.status_code == 200
    finally:
        app.dependency_overrides.clear()

    # Attempting to pair using the pre-revocation code must fail
    res_pair = client.post("/api/extension/pair", json={"code": code})
    assert res_pair.status_code == 400
    assert "Invalid or expired pairing code" in res_pair.json()["detail"]


def test_8_new_pairing_code_works_after_revocation():
    """TEST 8: Re-pairing with a new pairing code succeeds normally after revocation."""
    emp_id = "EMP-REVOKE-001"
    _pair_employee(emp_id)

    # 1. Revoke
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res_revoke = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res_revoke.status_code == 200
    finally:
        app.dependency_overrides.clear()

    # 2. Generate new code after revocation
    new_code = _admin_generate_code(emp_id)

    # 3. Redeem new code
    res_pair = client.post("/api/extension/pair", json={"code": new_code})
    assert res_pair.status_code == 200
    new_cred = res_pair.json()["credential"]

    # 4. New credential works
    res_detect = client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {new_cred}"},
        json={"text": "Post-revocation analysis query.", "employee_id": emp_id, "platform": "ChatGPT"},
    )
    assert res_detect.status_code == 200

    emp_doc = employees_collection.find_one({"employee_id": emp_id})
    assert emp_doc["extension"]["paired"] is True
    assert emp_doc["extension_active"] is True


def test_9_audit_log_records_revocation_without_secrets():
    """TEST 9: Revocation is audit logged with metadata but zero credentials or tokens."""
    emp_id = "EMP-REVOKE-001"
    _pair_employee(emp_id)

    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()

    log_entry = audit_logs_collection.find_one(
        {"employee_id": emp_id, "event": "EXTENSION_CREDENTIAL_REVOKED"}
    )
    assert log_entry is not None
    assert log_entry["employee_id"] == emp_id
    assert log_entry["employee_name"] == "Revoke Test User 1"
    assert log_entry["admin_email"] == "asce@admin.co"
    assert "timestamp" in log_entry

    # Ensure no secrets, tokens, or hashes are present in the audit log document
    log_str = str(log_entry).lower()
    assert "credential" not in log_str or "revoke_extension_credential" in log_str
    assert "credential_hash" not in log_str
    assert "code_hash" not in log_str


def test_10_revocation_nonexistent_employee_returns_404():
    """TEST 10: Revoking a nonexistent employee returns 404 Not Found."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = client.post("/api/employees/EMP-NONEXISTENT-999/extension/revoke")
        assert res.status_code == 404
        assert "Employee not found" in res.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_11_stale_pairing_code_rejected_even_if_invalidation_fails(monkeypatch):
    """TEST 11: Stale code generated before revocation CANNOT be redeemed after revocation,
    even if pending-code invalidation failed or was bypassed.
    """
    emp_id = "EMP-REVOKE-001"
    code = _admin_generate_code(emp_id)

    real_update_many = extension_pairing_codes_collection.update_many

    def failing_update_many(*args, **kwargs):
        raise RuntimeError("Simulated failure during pending code invalidation")

    monkeypatch.setattr(extension_pairing_codes_collection, "update_many", failing_update_many)

    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        with pytest.raises(RuntimeError):
            client.post(f"/api/employees/{emp_id}/extension/revoke")
    finally:
        app.dependency_overrides.clear()
        monkeypatch.setattr(extension_pairing_codes_collection, "update_many", real_update_many)

    code_doc = extension_pairing_codes_collection.find_one({"employee_id": emp_id, "used": False})
    assert code_doc is not None
    assert code_doc["used"] is False

    emp_doc = employees_collection.find_one({"employee_id": emp_id})
    assert emp_doc["extension"]["revoked_at"] is not None

    res_pair = client.post("/api/extension/pair", json={"code": code})
    assert res_pair.status_code == 400
    assert "Invalid or expired pairing code" in res_pair.json()["detail"]

    emp_after = employees_collection.find_one({"employee_id": emp_id})
    assert emp_after["extension"]["paired"] is False
    assert emp_after["extension"]["credential_hash"] is None
    assert emp_after["extension_active"] is False


def test_12_code_created_before_revocation_explicit_timestamp_guard():
    """TEST 12: A pairing code whose created_at <= employee revoked_at is rejected even if used=False."""
    emp_id = "EMP-REVOKE-001"
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()

    emp_doc = employees_collection.find_one({"employee_id": emp_id})
    revoked_at = emp_doc["extension"]["revoked_at"]

    stale_code = "STAL-0001"
    code_hash = hashlib.sha256(stale_code.encode("utf-8")).hexdigest()
    from datetime import timedelta
    earlier_time = revoked_at - timedelta(seconds=10)
    extension_pairing_codes_collection.insert_one({
        "employee_id": emp_id,
        "code_hash": code_hash,
        "created_at": earlier_time,
        "expires_at": revoked_at + timedelta(minutes=10),
        "used": False,
        "expected_paired_at": None,
    })

    res = client.post("/api/extension/pair", json={"code": stale_code})
    assert res.status_code == 400
    assert "Invalid or expired pairing code" in res.json()["detail"]

    emp_after = employees_collection.find_one({"employee_id": emp_id})
    assert emp_after["extension"]["paired"] is False
    assert emp_after["extension"]["credential_hash"] is None
    assert emp_after["extension_active"] is False


def test_13_fresh_code_after_revocation_redeems_normally():
    """TEST 13: A fresh pairing code generated strictly after revocation redeems normally."""
    emp_id = "EMP-REVOKE-001"
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res_rev = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res_rev.status_code == 200
    finally:
        app.dependency_overrides.clear()

    fresh_code = _admin_generate_code(emp_id)

    res_pair = client.post("/api/extension/pair", json={"code": fresh_code})
    assert res_pair.status_code == 200
    new_cred = res_pair.json()["credential"]

    res_detect = client.post(
        "/api/detect",
        headers={"Authorization": f"Bearer {new_cred}"},
        json={"text": "Post-revocation clean request.", "employee_id": emp_id, "platform": "ChatGPT"},
    )
    assert res_detect.status_code == 200

    emp_doc = employees_collection.find_one({"employee_id": emp_id})
    assert emp_doc["extension"]["paired"] is True
    assert emp_doc["extension_active"] is True


def test_14_concurrent_revocation_race_triggers_occ_conflict(monkeypatch):
    """TEST 14: If an administrator revokes while pairing is in-flight (after watermark check,
    before employee update), OCC detects modified revoked_at and fails safely with HTTP 409.
    """
    import app.main as main_module
    emp_id = "EMP-REVOKE-001"

    # 1. Initial revocation
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res_rev = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res_rev.status_code == 200
    finally:
        app.dependency_overrides.clear()

    # 2. Fresh code generated strictly AFTER the initial revocation
    fresh_code = _admin_generate_code(emp_id)

    # 3. Monkeypatch generate_extension_credential to simulate a second revocation happening
    # after watermark check but before employees_collection.update_one
    real_generate_credential = main_module.generate_extension_credential

    def concurrent_revoking_generator():
        # Perform concurrent revocation in DB
        now_race = datetime.now(timezone.utc)
        employees_collection.update_one(
            {"employee_id": emp_id},
            {"$set": {"extension.revoked_at": now_race, "extension.credential_hash": None, "extension_active": False}},
        )
        return real_generate_credential()

    monkeypatch.setattr(main_module, "generate_extension_credential", concurrent_revoking_generator)

    # 4. Attempt to redeem: watermark check passes, but OCC filter detects altered revoked_at
    res = client.post("/api/extension/pair", json={"code": fresh_code})
    assert res.status_code == 409
    assert "Pairing conflict" in res.json()["detail"]

    # 5. Verify employee remains disabled and un-paired
    emp_after = employees_collection.find_one({"employee_id": emp_id})
    assert emp_after["extension_active"] is False
    assert emp_after["extension"]["paired"] is False


def test_15_code_with_missing_created_at_rejected_for_revoked_employee():
    """TEST 15: A previously revoked employee cannot redeem a pairing code missing created_at."""
    emp_id = "EMP-REVOKE-001"
    # Revoke employee
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()

    emp_doc = employees_collection.find_one({"employee_id": emp_id})
    revoked_at = emp_doc["extension"]["revoked_at"]

    # Insert unredeemed pairing code missing created_at field
    code_no_ts = "NOTS-1111"
    code_hash = hashlib.sha256(code_no_ts.encode("utf-8")).hexdigest()
    from datetime import timedelta
    extension_pairing_codes_collection.insert_one({
        "employee_id": emp_id,
        "code_hash": code_hash,
        "expires_at": revoked_at + timedelta(minutes=10),
        "used": False,
        "expected_paired_at": None,
    })

    res = client.post("/api/extension/pair", json={"code": code_no_ts})
    assert res.status_code == 400
    assert "Invalid or expired pairing code" in res.json()["detail"]

    emp_after = employees_collection.find_one({"employee_id": emp_id})
    assert emp_after["extension"]["paired"] is False
    assert emp_after["extension_active"] is False


def test_16_code_with_malformed_created_at_rejected_for_revoked_employee():
    """TEST 16: A previously revoked employee cannot redeem a pairing code with malformed created_at."""
    emp_id = "EMP-REVOKE-001"
    # Revoke employee
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = client.post(f"/api/employees/{emp_id}/extension/revoke")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()

    emp_doc = employees_collection.find_one({"employee_id": emp_id})
    revoked_at = emp_doc["extension"]["revoked_at"]

    # Insert unredeemed pairing code with unparseable string created_at
    code_bad_ts = "BADT-2222"
    code_hash = hashlib.sha256(code_bad_ts.encode("utf-8")).hexdigest()
    from datetime import timedelta
    extension_pairing_codes_collection.insert_one({
        "employee_id": emp_id,
        "code_hash": code_hash,
        "created_at": "not-a-valid-datetime-value",
        "expires_at": revoked_at + timedelta(minutes=10),
        "used": False,
        "expected_paired_at": None,
    })

    res = client.post("/api/extension/pair", json={"code": code_bad_ts})
    assert res.status_code == 400
    assert "Invalid or expired pairing code" in res.json()["detail"]

    emp_after = employees_collection.find_one({"employee_id": emp_id})
    assert emp_after["extension"]["paired"] is False
    assert emp_after["extension_active"] is False
