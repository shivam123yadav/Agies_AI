from typing import Any

RISK_WEIGHTS = {
    "EMAIL": 35,
    "PHONE": 35,
    "API_KEY": 45,
    "AWS_ACCESS_KEY": 50,
    "PRIVATE_KEY": 60,
    "DATABASE_URL": 55,
    "CREDIT_CARD": 60,
    "PASSWORD_ASSIGNMENT": 55,
}


def calculate_risk(detection: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    score = 5
    reasons = []

    for finding in detection.get("findings", []):
        finding_type = finding.get("type")
        count = finding.get("count", 1)
        weight = RISK_WEIGHTS.get(finding_type, 10)
        contribution = weight + max(0, count - 1) * 5
        score += contribution
        reasons.append({"type": finding_type, "weight": weight, "count": count, "contribution": contribution})

    context_modifier = (context or {}).get("score_modifier", 0)
    score += context_modifier
    score = max(0, min(score, 100))

    if score >= 70:
        level = "HIGH"
    elif score >= 40:
        level = "MEDIUM"
    else:
        level = "LOW"

    return {"score": score, "level": level, "context_modifier": context_modifier, "reasons": reasons}
