import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("agiesai.sentinel")

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pymongo import ReturnDocument
from starlette.middleware.sessions import SessionMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.auth import (
    create_admin_session,
    hash_credential,
    require_admin,
    require_extension_auth,
    require_extension_protection,
    revoke_admin_session,
    verify_admin_credentials,
)
from app.csrf import (
    CSRFMiddleware,
    get_csrf_trusted_origins,
    validate_csrf_configuration,
)
from app.rate_limiter import (
    check_login_rate_limit,
    record_login_failure,
    reset_login_rate_limit,
)
from app.config import (
    is_production_env,
    validate_production_configuration,
    validate_session_secret,
)
from app.database import (
    are_critical_indexes_ready,
    audit_logs_collection,
    check_database,
    detection_rules_collection,
    employees_collection,
    ensure_database_indexes,
    extension_pairing_codes_collection,
    incidents_collection,
    is_database_ready,
    policies_collection,
)
from app.engines.contextual_analysis import analyze_context
from app.engines.pattern_detection import detect_patterns
from app.engines.policy_engine import evaluate_policy, ensure_default_policies
from app.engines.detection_rules import DEFAULT_DETECTION_RULES, PROTECTED_RULES, ensure_default_detection_rules
from app.engines.risk_engine import calculate_risk

validate_production_configuration()

ENV = os.getenv("ENVIRONMENT", "development").lower()
is_production = is_production_env()

app = FastAPI(
    title="AgiesAI Sentinel API",
    description="AI security and sensitive-data detection backend",
    version="2.1.0",
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)

SESSION_SECRET = validate_session_secret(is_production=is_production)
SESSION_HTTPS_ONLY = is_production or (os.getenv("SESSION_HTTPS_ONLY", "false").lower() == "true")

validate_csrf_configuration()

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="sentinel_session",
    max_age=14 * 24 * 60 * 60,
    same_site="lax",
    https_only=SESSION_HTTPS_ONLY,
)

app.add_middleware(CSRFMiddleware)

cors_origins = (
    sorted(list(get_csrf_trusted_origins()))
    if ENV in {"production", "prod"}
    else ["http://localhost:5173", "http://127.0.0.1:5173"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PAIRING_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def generate_pairing_code() -> str:
    """Generate a 8-character uppercase alphanumeric code formatted as XXXX-XXXX.

    Uses secrets.choice with an unambiguous alphabet (excluding 0, O, 1, I, L).
    """
    part1 = "".join(secrets.choice(PAIRING_CODE_ALPHABET) for _ in range(4))
    part2 = "".join(secrets.choice(PAIRING_CODE_ALPHABET) for _ in range(4))
    return f"{part1}-{part2}"


def normalize_pairing_code(code: str) -> str:
    """Normalize user-entered pairing code into standard XXXX-XXXX uppercase format."""
    cleaned = code.strip().upper()
    if len(cleaned) == 8 and "-" not in cleaned:
        cleaned = f"{cleaned[:4]}-{cleaned[4:]}"
    return cleaned


def hash_pairing_code(code: str) -> str:
    """Return SHA-256 hash digest of plaintext pairing code."""
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def generate_extension_credential() -> str:
    """Generate a high-entropy bearer token for paired extension."""
    return f"agies_ext_{secrets.token_urlsafe(32)}"



class AdminLoginRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email: str = Field(..., min_length=1, max_length=160)
    password: str = Field(..., min_length=1, max_length=128)


class ExtensionPairRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: str = Field(..., min_length=1, max_length=50)
    device_info: str | dict | None = None

class DetectionRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    employee_id: str | None = None
    platform: str = "ChatGPT"


class IncidentStatusRequest(BaseModel):
    status: str


class IncidentActionRequest(BaseModel):
    action: str


class PolicyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    category: str = Field(..., min_length=1, max_length=80)
    risk_min: int = Field(..., ge=0, le=100)
    risk_max: int = Field(..., ge=0, le=100)
    action: str
    status: str = "Active"
    description: str = Field("", max_length=500)

    @model_validator(mode="after")
    def validate_ranges(self):
        if self.risk_min > self.risk_max:
            raise ValueError("risk_min must be less than or equal to risk_max")
        if self.action not in {"ALLOW", "WARN", "BLOCK"}:
            raise ValueError("action must be ALLOW, WARN, or BLOCK")
        if self.status not in {"Active", "Draft", "Disabled"}:
            raise ValueError("status must be Active, Draft, or Disabled")
        return self


class PolicyStatusRequest(BaseModel):
    status: str


ALLOWED_STATUSES = {"Open", "Acknowledged", "Resolved"}
ALLOWED_INCIDENT_ACTIONS = {"CONTINUE_ANYWAY", "WARNING_CANCELLED"}
ALLOWED_PLATFORMS = {"ChatGPT", "Gemini", "Claude", "Copilot", "Perplexity"}


class DetectionRuleRequest(BaseModel):
    status: str | None = None
    name: str | None = None
    category: str | None = None
    detection_type: str | None = None
    severity: str | None = None
    pattern: str | None = None
    description: str | None = None
    protected: bool | None = None


class EmployeeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=160)
    department: str = Field(..., min_length=1, max_length=100)
    role: str = Field(..., min_length=1, max_length=100)
    extension_active: bool = True
    status: str = "Active"


class EmployeeStatusRequest(BaseModel):
    status: str


def default_extension_state() -> dict:
    """STEP 1: server-side extension security state defaults.

    credential_hash is always None here — Step 1 never creates or
    accepts a plaintext credential, so there is nothing to hash yet.
    """
    return {
        "paired": False,
        "access_enabled": True,
        "protection_enabled": True,
        "credential_hash": None,
        "paired_at": None,
        "last_seen": None,
        "device_info": None,
    }


def _normalize_extension_state(raw) -> dict:
    """Return a complete extension state dict with safe defaults.

    Existing employees stored before STEP 1 have no ``extension``
    object (or a partial one). Fill missing keys so callers never
    need ``if 'extension' in employee`` guards.
    """
    defaults = default_extension_state()
    if not isinstance(raw, dict):
        return defaults
    return {
        "paired": bool(raw.get("paired", defaults["paired"])),
        "access_enabled": bool(raw.get("access_enabled", defaults["access_enabled"])),
        "protection_enabled": bool(raw.get("protection_enabled", defaults["protection_enabled"])),
        "credential_hash": raw.get("credential_hash", defaults["credential_hash"]),
        "paired_at": raw.get("paired_at", defaults["paired_at"]),
        "last_seen": raw.get("last_seen", defaults["last_seen"]),
        "device_info": raw.get("device_info", defaults["device_info"]),
    }


DEFAULT_EMPLOYEES = [
    {"employee_id": "EMP-DEMO-001", "name": "Alex Morgan", "email": "alex.morgan@acme.example", "department": "Engineering", "role": "Software Engineer", "extension_active": True, "status": "Active"},
    {"employee_id": "EMP-DEMO-002", "name": "Priya Shah", "email": "priya.shah@acme.example", "department": "Finance", "role": "Finance Analyst", "extension_active": True, "status": "Active"},
    {"employee_id": "EMP-DEMO-003", "name": "Daniel Kim", "email": "daniel.kim@acme.example", "department": "Operations", "role": "Operations Manager", "extension_active": False, "status": "Active"},
]


def ensure_default_employees() -> None:
    try:
        if employees_collection.count_documents({}) == 0:
            now = datetime.now(timezone.utc)
            docs = []
            for employee in DEFAULT_EMPLOYEES:
                docs.append(
                    {
                        **employee,
                        "extension": default_extension_state(),
                        "created_at": now,
                        "last_active": None,
                    }
                )
            employees_collection.insert_many(docs)
    except Exception:
        pass


def _sanitize_extension_for_response(extension: dict) -> dict:
    """Return the extension state safe for API responses.

    credential_hash must never leave the server.
    """
    sanitized = dict(extension)
    sanitized.pop("credential_hash", None)
    return sanitized


def _employee_payload(employee):
    if not employee:
        return None
    employee = dict(employee)
    employee.pop("_id", None)
    # Existing employees may pre-date the extension object: normalize with
    # safe defaults instead of breaking. Never leak credential_hash.
    normalized = _normalize_extension_state(employee.get("extension"))
    employee["extension"] = _sanitize_extension_for_response(normalized)
    return employee


def _employee_stats(employee_id: str):
    rows = list(incidents_collection.find({"employee_id": employee_id}, {"_id": 0}).sort("timestamp", 1))
    total = len(rows)
    warnings = sum(1 for x in rows if x.get("action") == "WARN")
    blocked = sum(1 for x in rows if x.get("action") == "BLOCK")
    risk_level = "LOW"
    if rows:
        max_score = max(int(x.get("risk_score", 0)) for x in rows)
        risk_level = "HIGH" if max_score >= 70 else "MEDIUM" if max_score >= 40 else "LOW"
    category_counts = {}
    for row in rows:
        for finding in row.get("finding_types", []):
            category_counts[finding] = category_counts.get(finding, 0) + 1
    scores = [int(x.get("risk_score", 0)) for x in rows]
    average_score = round(sum(scores) / len(scores)) if scores else 0
    high_risk_events = sum(1 for score in scores if score >= 70)
    block_rate = round((blocked / total) * 100) if total else 0
    top_violation = "None"
    if category_counts:
        top_violation = max(category_counts.items(), key=lambda item: item[1])[0]
    trend = [{"timestamp": x.get("timestamp"), "risk_score": x.get("risk_score", 0)} for x in rows[-12:]]
    return {
        "incidents": total,
        "warnings": warnings,
        "blocked": blocked,
        "risk_level": risk_level,
        "risk_score": average_score,
        "high_risk_events": high_risk_events,
        "block_rate": block_rate,
        "top_violation": top_violation,
        "category_breakdown": category_counts,
        "risk_trend": trend,
        "recent_incidents": [x.get("incident_id") for x in rows[-10:][::-1]],
    }


ensure_default_policies()
ensure_default_employees()
ensure_default_detection_rules()


def _create_incident(detection, context, risk, policy, employee=None, platform="ChatGPT"):
    incident_id = f"INC-{uuid4().hex[:8].upper()}"
    timestamp = datetime.now(timezone.utc)

    # IMPORTANT: this document deliberately contains metadata only.
    # Never add request.text, raw matches, or masked sensitive values here.
    incident = {
        "incident_id": incident_id,
        "timestamp": timestamp,
        "status": "Open",
        "platform": platform,
        "employee_id": employee.get("employee_id") if employee else None,
        "employee_name": employee.get("name") if employee else "Unassigned",
        "employee_department": employee.get("department") if employee else None,
        "risk_score": risk["score"],
        "risk_level": risk["level"],
        "action": policy["decision"],
        "policy": policy["policy"],
        "policy_message": policy["message"],
        "detected": detection["detected"],
        "finding_count": detection["finding_count"],
        "finding_types": [f["type"] for f in detection["findings"]],
        "risk_reasons": risk.get("reasons", []),
        "context_level": context["context_level"],
        "context_modifier": context["score_modifier"],
        "context_signals": [
            {
                "signal": s["signal"],
                "category": s["category"],
                "impact": s["impact"],
            }
            for s in context["signals"]
        ],
    }

    incidents_collection.insert_one(incident)

    audit_logs_collection.insert_one(
        {
            "timestamp": timestamp,
            "event": "INCIDENT_CREATED",
            "incident_id": incident_id,
            "action": policy["decision"],
            "risk_level": risk["level"],
            "risk_score": risk["score"],
            "finding_types": incident["finding_types"],
            "platform": platform,
            "employee_id": employee.get("employee_id") if employee else None,
            "employee_name": employee.get("name") if employee else "Unassigned",
            "employee_department": employee.get("department") if employee else None,
        }
    )

    return incident_id


@app.get("/")
def root():
    return {
        "name": "AgiesAI Sentinel",
        "status": "online",
        "version": "2.1.0",
    }


@app.get("/api/health")
def health_check():
    db_connected = check_database()
    indexes_ready = are_critical_indexes_ready()
    ready = db_connected and indexes_ready
    return {
        "status": "healthy" if ready else "degraded",
        "service": "AgiesAI Sentinel Backend",
        "database": "connected" if db_connected else "disconnected",
        "indexes_ready": indexes_ready,
    }


@app.post("/api/detect")
def detect(
    request: DetectionRequest,
    employee: dict = Depends(require_extension_protection),
):
    platform = request.platform if request.platform in ALLOWED_PLATFORMS else "ChatGPT"

    employees_collection.update_one(
        {"employee_id": employee.get("employee_id")},
        {"$set": {"last_active": datetime.now(timezone.utc)}},
    )

    detection = detect_patterns(request.text)
    context = analyze_context(request.text, detection)
    risk = calculate_risk(detection, context)
    policy = evaluate_policy(risk, detection, context)

    incident_id = None
    if policy["decision"] in {"WARN", "BLOCK"}:
        incident_id = _create_incident(detection, context, risk, policy, employee, platform)

    return {
        "success": True,
        "incident_id": incident_id,
        "employee_id": employee.get("employee_id"),
        "employee_name": employee.get("name"),
        "platform": platform,
        "detection": detection,
        "context": context,
        "risk": risk,
        "policy": policy,
    }

@app.get("/api/incidents")
def get_incidents(limit: int = 100, _admin: dict = Depends(require_admin)):
    limit = max(1, min(limit, 500))
    incidents = list(
        incidents_collection
        .find({}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(limit)
    )
    return {"success": True, "count": len(incidents), "incidents": incidents}


@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id: str, _admin: dict = Depends(require_admin)):
    incident = incidents_collection.find_one(
        {"incident_id": incident_id}, {"_id": 0}
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"success": True, "incident": incident}


@app.patch("/api/incidents/{incident_id}/status")
def update_incident_status(
    incident_id: str,
    request: IncidentStatusRequest,
    _admin: dict = Depends(require_admin),
):
    if request.status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed values: {sorted(ALLOWED_STATUSES)}",
        )

    incident = incidents_collection.find_one({"incident_id": incident_id})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    previous_status = incident.get("status", "Open")
    timestamp = datetime.now(timezone.utc)

    incidents_collection.update_one(
        {"incident_id": incident_id},
        {"$set": {"status": request.status}},
    )

    audit_logs_collection.insert_one(
        {
            "timestamp": timestamp,
            "event": "INCIDENT_STATUS_CHANGED",
            "incident_id": incident_id,
            "previous_status": previous_status,
            "new_status": request.status,
        }
    )

    updated = incidents_collection.find_one(
        {"incident_id": incident_id}, {"_id": 0}
    )
    return {"success": True, "incident": updated}

@app.post("/api/incidents/{incident_id}/action")
def record_incident_action(
    incident_id: str,
    request: IncidentActionRequest,
    _admin: dict = Depends(require_admin),
):
    if request.action not in ALLOWED_INCIDENT_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action. Allowed values: {sorted(ALLOWED_INCIDENT_ACTIONS)}",
        )

    incident = incidents_collection.find_one({"incident_id": incident_id})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if incident.get("action") != "WARN":
        raise HTTPException(
            status_code=400,
            detail="Incident action tracking is only valid for WARN incidents",
        )

    timestamp = datetime.now(timezone.utc)

    audit_logs_collection.insert_one(
        {
            "timestamp": timestamp,
            "event": request.action,
            "incident_id": incident_id,
            "risk_level": incident.get("risk_level"),
            "risk_score": incident.get("risk_score"),
            "finding_types": incident.get("finding_types", []),
            "platform": incident.get("platform", "ChatGPT"),
            "employee_id": incident.get("employee_id"),
            "employee_name": incident.get("employee_name", "Unassigned"),
        }
    )

    return {
        "success": True,
        "incident_id": incident_id,
        "action": request.action,
        "message": "Incident action recorded",
    }

@app.get("/api/detection-rules")
def get_detection_rules(_admin: dict = Depends(require_admin)):
    rules = list(detection_rules_collection.find({}, {"_id": 0}).sort("rule_id", 1))
    return {"success": True, "count": len(rules), "rules": rules}


@app.patch("/api/detection-rules/{rule_id}/status")
def update_detection_rule_status(rule_id: str, request: DetectionRuleRequest, _admin: dict = Depends(require_admin)):
    if request.status not in {"Active", "Disabled"}:
        raise HTTPException(status_code=400, detail="status must be Active or Disabled")

    rule = detection_rules_collection.find_one({"rule_id": rule_id}, {"_id": 0})
    if not rule:
        raise HTTPException(status_code=404, detail="Detection rule not found")

    if rule_id in PROTECTED_RULES and request.status == "Disabled":
        raise HTTPException(
            status_code=409,
            detail="This is a protected security rule and cannot be disabled.",
        )

    now = datetime.now(timezone.utc)
    detection_rules_collection.update_one(
        {"rule_id": rule_id},
        {"$set": {"status": request.status, "last_updated": now}},
    )
    audit_logs_collection.insert_one(
        {
            "timestamp": now,
            "event": "DETECTION_RULE_STATUS_CHANGED",
            "rule_id": rule_id,
            "rule_name": rule.get("name"),
            "previous_status": rule.get("status"),
            "new_status": request.status,
        }
    )
    updated = detection_rules_collection.find_one({"rule_id": rule_id}, {"_id": 0})
    return {"success": True, "rule": updated}


@app.post("/api/detection-rules")
def create_detection_rule(request: DetectionRuleRequest, _admin: dict = Depends(require_admin)):
    required = {
        "name": request.name,
        "category": request.category,
        "detection_type": request.detection_type,
        "severity": request.severity,
        "pattern": request.pattern,
        "description": request.description,
    }

    if any(value is None or not str(value).strip() for value in required.values()):
        raise HTTPException(status_code=400, detail="All rule fields are required")

    if request.detection_type not in {"LOCAL", "CONTEXTUAL"}:
        raise HTTPException(
            status_code=400,
            detail="detection_type must be LOCAL or CONTEXTUAL",
        )

    if request.severity not in {"High", "Medium", "Low"}:
        raise HTTPException(
            status_code=400,
            detail="severity must be High, Medium, or Low",
        )

    if detection_rules_collection.find_one({"name": request.name}):
        raise HTTPException(status_code=409, detail="A rule with this name already exists")

    existing = list(
        detection_rules_collection.find(
            {"rule_id": {"$regex": "^RUL-"}},
            {"rule_id": 1, "_id": 0},
        )
    )

    numbers = []
    for item in existing:
        try:
            numbers.append(int(item["rule_id"].split("-")[1]))
        except (ValueError, IndexError):
            pass

    next_number = max(numbers, default=0) + 1
    rule_id = f"RUL-{next_number:03d}"
    now = datetime.now(timezone.utc)

    rule = {
        "rule_id": rule_id,
        "name": request.name.strip(),
        "category": request.category.strip(),
        "detection_type": request.detection_type,
        "severity": request.severity,
        "status": request.status or "Active",
        "pattern": request.pattern.strip(),
        "description": request.description.strip(),
        "protected": bool(request.protected),
        "last_updated": now,
    }

    detection_rules_collection.insert_one(rule)

    audit_logs_collection.insert_one(
        {
            "timestamp": now,
            "event": "DETECTION_RULE_CREATED",
            "rule_id": rule_id,
            "rule_name": rule["name"],
        }
    )

    rule.pop("_id", None)

    return {
        "success": True,
        "rule": rule,
    }


@app.patch("/api/detection-rules/{rule_id}")
def update_detection_rule(rule_id: str, request: DetectionRuleRequest, _admin: dict = Depends(require_admin)):
    existing = detection_rules_collection.find_one({"rule_id": rule_id}, {"_id": 0})

    if not existing:
        raise HTTPException(status_code=404, detail="Detection rule not found")

    # Protected rules can be edited, but cannot be made unprotected.
    if existing.get("protected") and request.protected is False:
        raise HTTPException(
            status_code=409,
            detail="Protected security rules cannot be made unprotected.",
        )

    updates = {}

    for field in [
        "name",
        "category",
        "detection_type",
        "severity",
        "pattern",
        "description",
    ]:
        value = getattr(request, field)

        if value is not None:
            if isinstance(value, str):
                value = value.strip()

            if not value:
                raise HTTPException(status_code=400, detail=f"{field} cannot be empty")

            updates[field] = value

    if request.status is not None:
        if request.status not in {"Active", "Disabled"}:
            raise HTTPException(status_code=400, detail="status must be Active or Disabled")

        if existing.get("protected") and request.status == "Disabled":
            raise HTTPException(
                status_code=409,
                detail="This is a protected security rule and cannot be disabled.",
            )

        updates["status"] = request.status

    if request.detection_type is not None:
        if request.detection_type not in {"LOCAL", "CONTEXTUAL"}:
            raise HTTPException(
                status_code=400,
                detail="detection_type must be LOCAL or CONTEXTUAL",
            )

    if request.severity is not None:
        if request.severity not in {"High", "Medium", "Low"}:
            raise HTTPException(
                status_code=400,
                detail="severity must be High, Medium, or Low",
            )

    if request.protected is not None:
        if existing.get("protected"):
            updates["protected"] = True
        else:
            updates["protected"] = request.protected

    updates["last_updated"] = datetime.now(timezone.utc)

    detection_rules_collection.update_one({"rule_id": rule_id}, {"$set": updates})

    audit_logs_collection.insert_one(
        {
            "timestamp": updates["last_updated"],
            "event": "DETECTION_RULE_UPDATED",
            "rule_id": rule_id,
            "rule_name": existing.get("name"),
            "changes": {
                key: value
                for key, value in updates.items()
                if key != "last_updated"
            },
        }
    )

    updated = detection_rules_collection.find_one({"rule_id": rule_id}, {"_id": 0})

    return {
        "success": True,
        "rule": updated,
    }

@app.get("/api/employees")
def get_employees(_admin: dict = Depends(require_admin)):
    employees = list(employees_collection.find({}, {"_id": 0}).sort("name", 1))
    results = []
    for employee in employees:
        item = _employee_payload(employee)
        item.update(_employee_stats(employee["employee_id"]))
        results.append(item)
    return {"success": True, "count": len(results), "employees": results}


@app.get("/api/employees/{employee_id}")
def get_employee(employee_id: str, _admin: dict = Depends(require_admin)):
    employee = employees_collection.find_one({"employee_id": employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    item = _employee_payload(employee)
    item["stats"] = _employee_stats(employee_id)
    item["incidents_detail"] = list(
        incidents_collection.find({"employee_id": employee_id}, {"_id": 0}).sort("timestamp", -1).limit(50)
    )
    return {"success": True, "employee": item}


@app.post("/api/employees")
def create_employee(request: EmployeeRequest, _admin: dict = Depends(require_admin)):
    if request.status not in {"Active", "Disabled"}:
        raise HTTPException(status_code=400, detail="status must be Active or Disabled")
    if employees_collection.find_one({"email": request.email.lower()}):
        raise HTTPException(status_code=409, detail="An employee with this email already exists")

    employee_id = f"EMP-{uuid4().hex[:8].upper()}"
    now = datetime.now(timezone.utc)
    employee = {
        "employee_id": employee_id,
        "name": request.name,
        "email": request.email.lower(),
        "department": request.department,
        "role": request.role,
        "extension_active": request.extension_active,
        "status": request.status,
        # STEP 1: always initialize fresh extension security state server-side.
        # EmployeeRequest ignores any client-supplied "extension" payload, so
        # callers cannot set credential_hash/paired status via this endpoint.
        "extension": default_extension_state(),
        "created_at": now,
        "last_active": None,
    }
    employees_collection.insert_one(employee)
    audit_logs_collection.insert_one(
        {
            "timestamp": now,
            "event": "EMPLOYEE_CREATED",
            "employee_id": employee_id,
            "employee_name": request.name,
            "department": request.department,
        }
    )
    created = _employee_payload(employee)
    created.update(_employee_stats(employee_id))
    return {"success": True, "employee": created}


@app.patch("/api/employees/{employee_id}")
def update_employee(employee_id: str, request: EmployeeRequest, _admin: dict = Depends(require_admin)):
    existing = employees_collection.find_one({"employee_id": employee_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found")
    if request.status not in {"Active", "Disabled"}:
        raise HTTPException(status_code=400, detail="status must be Active or Disabled")

    duplicate = employees_collection.find_one(
        {"email": request.email.lower(), "employee_id": {"$ne": employee_id}}
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="An employee with this email already exists")

    now = datetime.now(timezone.utc)
    update = {
        "name": request.name,
        "email": request.email.lower(),
        "department": request.department,
        "role": request.role,
        "extension_active": request.extension_active,
        "status": request.status,
    }
    # STEP 1: deliberately no "extension" key here. The normal employee update
    # endpoint must not be usable to change paired status, access/protection
    # flags, or credential_hash (also enforced by EmployeeRequest extra="ignore").
    employees_collection.update_one({"employee_id": employee_id}, {"$set": update})
    audit_logs_collection.insert_one(
        {
            "timestamp": now,
            "event": "EMPLOYEE_UPDATED",
            "employee_id": employee_id,
            "employee_name": request.name,
            "department": request.department,
        }
    )
    employee = employees_collection.find_one({"employee_id": employee_id}, {"_id": 0})
    item = _employee_payload(employee)
    item.update(_employee_stats(employee_id))
    return {"success": True, "employee": item}


@app.post("/api/auth/login")
def admin_login(request: Request, body: AdminLoginRequest):
    """Authenticate administrator using environment credentials and establish session."""
    check_login_rate_limit(request, body.email)

    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_email or not admin_password:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Administrator authentication is not configured on this server",
        )

    if not verify_admin_credentials(body.email, body.password):
        record_login_failure(request, body.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
        )

    reset_login_rate_limit(request, body.email)

    existing_admin = request.session.get("admin")
    if isinstance(existing_admin, dict) and existing_admin.get("session_id"):
        revoke_admin_session(existing_admin.get("session_id"))

    admin_data = create_admin_session(admin_email)
    request.session["admin"] = admin_data

    audit_logs_collection.insert_one(
        {
            "timestamp": datetime.now(timezone.utc),
            "event": "ADMIN_LOGIN_SUCCESS",
            "admin_email": admin_data["email"],
        }
    )

    return {
        "success": True,
        "message": "Authenticated successfully",
        "admin": {
            "email": admin_data["email"],
            "role": admin_data["role"],
        },
    }


@app.get("/api/auth/me")
def get_auth_me(admin: dict = Depends(require_admin)):
    """Return whether the current request has a valid admin session and minimal identity."""
    return {
        "success": True,
        "authenticated": True,
        "admin": {
            "email": admin.get("email"),
            "role": admin.get("role", "admin"),
        },
    }


@app.post("/api/auth/logout")
def admin_logout(request: Request):
    """Clear the active admin session, revoke it server-side, and invalidate the session cookie."""
    admin = request.session.get("admin")
    admin_email = admin.get("email") if isinstance(admin, dict) else None
    session_id = admin.get("session_id") if isinstance(admin, dict) else None

    if session_id:
        revoke_admin_session(session_id)

    request.session.clear()

    if admin_email:
        audit_logs_collection.insert_one(
            {
                "timestamp": datetime.now(timezone.utc),
                "event": "ADMIN_LOGOUT",
                "admin_email": admin_email,
            }
        )

    return {
        "success": True,
        "message": "Logged out successfully",
    }


@app.post("/api/employees/{employee_id}/extension/pairing-code")
def generate_extension_pairing_code(
    employee_id: str,
    admin: dict = Depends(require_admin),
):
    """STEP 2: Admin-generated one-time extension pairing code.

    Generates a secure temporary pairing code (valid for 10 minutes) for the specified employee.
    Invalidates any previous unused pairing codes for this employee.
    Stores ONLY the SHA-256 hash in database and returns plaintext code ONCE to admin.
    """
    employee = employees_collection.find_one({"employee_id": employee_id})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Invalidate previous unused pairing codes for this employee
    extension_pairing_codes_collection.update_many(
        {"employee_id": employee_id, "used": False},
        {"$set": {"used": True}},
    )

    code = generate_pairing_code()
    code_hash = hash_pairing_code(code)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=10)

    current_ext = _normalize_extension_state(employee.get("extension"))
    expected_paired_at = current_ext.get("paired_at")

    doc = {
        "employee_id": employee_id,
        "code_hash": code_hash,
        "created_at": now,
        "expires_at": expires_at,
        "used": False,
        "expected_paired_at": expected_paired_at,
    }
    extension_pairing_codes_collection.insert_one(doc)

    audit_logs_collection.insert_one(
        {
            "timestamp": now,
            "event": "EXTENSION_PAIRING_CODE_GENERATED",
            "employee_id": employee_id,
            "admin_email": admin.get("email") if isinstance(admin, dict) else None,
            "expires_at": expires_at,
        }
    )

    return {
        "success": True,
        "employee_id": employee_id,
        "code": code,
        "expires_at": expires_at.isoformat(),
        "expires_in_seconds": 600,
    }


@app.post("/api/extension/pair")
def pair_extension(request: ExtensionPairRequest):
    """STEP 3: Validate and consume pairing code atomically, issue extension credential.

    Consumes code atomically in MongoDB, derives employee identity,
    generates bearer credential, updates employee extension state (paired=True,
    credential_hash=SHA256(credential)), and returns plaintext credential ONCE.
    """
    normalized_code = normalize_pairing_code(request.code)
    code_hash = hash_pairing_code(normalized_code)
    now = datetime.now(timezone.utc)

    # Atomically find and consume the pairing code (single-use, non-expired)
    pairing_doc = extension_pairing_codes_collection.find_one_and_update(
        {
            "code_hash": code_hash,
            "used": False,
            "expires_at": {"$gt": now},
        },
        {"$set": {"used": True, "used_at": now}},
        return_document=ReturnDocument.BEFORE,
    )

    if not pairing_doc:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired pairing code",
        )

    employee_id = pairing_doc.get("employee_id")
    employee = employees_collection.find_one({"employee_id": employee_id})
    if not employee or employee.get("status") != "Active":
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired pairing code",
        )

    # Generate high-entropy bearer credential
    credential = generate_extension_credential()
    cred_hash = hash_credential(credential)

    current_ext = _normalize_extension_state(employee.get("extension"))
    device_info = request.device_info if request.device_info is not None else current_ext.get("device_info")
    updated_extension = {
        **current_ext,
        "paired": True,
        "paired_at": now,
        "credential_hash": cred_hash,
        "device_info": device_info,
    }

    # Optimistic concurrency control: ensure employee pairing state hasn't changed since code generation
    expected_paired_at = pairing_doc.get("expected_paired_at")
    if expected_paired_at is None:
        concurrency_filter = {
            "employee_id": employee_id,
            "$or": [
                {"extension": {"$exists": False}},
                {"extension": None},
                {"extension.paired": False},
                {"extension.paired_at": None},
            ],
        }
    else:
        concurrency_filter = {
            "employee_id": employee_id,
            "extension.paired_at": expected_paired_at,
        }

    update_result = employees_collection.update_one(
        concurrency_filter,
        {"$set": {"extension": updated_extension, "extension_active": True}},
    )

    if update_result.matched_count == 0:
        raise HTTPException(
            status_code=409,
            detail="Pairing conflict: employee pairing state was modified by another request. Please generate a fresh pairing code.",
        )

    # Invalidate any remaining unused pairing codes for this employee (safeguard)
    try:
        extension_pairing_codes_collection.update_many(
            {"employee_id": employee_id, "used": False},
            {"$set": {"used": True, "invalidated_at": now}},
        )
    except Exception as exc:
        logger.warning(
            "Non-fatal error: failed to invalidate sibling pairing codes for employee_id=%s: %s",
            employee_id,
            exc,
        )

    audit_logs_collection.insert_one(
        {
            "timestamp": now,
            "event": "EXTENSION_PAIRED",
            "employee_id": employee_id,
            "employee_name": employee.get("name"),
            "department": employee.get("department"),
            "paired_at": now,
        }
    )

    return {
        "success": True,
        "employee_id": employee_id,
        "employee_name": employee.get("name"),
        "credential": credential,
        "paired_at": now.isoformat(),
        "access_enabled": updated_extension["access_enabled"],
        "protection_enabled": updated_extension["protection_enabled"],
    }


@app.get("/api/analytics/organization")
def get_organization_analytics(range_days: int = 30, _admin: dict = Depends(require_admin)):
    """Return organization-wide security analytics derived only from incident metadata."""
    if range_days not in {7, 30, 90}:
        raise HTTPException(status_code=400, detail="range_days must be 7, 30, or 90")

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=range_days)
    rows = list(
        incidents_collection.find(
            {"timestamp": {"$gte": cutoff}},
            {"_id": 0},
        ).sort("timestamp", 1)
    )

    total = len(rows)
    blocked = sum(1 for x in rows if x.get("action") == "BLOCK")
    warnings = sum(1 for x in rows if x.get("action") == "WARN")
    high = sum(1 for x in rows if x.get("risk_level") == "HIGH")
    medium = sum(1 for x in rows if x.get("risk_level") == "MEDIUM")
    low = sum(1 for x in rows if x.get("risk_level") == "LOW")
    scores = [int(x.get("risk_score", 0)) for x in rows]

    action_distribution = [
        {"name": "Blocked", "value": blocked},
        {"name": "Warned", "value": warnings},
    ]
    risk_distribution = [
        {"name": "High", "value": high},
        {"name": "Medium", "value": medium},
        {"name": "Low", "value": low},
    ]

    category_counts = {}
    platform_counts = {}
    department_counts = {}
    employee_map = {}
    pattern_events = 0
    contextual_events = 0

    for row in rows:
        platform = row.get("platform") or "Unknown"
        platform_counts[platform] = platform_counts.get(platform, 0) + 1

        department = row.get("employee_department") or "Unassigned"
        department_counts[department] = department_counts.get(department, 0) + 1

        for finding_type in row.get("finding_types", []):
            category_counts[finding_type] = category_counts.get(finding_type, 0) + 1

        finding_types = set(row.get("finding_types", []))
        if finding_types:
            pattern_events += 1
        if row.get("context_signals"):
            contextual_events += 1

        employee_id = row.get("employee_id") or "UNASSIGNED"
        employee_name = row.get("employee_name") or "Unassigned"
        item = employee_map.setdefault(
            employee_id,
            {
                "employee_id": employee_id,
                "employee_name": employee_name,
                "department": department,
                "incidents": 0,
                "blocked": 0,
                "warnings": 0,
                "high_risk_events": 0,
                "risk_total": 0,
                "top_violation_counts": {},
            },
        )
        item["incidents"] += 1
        item["blocked"] += int(row.get("action") == "BLOCK")
        item["warnings"] += int(row.get("action") == "WARN")
        score = int(row.get("risk_score", 0))
        item["risk_total"] += score
        item["high_risk_events"] += int(score >= 70)
        for finding_type in row.get("finding_types", []):
            counts = item["top_violation_counts"]
            counts[finding_type] = counts.get(finding_type, 0) + 1

    employee_ranking = []
    for item in employee_map.values():
        counts = item.pop("top_violation_counts")
        item["average_risk"] = round(item["risk_total"] / item["incidents"]) if item["incidents"] else 0
        item.pop("risk_total", None)
        item["block_rate"] = round(item["blocked"] / item["incidents"] * 100) if item["incidents"] else 0
        item["top_violation"] = max(counts.items(), key=lambda pair: pair[1])[0] if counts else "None"
        employee_ranking.append(item)
    employee_ranking.sort(key=lambda x: (-x["average_risk"], -x["incidents"], x["employee_name"]))

    department_ranking = []
    for department, count in sorted(department_counts.items(), key=lambda pair: (-pair[1], pair[0])):
        dept_rows = [x for x in rows if (x.get("employee_department") or "Unassigned") == department]
        dept_scores = [int(x.get("risk_score", 0)) for x in dept_rows]
        department_ranking.append(
            {
                "department": department,
                "incidents": count,
                "average_risk": round(sum(dept_scores) / len(dept_scores)) if dept_scores else 0,
                "blocked": sum(1 for x in dept_rows if x.get("action") == "BLOCK"),
                "high_risk_events": sum(1 for x in dept_rows if int(x.get("risk_score", 0)) >= 70),
            }
        )

    daily = {}
    for offset in range(range_days):
        day = (cutoff + timedelta(days=offset + 1)).date().isoformat()
        daily[day] = {"date": day, "incidents": 0, "blocked": 0, "warnings": 0, "average_risk": 0, "_scores": []}
    for row in rows:
        ts = row.get("timestamp")
        if isinstance(ts, datetime):
            day = ts.astimezone(timezone.utc).date().isoformat()
        else:
            day = str(ts)[:10]
        if day in daily:
            point = daily[day]
            point["incidents"] += 1
            point["blocked"] += int(row.get("action") == "BLOCK")
            point["warnings"] += int(row.get("action") == "WARN")
            point["_scores"].append(int(row.get("risk_score", 0)))

    trend = []
    for point in sorted(daily.values(), key=lambda x: x["date"]):
        scores_for_day = point.pop("_scores")
        point["average_risk"] = round(sum(scores_for_day) / len(scores_for_day)) if scores_for_day else 0
        trend.append(point)

    return {
        "success": True,
        "range_days": range_days,
        "overview": {
            "total_incidents": total,
            "blocked": blocked,
            "warnings": warnings,
            "high_risk": high,
            "average_risk": round(sum(scores) / len(scores)) if scores else 0,
            "block_rate": round(blocked / total * 100) if total else 0,
            "employees_impacted": len(employee_map),
            "departments_impacted": len(department_counts),
        },
        "trend": trend,
        "risk_distribution": risk_distribution,
        "action_distribution": action_distribution,
        "categories": [
            {"category": k, "count": v}
            for k, v in sorted(category_counts.items(), key=lambda pair: (-pair[1], pair[0]))
        ],
        "platforms": [
            {"platform": k, "incidents": v}
            for k, v in sorted(platform_counts.items(), key=lambda pair: (-pair[1], pair[0]))
        ],
        "departments": department_ranking,
        "employees": employee_ranking[:20],
        "detection_methods": [
            {"name": "Pattern Detection", "value": pattern_events},
            {"name": "Contextual Analysis", "value": contextual_events},
        ],
    }

@app.get("/api/policies")
def get_policies(_admin: dict = Depends(require_admin)):
    policies = list(
        policies_collection.find({}, {"_id": 0})
        .sort("risk_min", 1)
    )
    return {"success": True, "count": len(policies), "policies": policies}


def _validate_policy_overlap(policy_id: str | None, request: PolicyRequest):
    if request.status != "Active":
        return
    active = policies_collection.find({"status": "Active"}, {"_id": 0})
    for existing in active:
        if policy_id and existing.get("policy_id") == policy_id:
            continue
        if request.risk_min <= existing.get("risk_max", -1) and request.risk_max >= existing.get("risk_min", 101):
            raise HTTPException(
                status_code=409,
                detail=f"Active risk range overlaps policy {existing.get('policy_id')}. Adjust the risk range or disable the existing policy first.",
            )


@app.post("/api/policies")
def create_policy(request: PolicyRequest, _admin: dict = Depends(require_admin)):
    _validate_policy_overlap(None, request)
    policy_id = f"POL-{uuid4().hex[:6].upper()}"
    timestamp = datetime.now(timezone.utc)
    policy = {
        "policy_id": policy_id,
        "name": request.name,
        "category": request.category,
        "risk_min": request.risk_min,
        "risk_max": request.risk_max,
        "action": request.action,
        "status": request.status,
        "description": request.description,
        "last_updated": timestamp,
    }
    policies_collection.insert_one(policy)
    audit_logs_collection.insert_one({
        "timestamp": timestamp,
        "event": "POLICY_CREATED",
        "policy_id": policy_id,
        "policy_name": request.name,
        "action": request.action,
        "status": request.status,
    })
    policy.pop("_id", None)
    return {"success": True, "policy": policy}

@app.patch("/api/policies/{policy_id}")
def update_policy(policy_id: str, request: PolicyRequest, _admin: dict = Depends(require_admin)):
    existing = policies_collection.find_one({"policy_id": policy_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Policy not found")

    _validate_policy_overlap(policy_id, request)
    timestamp = datetime.now(timezone.utc)
    updated = {
        "name": request.name,
        "category": request.category,
        "risk_min": request.risk_min,
        "risk_max": request.risk_max,
        "action": request.action,
        "status": request.status,
        "description": request.description,
        "last_updated": timestamp,
    }
    policies_collection.update_one({"policy_id": policy_id}, {"$set": updated})
    audit_logs_collection.insert_one({
        "timestamp": timestamp,
        "event": "POLICY_UPDATED",
        "policy_id": policy_id,
        "policy_name": request.name,
        "action": request.action,
        "status": request.status,
    })
    policy = policies_collection.find_one({"policy_id": policy_id}, {"_id": 0})
    return {"success": True, "policy": policy}

@app.delete("/api/policies/{policy_id}")
def delete_policy(policy_id: str, _admin: dict = Depends(require_admin)):
    existing = policies_collection.find_one({"policy_id": policy_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Policy not found")

    timestamp = datetime.now(timezone.utc)
    policies_collection.delete_one({"policy_id": policy_id})
    audit_logs_collection.insert_one({
        "timestamp": timestamp,
        "event": "POLICY_DELETED",
        "policy_id": policy_id,
        "policy_name": existing.get("name"),
    })
    return {"success": True, "policy_id": policy_id}

@app.get("/api/audit-log")
def get_audit_log(limit: int = 100, _admin: dict = Depends(require_admin)):
    limit = max(1, min(limit, 500))
    logs = list(
        audit_logs_collection
        .find({}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(limit)
    )
    return {"success": True, "count": len(logs), "logs": logs}


# ---------------------------------------------------------------------------
# Static frontend serving (same-origin SPA deployment)
#
# In production the React/Vite build artefacts are placed at /app/dist inside
# the Docker image.  STATIC_DIR can be overridden by the environment variable
# of the same name.  When the directory does not exist (local dev without a
# build, CI test runs) the static routes are simply not registered and all
# existing behaviour is unchanged.
# ---------------------------------------------------------------------------

from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

_STATIC_DIR_ENV = os.getenv("STATIC_DIR", "")
_STATIC_DIR: Path | None = None

if _STATIC_DIR_ENV:
    _candidate = Path(_STATIC_DIR_ENV)
    if _candidate.is_dir():
        _STATIC_DIR = _candidate
        logger.info("Static frontend directory: %s", _STATIC_DIR)
    else:
        logger.warning(
            "STATIC_DIR='%s' does not exist or is not a directory; "
            "frontend static serving is disabled.",
            _STATIC_DIR_ENV,
        )
else:
    # Resolve relative to this file: backend/app/main.py → backend/app → backend → project root
    _default = Path(__file__).resolve().parent.parent.parent / "dist"
    if _default.is_dir():
        _STATIC_DIR = _default
        logger.info("Static frontend directory (auto-detected): %s", _STATIC_DIR)
    else:
        logger.info(
            "No built frontend found at '%s'; static serving disabled. "
            "Run 'npm run build' at the project root to enable it.",
            _default,
        )

if _STATIC_DIR is not None:
    _assets_dir = _STATIC_DIR / "assets"
    if _assets_dir.is_dir():
        # Vite places hashed JS/CSS bundles under /assets — serve them directly.
        # These files are content-addressed so long cache headers are safe.
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="spa-assets")

    # Individual files that Vite copies to the root of the dist directory
    # (vite.svg, favicon.ico, robots.txt, …).  We enumerate them explicitly
    # so that the catch-all below never intercepts /api/* paths.
    _ROOT_STATIC_EXTS = {".svg", ".ico", ".png", ".txt", ".webmanifest", ".json"}

    @app.get("/vite.svg", include_in_schema=False)
    @app.get("/favicon.ico", include_in_schema=False)
    @app.get("/robots.txt", include_in_schema=False)
    def _root_static_file(request: Request) -> FileResponse:
        """Serve individual root-level static assets copied by Vite."""
        filename = request.url.path.lstrip("/")
        target = _STATIC_DIR / filename  # type: ignore[operator]
        if target.is_file():
            return FileResponse(str(target))
        raise HTTPException(status_code=404, detail="Not found")

    @app.get("/{full_path:path}", include_in_schema=False)
    def _spa_fallback(full_path: str) -> FileResponse:
        """SPA catch-all: serve index.html for any path not already handled.

        This route is registered *last*, so all /api/* routes defined above it
        take priority.  For unknown paths that look like static asset requests
        (file extension present but file absent) we return a 404 rather than
        serving index.html, which would give the React router an incorrect
        document for a missing resource.

        /api/* paths that have no matching route must also return 404 JSON, not
        index.html — the guard below ensures this explicitly.
        """
        # Guard: /api/* paths with no matching route → JSON 404, not index.html
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="Not found")
        # Reject requests for missing static-looking paths (e.g. /icon.png)
        if "." in full_path.rsplit("/", 1)[-1]:
            raise HTTPException(status_code=404, detail="Not found")
        index = _STATIC_DIR / "index.html"  # type: ignore[operator]
        if not index.is_file():
            raise HTTPException(status_code=503, detail="Frontend not built")
        return FileResponse(str(index))