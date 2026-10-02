from typing import Any

from app.database import policies_collection

CRITICAL_FINDINGS = {
    "API_KEY",
    "AWS_ACCESS_KEY",
    "PRIVATE_KEY",
    "DATABASE_URL",
    "CREDIT_CARD",
    "PASSWORD_ASSIGNMENT",
}

DEFAULT_POLICIES = [
    {
        "policy_id": "POL-001",
        "name": "Block High-Risk Credentials",
        "category": "Credentials",
        "risk_min": 70,
        "risk_max": 100,
        "action": "BLOCK",
        "status": "Active",
        "description": "Block high-risk submissions from leaving the browser.",
    },
    {
        "policy_id": "POL-002",
        "name": "Warn on Medium Risk",
        "category": "General",
        "risk_min": 40,
        "risk_max": 69,
        "action": "WARN",
        "status": "Active",
        "description": "Ask employees to review potentially sensitive submissions.",
    },
    {
        "policy_id": "POL-003",
        "name": "Allow Low-Risk Content",
        "category": "General",
        "risk_min": 0,
        "risk_max": 39,
        "action": "ALLOW",
        "status": "Active",
        "description": "Permit content below the configured medium-risk threshold.",
    },
]


def ensure_default_policies() -> None:
    """Seed the database only when no policies exist."""
    try:
        if policies_collection.count_documents({}) == 0:
            policies_collection.insert_many(DEFAULT_POLICIES)
    except Exception:
        # Detection should remain available even if policy persistence is temporarily unavailable.
        pass


def _active_policies() -> list[dict[str, Any]]:
    policies = list(policies_collection.find({"status": "Active"}, {"_id": 0}))
    policies.sort(key=lambda p: (p.get("risk_min", 0), p.get("risk_max", 100)))
    return policies


def _risk_policy(score: int) -> dict[str, Any] | None:
    for policy in _active_policies():
        if policy.get("risk_min", 0) <= score <= policy.get("risk_max", 100):
            return policy
    return None


def evaluate_policy(
    risk: dict[str, Any],
    detection: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    score = risk.get("score", 0)
    finding_types = {f.get("type") for f in (detection or {}).get("findings", [])}
    signals = {s.get("signal") for s in (context or {}).get("signals", [])}

    # Non-negotiable safety guardrails remain above configurable policies.
    if finding_types & CRITICAL_FINDINGS:
        return {
            "decision": "BLOCK",
            "policy": "CRITICAL_SENSITIVE_DATA_BLOCK",
            "message": "This submission was blocked because it contains high-risk sensitive information.",
        }

    if "confidential_information" in signals and (
        {"external_ai", "external_destination", "external_sharing"} & signals
    ):
        return {
            "decision": "BLOCK",
            "policy": "CONFIDENTIAL_EXTERNAL_AI_BLOCK",
            "message": "This submission was blocked because confidential information is being sent to an external AI destination.",
        }

    if {"EMAIL", "PHONE"}.issubset(finding_types) and score < 70:
        policy = _risk_policy(score)
        return {
            "decision": "WARN",
            "policy": policy.get("policy_id", "PII_COMBINATION_WARNING") if policy else "PII_COMBINATION_WARNING",
            "message": "Multiple personal-information fields were detected. Review before continuing.",
        }

    policy = _risk_policy(score)
    if policy:
        action = policy.get("action", "WARN")
        return {
            "decision": action,
            "policy": policy.get("policy_id", "CONFIGURED_POLICY"),
            "message": _message_for_action(action, policy.get("name")),
        }

    # Fail closed if an administrator creates a gap in active risk ranges.
    return {
        "decision": "BLOCK",
        "policy": "NO_MATCHING_ACTIVE_POLICY",
        "message": "This submission was blocked because no active policy covers its risk score.",
    }


def _message_for_action(action: str, name: str | None) -> str:
    if action == "BLOCK":
        return f"This submission was blocked by policy: {name or 'configured security policy'}."
    if action == "WARN":
        return f"Potentially sensitive information was detected. Review before continuing ({name or 'configured policy'})."
    return f"No blocking policy applies to this submission ({name or 'configured policy'})."
