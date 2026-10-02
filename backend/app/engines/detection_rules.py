from typing import Any
from app.database import detection_rules_collection

DEFAULT_DETECTION_RULES: list[dict[str, Any]] = [
    {"rule_id":"RUL-001","name":"API_KEY_PATTERN","category":"Credentials","detection_type":"LOCAL","severity":"High","status":"Active","pattern":r"\b(?:sk|pk|api)[-_]?[A-Za-z0-9_-]{16,}\b","description":"Detects common API key formats.","protected":True},
    {"rule_id":"RUL-002","name":"EMAIL_PATTERN","category":"PII","detection_type":"LOCAL","severity":"Medium","status":"Active","pattern":r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b","description":"Detects email addresses in submission content.","protected":False},
    {"rule_id":"RUL-003","name":"PHONE_PATTERN","category":"PII","detection_type":"LOCAL","severity":"High","status":"Active","pattern":r"Indian +91 and supported international phone formats","description":"Detects phone numbers using validated length rules.","protected":False},
    {"rule_id":"RUL-004","name":"AWS_ACCESS_KEY_PATTERN","category":"Credentials","detection_type":"LOCAL","severity":"High","status":"Active","pattern":r"\bAKIA[0-9A-Z]{16}\b","description":"Detects AWS access key IDs.","protected":True},
    {"rule_id":"RUL-005","name":"PRIVATE_KEY_PATTERN","category":"Credentials","detection_type":"LOCAL","severity":"High","status":"Active","pattern":"BEGIN PRIVATE KEY","description":"Detects PEM private key material.","protected":True},
    {"rule_id":"RUL-006","name":"DATABASE_URL_PATTERN","category":"Credentials","detection_type":"LOCAL","severity":"High","status":"Active","pattern":r"\b(?:mongodb|postgres(?:ql)?|mysql)://[^\s]+","description":"Detects database connection URI strings.","protected":True},
    {"rule_id":"RUL-007","name":"CREDIT_CARD_PATTERN","category":"Financial","detection_type":"LOCAL","severity":"High","status":"Active","pattern":r"13-19 digit payment card pattern + Luhn validation","description":"Detects payment card numbers and validates them with Luhn checksum.","protected":True},
    {"rule_id":"RUL-008","name":"PASSWORD_ASSIGNMENT_PATTERN","category":"Credentials","detection_type":"LOCAL","severity":"High","status":"Active","pattern":r"password|passwd|pwd|secret = or : value","description":"Detects explicit password or secret assignments.","protected":True},
    {"rule_id":"RUL-009","name":"PRODUCTION_ENVIRONMENT","category":"Business Context","detection_type":"CONTEXTUAL","severity":"High","status":"Active","pattern":"production / prod","description":"Raises risk when sensitive content references production environments.","protected":False},
    {"rule_id":"RUL-010","name":"CONFIDENTIAL_INFORMATION","category":"Business Information","detection_type":"CONTEXTUAL","severity":"High","status":"Active","pattern":"confidential / restricted / proprietary / internal","description":"Detects confidential business terminology and raises contextual risk.","protected":True},
    {"rule_id":"RUL-011","name":"EXTERNAL_AI_DESTINATION","category":"External Sharing","detection_type":"CONTEXTUAL","severity":"High","status":"Active","pattern":"ChatGPT / Gemini / Claude / Copilot / external AI","description":"Identifies submissions intended for external AI destinations.","protected":True},
    {"rule_id":"RUL-012","name":"EXTERNAL_SHARING","category":"External Sharing","detection_type":"CONTEXTUAL","severity":"Medium","status":"Active","pattern":"send / share / upload / paste / submit","description":"Detects language indicating information is being shared externally.","protected":False},
    {"rule_id":"RUL-013","name":"EXTERNAL_DESTINATION","category":"External Sharing","detection_type":"CONTEXTUAL","severity":"Medium","status":"Active","pattern":"external / public / third-party / outside","description":"Detects explicit external destination language.","protected":False},
    {"rule_id":"RUL-014","name":"DEPLOYMENT_CONTEXT","category":"Business Context","detection_type":"CONTEXTUAL","severity":"High","status":"Active","pattern":"deploy / deployment","description":"Raises risk around deployment-related submissions.","protected":False},
    {"rule_id":"RUL-015","name":"FINANCIAL_INFORMATION","category":"Business Information","detection_type":"CONTEXTUAL","severity":"Medium","status":"Active","pattern":"revenue / forecast / salary / payroll / bank / transaction","description":"Detects internal financial terminology in context.","protected":False},
]

PROTECTED_RULES = {r["rule_id"] for r in DEFAULT_DETECTION_RULES if r["protected"]}

def ensure_default_detection_rules() -> None:
    try:
        if detection_rules_collection.count_documents({}) == 0:
            detection_rules_collection.insert_many(DEFAULT_DETECTION_RULES)
    except Exception:
        pass

def list_detection_rules() -> list[dict[str, Any]]:
    rows = list(detection_rules_collection.find({}, {"_id":0}).sort("rule_id", 1))
    return rows

def get_active_rule_names() -> set[str]:
    try:
        return {r["name"] for r in detection_rules_collection.find({"status":"Active"}, {"name":1, "_id":0})}
    except Exception:
        return {r["name"] for r in DEFAULT_DETECTION_RULES}

def is_rule_active(name: str) -> bool:
    if not name:
        return False

    try:
        row = detection_rules_collection.find_one(
            {"name": name},
            {"status": 1, "_id": 0}
        )

        # If the rule is not present in the database,
        # fall back to the default rule configuration.
        if row is None:
            return any(
                rule["name"] == name and rule["status"] == "Active"
                for rule in DEFAULT_DETECTION_RULES
            )

        return row.get("status") == "Active"

    except Exception:
        # Keep default security rules active if MongoDB is temporarily unavailable.
        return any(
            rule["name"] == name and rule["status"] == "Active"
            for rule in DEFAULT_DETECTION_RULES
        )
