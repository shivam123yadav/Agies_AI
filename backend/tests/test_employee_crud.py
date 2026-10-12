import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import require_admin
from app.database import (
    audit_logs_collection,
    employees_collection,
    extension_pairing_codes_collection,
)

client = TestClient(app)

TEST_EMAILS = [
    "crud_test_maya@northwind.co",
    "crud_test_sarah@northwind.co",
    "crud_test_duplicate@northwind.co",
]


def mock_admin_user():
    return {"email": "admin@northwind.co", "role": "admin"}


@pytest.fixture(autouse=True)
def clean_test_employees():
    """Ensure clean database state before and after each test."""
    employees_collection.delete_many({"email": {"$in": TEST_EMAILS}})
    extension_pairing_codes_collection.delete_many({"employee_id": {"$regex": "^EMP-"}})
    audit_logs_collection.delete_many({"event": "EMPLOYEE_CREATED"})

    yield

    employees_collection.delete_many({"email": {"$in": TEST_EMAILS}})


def test_1_create_employee_success_and_default_state():
    """TEST 1: Admin successfully creates an employee; verifies response and default extension security state."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        payload = {
            "name": "Maya Lin",
            "email": "crud_test_maya@northwind.co",
            "department": "Security",
            "role": "Staff Architect",
            "extension_active": True,
            "status": "Active",
            # Attempt to inject extension state -- must be ignored by server
            "extension": {"paired": True, "credential_hash": "malicious_hash"},
        }

        response = client.post("/api/employees", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        emp = data["employee"]
        assert emp["name"] == "Maya Lin"
        assert emp["email"] == "crud_test_maya@northwind.co"
        assert emp["department"] == "Security"
        assert emp["role"] == "Staff Architect"
        assert emp["extension_active"] is True
        assert emp["status"] == "Active"
        assert emp["employee_id"].startswith("EMP-")
        assert len(emp["employee_id"]) == 12  # EMP- + 8 hex chars

        # Initial stats
        assert emp["incidents"] == 0
        assert emp["warnings"] == 0
        assert emp["blocked"] == 0
        assert emp["risk_score"] == 0
        assert emp["risk_level"] == "LOW"

        # Verify direct MongoDB document
        db_doc = employees_collection.find_one({"employee_id": emp["employee_id"]})
        assert db_doc is not None
        assert db_doc["name"] == "Maya Lin"
        assert db_doc["email"] == "crud_test_maya@northwind.co"

        # Verify extension security state was initialized cleanly and safely
        ext = db_doc["extension"]
        assert ext["paired"] is False
        assert ext["access_enabled"] is True
        assert ext["protection_enabled"] is True
        assert ext["credential_hash"] is None  # Malicious injected credential_hash was ignored
        assert ext["paired_at"] is None
        assert ext["revoked_at"] is None
        assert ext["last_seen"] is None
        assert ext["device_info"] is None

        # Verify audit log event was created
        audit = audit_logs_collection.find_one({
            "event": "EMPLOYEE_CREATED",
            "employee_id": emp["employee_id"],
        })
        assert audit is not None
        assert audit["employee_name"] == "Maya Lin"
        assert audit["department"] == "Security"
    finally:
        app.dependency_overrides.clear()


def test_2_create_employee_duplicate_email_rejected():
    """TEST 2: Attempting to create an employee with an existing email returns 409 Conflict."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        payload = {
            "name": "First User",
            "email": "crud_test_duplicate@northwind.co",
            "department": "Engineering",
            "role": "Developer",
        }
        res1 = client.post("/api/employees", json=payload)
        assert res1.status_code == 200

        # Duplicate email with exact same casing
        res2 = client.post("/api/employees", json=payload)
        assert res2.status_code == 409
        assert "An employee with this email already exists" in res2.json()["detail"]

        # Duplicate email with uppercase casing (should normalize and still reject)
        payload_upper = {
            **payload,
            "name": "Different Name",
            "email": "CRUD_TEST_DUPLICATE@NORTHWIND.CO",
        }
        res3 = client.post("/api/employees", json=payload_upper)
        assert res3.status_code == 409
        assert "An employee with this email already exists" in res3.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_3_create_employee_validation_errors():
    """TEST 3: Required fields and status constraints are validated."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        # Missing name
        res = client.post("/api/employees", json={
            "email": "crud_test_sarah@northwind.co",
            "department": "IT",
            "role": "Admin",
        })
        assert res.status_code == 422

        # Empty name
        res = client.post("/api/employees", json={
            "name": "",
            "email": "crud_test_sarah@northwind.co",
            "department": "IT",
            "role": "Admin",
        })
        assert res.status_code == 422

        # Missing email
        res = client.post("/api/employees", json={
            "name": "Sarah",
            "department": "IT",
            "role": "Admin",
        })
        assert res.status_code == 422

        # Missing department
        res = client.post("/api/employees", json={
            "name": "Sarah",
            "email": "crud_test_sarah@northwind.co",
            "role": "Admin",
        })
        assert res.status_code == 422

        # Missing role
        res = client.post("/api/employees", json={
            "name": "Sarah",
            "email": "crud_test_sarah@northwind.co",
            "department": "IT",
        })
        assert res.status_code == 422

        # Invalid status
        res = client.post("/api/employees", json={
            "name": "Sarah",
            "email": "crud_test_sarah@northwind.co",
            "department": "IT",
            "role": "Admin",
            "status": "Archived",
        })
        assert res.status_code == 400
        assert "status must be Active or Disabled" in res.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_4_create_employee_requires_admin_auth():
    """TEST 4: Unauthenticated request to POST /api/employees is rejected with 401."""
    # Ensure no admin dependency override
    payload = {
        "name": "Unauthenticated Attempt",
        "email": "crud_test_sarah@northwind.co",
        "department": "Sales",
        "role": "Rep",
    }
    response = client.post("/api/employees", json=payload)
    assert response.status_code == 401
    assert "Admin authentication required" in response.json()["detail"]


def test_5_newly_created_employee_can_immediately_generate_pairing_code():
    """TEST 5: Newly created employee can immediately generate a pairing code and pair extension."""
    app.dependency_overrides[require_admin] = mock_admin_user
    try:
        # Create employee
        create_res = client.post("/api/employees", json={
            "name": "Sarah Connor",
            "email": "crud_test_sarah@northwind.co",
            "department": "Operations",
            "role": "Security Specialist",
        })
        assert create_res.status_code == 200
        emp_id = create_res.json()["employee"]["employee_id"]

        # Generate pairing code
        pair_res = client.post(f"/api/employees/{emp_id}/extension/pairing-code")
        assert pair_res.status_code == 200
        pair_data = pair_res.json()
        assert pair_data["success"] is True
        assert pair_data["employee_id"] == emp_id
        assert "code" in pair_data

        # Redeem pairing code via /api/extension/pair
        code = pair_data["code"]
        redeem_res = client.post("/api/extension/pair", json={"code": code})
        assert redeem_res.status_code == 200
        redeem_data = redeem_res.json()
        assert redeem_data["success"] is True
        assert redeem_data["employee_id"] == emp_id
        assert redeem_data["employee_name"] == "Sarah Connor"
        assert redeem_data["credential"].startswith("agies_ext_")

        # Verify employee is now marked paired in DB
        emp_doc = employees_collection.find_one({"employee_id": emp_id})
        assert emp_doc["extension"]["paired"] is True
        assert emp_doc["extension_active"] is True
    finally:
        app.dependency_overrides.clear()
