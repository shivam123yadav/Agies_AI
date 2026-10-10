import concurrent.futures
import hashlib
from datetime import datetime, timezone, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_admin
from app.database import (
    employees_collection,
    extension_pairing_codes_collection,
)

client = TestClient(app)


def mock_admin_user():
    return {"email": "asce@admin.co", "role": "admin"}


@pytest.fixture(autouse=True)
def setup_test_data():
    """Ensure clean test state before each test."""
    test_emp_ids = ["EMP-PAIR-001", "EMP-PAIR-002", "EMP-PAIR-003"]
    employees_collection.delete_many({"employee_id": {"$in": test_emp_ids}})
    extension_pairing_codes_collection.delete_many({"employee_id": {"$in": test_emp_ids}})

    now = datetime.now(timezone.utc)
    emp1 = {
        "employee_id": "EMP-PAIR-001",
        "name": "Pair Test User 1",
        "email": "pair1@example.com",
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
            "last_seen": None,
            "device_info": None,
        },
        "created_at": now,
    }
    emp2 = {
        "employee_id": "EMP-PAIR-002",
        "name": "Pair Test User 2",
        "email": "pair2@example.com",
        "department": "Finance",
        "role": "Analyst",
        "extension_active": False,
        "status": "Active",
        "extension": {
            "paired": False,
            "access_enabled": False,  # Customized admin control
            "protection_enabled": False,  # Customized admin control
            "credential_hash": None,
            "paired_at": None,
            "last_seen": None,
            "device_info": None,
        },
        "created_at": now,
    }
    emp3 = {
        "employee_id": "EMP-PAIR-003",
        "name": "Pair Test User 3",
        "email": "pair3@example.com",
        "department": "HR",
        "role": "Manager",
        "extension_active": False,
        "status": "Disabled",  # Inactive employee
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
    }
    employees_collection.insert_many([emp1, emp2, emp3])

    yield

    employees_collection.delete_many({"employee_id": {"$in": test_emp_ids}})
    extension_pairing_codes_collection.delete_many({"employee_id": {"$in": test_emp_ids}})


def _admin_generate_code(employee_id: str) -> str:
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = client.post(f"/api/employees/{employee_id}/extension/pairing-code")
        assert res.status_code == 200
        return res.json()["code"]
    finally:
        app.dependency_overrides.clear()


def test_1_valid_pairing_success_and_state():
    """TEST 1: Valid pairing returns a credential and marks the employee paired."""
    code = _admin_generate_code("EMP-PAIR-001")
    res = client.post("/api/extension/pair", json={"code": code, "device_info": "Chrome 120 / macOS"})
    assert res.status_code == 200
    data = res.json()

    assert data["success"] is True
    assert data["employee_id"] == "EMP-PAIR-001"
    assert data["employee_name"] == "Pair Test User 1"
    assert "credential" in data
    assert data["credential"].startswith("agies_ext_")
    assert "paired_at" in data
    assert data["access_enabled"] is True
    assert data["protection_enabled"] is True

    # Verify employee document in database
    emp = employees_collection.find_one({"employee_id": "EMP-PAIR-001"})
    assert emp["extension"]["paired"] is True
    assert emp["extension"]["paired_at"] is not None
    assert emp["extension"]["device_info"] == "Chrome 120 / macOS"
    assert emp["extension_active"] is True


def test_2_mongodb_stores_credential_hash_not_plaintext():
    """TEST 2: MongoDB stores the credential hash, not the plaintext credential."""
    code = _admin_generate_code("EMP-PAIR-001")
    res = client.post("/api/extension/pair", json={"code": code})
    assert res.status_code == 200
    credential = res.json()["credential"]

    emp = employees_collection.find_one({"employee_id": "EMP-PAIR-001"})
    stored_hash = emp["extension"]["credential_hash"]
    assert stored_hash is not None
    assert stored_hash != credential
    assert stored_hash == hashlib.sha256(credential.encode("utf-8")).hexdigest()

    # Plaintext credential is never in DB
    assert credential not in str(emp)


def test_3_second_use_of_code_fails():
    """TEST 3: A second use of the same code fails."""
    code = _admin_generate_code("EMP-PAIR-001")

    res1 = client.post("/api/extension/pair", json={"code": code})
    assert res1.status_code == 200

    # Second attempt with same code
    res2 = client.post("/api/extension/pair", json={"code": code})
    assert res2.status_code == 400
    assert "Invalid or expired pairing code" in res2.json()["detail"]


def test_4_expired_codes_fail():
    """TEST 4: Expired codes fail."""
    code = _admin_generate_code("EMP-PAIR-001")
    code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()

    # Artificially set expires_at in the past
    past = datetime.now(timezone.utc) - timedelta(minutes=5)
    extension_pairing_codes_collection.update_one(
        {"code_hash": code_hash},
        {"$set": {"expires_at": past}},
    )

    res = client.post("/api/extension/pair", json={"code": code})
    assert res.status_code == 400
    assert "Invalid or expired pairing code" in res.json()["detail"]


def test_5_invalidated_codes_fail():
    """TEST 5: Invalidated codes fail."""
    # Generate code 1
    code1 = _admin_generate_code("EMP-PAIR-001")
    # Generate code 2 (invalidates code 1)
    code2 = _admin_generate_code("EMP-PAIR-001")

    # Code 1 should fail
    res1 = client.post("/api/extension/pair", json={"code": code1})
    assert res1.status_code == 400
    assert "Invalid or expired pairing code" in res1.json()["detail"]

    # Code 2 should succeed
    res2 = client.post("/api/extension/pair", json={"code": code2})
    assert res2.status_code == 200


def test_6_invalid_code_no_leak():
    """TEST 6: Invalid codes fail without leaking employee information."""
    res = client.post("/api/extension/pair", json={"code": "ZZZZ-9999"})
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid or expired pairing code"
    assert "employee" not in res.json()["detail"].lower()


def test_7_client_supplied_employee_id_ignored():
    """TEST 7: Client-supplied employee IDs cannot change which employee is paired."""
    code = _admin_generate_code("EMP-PAIR-001")

    # Client maliciously attempts to pair EMP-PAIR-002 using EMP-PAIR-001's code
    res = client.post("/api/extension/pair", json={"code": code, "employee_id": "EMP-PAIR-002"})
    assert res.status_code == 200
    data = res.json()

    # Identity must be derived from code document (EMP-PAIR-001)
    assert data["employee_id"] == "EMP-PAIR-001"

    # EMP-PAIR-002 must remain unpaired
    emp2 = employees_collection.find_one({"employee_id": "EMP-PAIR-002"})
    assert emp2["extension"]["paired"] is False


def test_8_missing_or_disabled_employee_fails_safely():
    """TEST 8: Missing employees or disabled employees fail safely."""
    # Test disabled employee
    code_disabled = _admin_generate_code("EMP-PAIR-003")
    res_disabled = client.post("/api/extension/pair", json={"code": code_disabled})
    assert res_disabled.status_code == 400
    assert "Invalid or expired pairing code" in res_disabled.json()["detail"]

    # Test deleted employee
    code_deleted = _admin_generate_code("EMP-PAIR-001")
    employees_collection.delete_one({"employee_id": "EMP-PAIR-001"})
    res_deleted = client.post("/api/extension/pair", json={"code": code_deleted})
    assert res_deleted.status_code == 400
    assert "Invalid or expired pairing code" in res_deleted.json()["detail"]


def test_9_concurrent_attempts_cannot_both_redeem():
    """TEST 9: Two concurrent attempts cannot both redeem the same code."""
    code = _admin_generate_code("EMP-PAIR-001")

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(lambda: client.post("/api/extension/pair", json={"code": code}))
        f2 = executor.submit(lambda: client.post("/api/extension/pair", json={"code": code}))
        results = [f1.result(), f2.result()]

    status_codes = [r.status_code for r in results]
    assert 200 in status_codes
    assert 400 in status_codes
    assert status_codes.count(200) == 1
    assert status_codes.count(400) == 1


def test_10_preserves_admin_access_protection_settings():
    """TEST 10: Existing extension access/protection settings remain unchanged."""
    # EMP-PAIR-002 has access_enabled=False, protection_enabled=False
    code = _admin_generate_code("EMP-PAIR-002")
    res = client.post("/api/extension/pair", json={"code": code})
    assert res.status_code == 200
    data = res.json()

    assert data["access_enabled"] is False
    assert data["protection_enabled"] is False

    emp = employees_collection.find_one({"employee_id": "EMP-PAIR-002"})
    assert emp["extension"]["paired"] is True
    assert emp["extension"]["access_enabled"] is False
    assert emp["extension"]["protection_enabled"] is False


def test_11_employee_api_responses_never_expose_credential_hashes():
    """TEST 11: Existing employee API responses never expose credential hashes."""
    code = _admin_generate_code("EMP-PAIR-001")
    res = client.post("/api/extension/pair", json={"code": code})
    assert res.status_code == 200
    credential = res.json()["credential"]
    cred_hash = hashlib.sha256(credential.encode("utf-8")).hexdigest()

    # GET /api/employees -- requires admin session; use dependency_overrides
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res_list = client.get("/api/employees")
        assert res_list.status_code == 200
        list_str = str(res_list.json())
        assert credential not in list_str
        assert cred_hash not in list_str
        assert "credential_hash" not in list_str

        # GET /api/employees/{id}
        res_detail = client.get("/api/employees/EMP-PAIR-001")
        assert res_detail.status_code == 200
        detail_str = str(res_detail.json())
        assert credential not in detail_str
        assert cred_hash not in detail_str
        assert "credential_hash" not in detail_str
    finally:
        app.dependency_overrides.clear()


def test_12_distinct_valid_codes_concurrent_pairing_race():
    """TEST 12: Two distinct valid codes for the same employee cannot both succeed concurrently."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=10)

    # Directly create two distinct valid pairing codes for EMP-PAIR-001
    code_a = "AAAA-1111"
    code_b = "BBBB-2222"
    hash_a = hashlib.sha256(code_a.encode("utf-8")).hexdigest()
    hash_b = hashlib.sha256(code_b.encode("utf-8")).hexdigest()

    extension_pairing_codes_collection.insert_many([
        {"employee_id": "EMP-PAIR-001", "code_hash": hash_a, "created_at": now, "expires_at": expires_at, "used": False},
        {"employee_id": "EMP-PAIR-001", "code_hash": hash_b, "created_at": now, "expires_at": expires_at, "used": False},
    ])

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(lambda: client.post("/api/extension/pair", json={"code": code_a}))
        f2 = executor.submit(lambda: client.post("/api/extension/pair", json={"code": code_b}))
        results = [f1.result(), f2.result()]

    status_codes = [r.status_code for r in results]
    # Exactly one request must succeed with 200; the other must fail (409 Conflict or 400)
    assert 200 in status_codes
    assert status_codes.count(200) == 1
    assert any(code in {400, 409} for code in status_codes)

    # Identify winner and loser
    winner_res = next(r for r in results if r.status_code == 200)
    winner_cred = winner_res.json()["credential"]
    winner_hash = hashlib.sha256(winner_cred.encode("utf-8")).hexdigest()

    # Verify MongoDB stores the winning credential hash
    emp = employees_collection.find_one({"employee_id": "EMP-PAIR-001"})
    assert emp["extension"]["credential_hash"] == winner_hash
    assert emp["extension"]["paired"] is True

    # Verify all codes for EMP-PAIR-001 are now marked used: True
    unused_count = extension_pairing_codes_collection.count_documents({"employee_id": "EMP-PAIR-001", "used": False})
    assert unused_count == 0


def test_13_successful_pairing_invalidates_sibling_codes():
    """TEST 13: Successful pairing invalidates any remaining unused sibling codes."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=10)

    # Insert 3 active codes for EMP-PAIR-001
    codes = ["CODE-1111", "CODE-2222", "CODE-3333"]
    docs = [
        {"employee_id": "EMP-PAIR-001", "code_hash": hashlib.sha256(c.encode("utf-8")).hexdigest(), "created_at": now, "expires_at": expires_at, "used": False}
        for c in codes
    ]
    extension_pairing_codes_collection.insert_many(docs)

    # Pair with code 1
    res1 = client.post("/api/extension/pair", json={"code": "CODE-1111"})
    assert res1.status_code == 200

    # Remaining sibling codes should now be marked used=True
    unused_remaining = extension_pairing_codes_collection.count_documents({"employee_id": "EMP-PAIR-001", "used": False})
    assert unused_remaining == 0

    # Attempting to pair with sibling code must fail
    res2 = client.post("/api/extension/pair", json={"code": "CODE-2222"})
    assert res2.status_code == 400
    assert "Invalid or expired pairing code" in res2.json()["detail"]


def test_14_legacy_employee_without_extension_object_pairing():
    """TEST 14: Legacy employee without 'extension' field pairs successfully with optimistic concurrency."""
    now = datetime.now(timezone.utc)
    # Insert legacy employee document with no 'extension' field
    legacy_emp = {
        "employee_id": "EMP-LEGACY-001",
        "name": "Legacy User",
        "email": "legacy@example.com",
        "department": "Engineering",
        "role": "Dev",
        "extension_active": False,
        "status": "Active",
        "created_at": now,
    }
    employees_collection.insert_one(legacy_emp)

    try:
        # Generate code and pair
        code = _admin_generate_code("EMP-LEGACY-001")
        res = client.post("/api/extension/pair", json={"code": code})
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["employee_id"] == "EMP-LEGACY-001"
        assert "credential" in data

        # Verify employee in DB is now properly structured and paired
        emp = employees_collection.find_one({"employee_id": "EMP-LEGACY-001"})
        assert emp["extension"]["paired"] is True
        assert emp["extension"]["credential_hash"] == hashlib.sha256(data["credential"].encode("utf-8")).hexdigest()
        assert emp["extension_active"] is True
    finally:
        employees_collection.delete_one({"employee_id": "EMP-LEGACY-001"})
        extension_pairing_codes_collection.delete_many({"employee_id": "EMP-LEGACY-001"})


def test_15_re_pairing_already_paired_employee():
    """TEST 15: Re-pairing an already-paired employee updates the credential with concurrency protection."""
    # First pairing
    code1 = _admin_generate_code("EMP-PAIR-001")
    res1 = client.post("/api/extension/pair", json={"code": code1})
    assert res1.status_code == 200
    cred1 = res1.json()["credential"]

    emp1 = employees_collection.find_one({"employee_id": "EMP-PAIR-001"})
    assert emp1["extension"]["credential_hash"] == hashlib.sha256(cred1.encode("utf-8")).hexdigest()

    # Second pairing with new code
    code2 = _admin_generate_code("EMP-PAIR-001")
    res2 = client.post("/api/extension/pair", json={"code": code2})
    assert res2.status_code == 200
    cred2 = res2.json()["credential"]
    assert cred1 != cred2

    emp2 = employees_collection.find_one({"employee_id": "EMP-PAIR-001"})
    assert emp2["extension"]["credential_hash"] == hashlib.sha256(cred2.encode("utf-8")).hexdigest()


def test_16_sibling_invalidation_failure_handling_and_occ_safety(monkeypatch):
    """TEST 16: If sibling invalidation fails, pairing still succeeds and OCC blocks sibling code redemption."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=10)

    # Insert two active codes for EMP-PAIR-001
    code1 = "CODE-AAA1"
    code2 = "CODE-BBB2"
    hash1 = hashlib.sha256(code1.encode("utf-8")).hexdigest()
    hash2 = hashlib.sha256(code2.encode("utf-8")).hexdigest()

    extension_pairing_codes_collection.insert_many([
        {"employee_id": "EMP-PAIR-001", "code_hash": hash1, "created_at": now, "expires_at": expires_at, "used": False, "expected_paired_at": None},
        {"employee_id": "EMP-PAIR-001", "code_hash": hash2, "created_at": now, "expires_at": expires_at, "used": False, "expected_paired_at": None},
    ])

    # Monkeypatch update_many to simulate a transient DB failure during sibling invalidation
    real_update_many = extension_pairing_codes_collection.update_many

    def failing_update_many(*args, **kwargs):
        raise RuntimeError("Simulated transient MongoDB network failure during sibling invalidation")

    monkeypatch.setattr(extension_pairing_codes_collection, "update_many", failing_update_many)

    # Code 1 pairing should STILL succeed because employee was updated before invalidation
    res1 = client.post("/api/extension/pair", json={"code": code1})
    assert res1.status_code == 200
    cred1 = res1.json()["credential"]

    # Verify employee in DB has Code 1's credential hash
    emp = employees_collection.find_one({"employee_id": "EMP-PAIR-001"})
    assert emp["extension"]["credential_hash"] == hashlib.sha256(cred1.encode("utf-8")).hexdigest()

    # Restore real update_many
    monkeypatch.setattr(extension_pairing_codes_collection, "update_many", real_update_many)

    # Code 2 is still un-invalidated in DB, BUT attempting to pair it must fail via OCC (HTTP 409)
    res2 = client.post("/api/extension/pair", json={"code": code2})
    assert res2.status_code == 409
    assert "Pairing conflict" in res2.json()["detail"]

    # Verify Code 1's credential was NOT overwritten
    emp_after = employees_collection.find_one({"employee_id": "EMP-PAIR-001"})
    assert emp_after["extension"]["credential_hash"] == hashlib.sha256(cred1.encode("utf-8")).hexdigest()

