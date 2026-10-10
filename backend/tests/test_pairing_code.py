import re
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
    # Ensure default employees exist or insert test employees
    employees_collection.delete_many({"employee_id": {"$in": ["EMP-TEST-001", "EMP-TEST-002"]}})
    extension_pairing_codes_collection.delete_many({"employee_id": {"$in": ["EMP-TEST-001", "EMP-TEST-002"]}})

    now = datetime.now(timezone.utc)
    emp1 = {
        "employee_id": "EMP-TEST-001",
        "name": "Test User 1",
        "email": "test1@example.com",
        "department": "Engineering",
        "role": "Developer",
        "extension_active": True,
        "status": "Active",
        "created_at": now,
    }
    emp2 = {
        "employee_id": "EMP-TEST-002",
        "name": "Test User 2",
        "email": "test2@example.com",
        "department": "Finance",
        "role": "Analyst",
        "extension_active": True,
        "status": "Active",
        "created_at": now,
    }
    employees_collection.insert_many([emp1, emp2])

    yield

    employees_collection.delete_many({"employee_id": {"$in": ["EMP-TEST-001", "EMP-TEST-002"]}})
    extension_pairing_codes_collection.delete_many({"employee_id": {"$in": ["EMP-TEST-001", "EMP-TEST-002"]}})


def test_1_admin_generates_pairing_code():
    """TEST 1: Admin generates a pairing code."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        response = client.post("/api/employees/EMP-TEST-001/extension/pairing-code")
        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert data["employee_id"] == "EMP-TEST-001"
        assert "code" in data
        assert "expires_at" in data
        assert data["expires_in_seconds"] == 600

        # Verify format (8 uppercase alphanumeric characters excluding hyphen)
        code = data["code"]
        assert re.match(r"^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$", code)

        # Verify expires_at is ~10 minutes in future
        expires_at = datetime.fromisoformat(data["expires_at"])
        now = datetime.now(timezone.utc)
        time_diff = (expires_at - now).total_seconds()
        assert 580 <= time_diff <= 610
    finally:
        app.dependency_overrides.clear()


def test_2_inspect_mongodb_directly():
    """TEST 2: Inspect MongoDB directly."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = client.post("/api/employees/EMP-TEST-001/extension/pairing-code")
        assert res.status_code == 200
        code = res.json()["code"]

        doc = extension_pairing_codes_collection.find_one({"employee_id": "EMP-TEST-001", "used": False})
        assert doc is not None

        # Plaintext code does NOT exist in DB doc
        assert "code" not in doc
        # code_hash exists and matches SHA-256 of code
        expected_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
        assert doc["code_hash"] == expected_hash
        assert doc["employee_id"] == "EMP-TEST-001"
        assert doc["used"] is False
        assert "expires_at" in doc
        assert "created_at" in doc
    finally:
        app.dependency_overrides.clear()


def test_3_generate_second_code_same_employee():
    """TEST 3: Generate a second code for the same employee."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res1 = client.post("/api/employees/EMP-TEST-001/extension/pairing-code")
        code1 = res1.json()["code"]
        hash1 = hashlib.sha256(code1.encode("utf-8")).hexdigest()

        res2 = client.post("/api/employees/EMP-TEST-001/extension/pairing-code")
        code2 = res2.json()["code"]
        hash2 = hashlib.sha256(code2.encode("utf-8")).hexdigest()

        assert code1 != code2

        # First code should now be used=True
        doc1 = extension_pairing_codes_collection.find_one({"code_hash": hash1})
        assert doc1 is not None
        assert doc1["used"] is True

        # Second code should be used=False
        doc2 = extension_pairing_codes_collection.find_one({"code_hash": hash2})
        assert doc2 is not None
        assert doc2["used"] is False
    finally:
        app.dependency_overrides.clear()


def test_4_generate_codes_different_employees():
    """TEST 4: Generate codes for two different employees."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res1 = client.post("/api/employees/EMP-TEST-001/extension/pairing-code")
        code1 = res1.json()["code"]
        hash1 = hashlib.sha256(code1.encode("utf-8")).hexdigest()

        res2 = client.post("/api/employees/EMP-TEST-002/extension/pairing-code")
        code2 = res2.json()["code"]
        hash2 = hashlib.sha256(code2.encode("utf-8")).hexdigest()

        # Employee 1's code remains unused
        doc1 = extension_pairing_codes_collection.find_one({"code_hash": hash1})
        assert doc1["used"] is False
        assert doc1["employee_id"] == "EMP-TEST-001"

        # Employee 2's code remains unused
        doc2 = extension_pairing_codes_collection.find_one({"code_hash": hash2})
        assert doc2["used"] is False
        assert doc2["employee_id"] == "EMP-TEST-002"
    finally:
        app.dependency_overrides.clear()


def test_5_unauthenticated_request():
    """TEST 5: Unauthenticated request."""
    # Ensure no dependency override so require_admin is called
    app.dependency_overrides.clear()
    res = client.post("/api/employees/EMP-TEST-001/extension/pairing-code")
    assert res.status_code == 401
    assert "Admin authentication required" in res.json()["detail"]


def test_6_nonexistent_employee():
    """TEST 6: Nonexistent employee."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        res = client.post("/api/employees/NON-EXISTENT-999/extension/pairing-code")
        assert res.status_code == 404
        assert "Employee not found" in res.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_7_get_employees_no_code_leak():
    """TEST 7: GET /api/employees and GET /api/employees/{id} do not expose code or code_hash."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        # Generate code first
        res_code = client.post("/api/employees/EMP-TEST-001/extension/pairing-code")
        code = res_code.json()["code"]
        code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()

        # Check list endpoint
        res_list = client.get("/api/employees")
        assert res_list.status_code == 200
        list_json = res_list.json()
        assert code not in str(list_json)
        assert code_hash not in str(list_json)

        # Check detail endpoint
        res_detail = client.get("/api/employees/EMP-TEST-001")
        assert res_detail.status_code == 200
        detail_json = res_detail.json()
        assert code not in str(detail_json)
        assert code_hash not in str(detail_json)
    finally:
        app.dependency_overrides.clear()
