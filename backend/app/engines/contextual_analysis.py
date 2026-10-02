from typing import Any
import re

from app.engines.detection_rules import is_rule_active


HIGH_RISK_CONTEXTS = {
    "production_environment": (
        re.compile(r"\b(?:production|prod)\b"),
        20,
    ),

    "database": (
        re.compile(r"\b(?:database|db)\b"),
        15,
    ),

    "deployment": (
        re.compile(r"\b(?:deploy|deployment)\b"),
        15,
    ),

    "server": (
        re.compile(r"\bserver\b"),
        10,
    ),

    "administrative_access": (
        re.compile(r"\b(?:admin|root|administrator)\b"),
        15,
    ),

    "credentials": (
        re.compile(
            r"\b(?:credential|credentials|secret|secrets|password|passwd|api[\s_-]?key)\b"
        ),
        15,
    ),

    "private_information": (
        re.compile(r"\bprivate\b"),
        10,
    ),

    "confidential_information": (
        re.compile(
            r"\b(?:confidential|restricted|proprietary|internal"
            r"(?:\s+(?:information|document|data|report))?)\b"
        ),
        35,
    ),

    "financial_information": (
        re.compile(
            r"\b(?:revenue|financial|financials|forecast|salary|payroll|bank|transaction)\b"
        ),
        20,
    ),
}


MEDIUM_RISK_CONTEXTS = {
    "external_sharing": (
        re.compile(
            r"\b(?:send|share|upload|paste|give|forward|submit)\b"
        ),
        10,
    ),

    "external_destination": (
        re.compile(
            r"\b(?:external|public|third[- ]party|outside)\b"
        ),
        10,
    ),

    "external_ai": (
        re.compile(
            r"\b(?:chatgpt|gemini|claude|copilot|perplexity"
            r"|ai\s+assistant|external\s+ai)\b"
        ),
        20,
    ),
}


SAFE_CONTEXTS = {
    "example_or_testing": (
        re.compile(r"\b(?:sample|test|testing|dummy|example)\b"),
        -10,
    ),

    "documentation": (
        re.compile(r"\bdocumentation\b"),
        -5,
    ),
}


# Only use rule names that actually exist in detection_rules.py.
CONTEXT_RULE_NAMES = {
    "production_environment": "PRODUCTION_ENVIRONMENT",
    "deployment": "DEPLOYMENT_CONTEXT",
    "confidential_information": "CONFIDENTIAL_INFORMATION",
    "financial_information": "FINANCIAL_INFORMATION",
    "external_sharing": "EXTERNAL_SHARING",
    "external_ai": "EXTERNAL_AI_DESTINATION",
    "external_destination": "EXTERNAL_DESTINATION",
}


def _rule_enabled(concept: str) -> bool:
    """
    Check whether the corresponding configurable detection rule
    is active.

    Context concepts without a database rule are intentionally kept
    local to this engine.
    """
    rule_name = CONTEXT_RULE_NAMES.get(concept)

    if rule_name is None:
        return True

    return is_rule_active(rule_name)


def analyze_context(
    text: str,
    detection: dict[str, Any],
) -> dict[str, Any]:

    normalized_text = text.lower()

    score_modifier = 0
    signals = []

    # ---------------------------------------------------------
    # HIGH-RISK CONTEXT
    # ---------------------------------------------------------

    for concept, (pattern, weight) in HIGH_RISK_CONTEXTS.items():

        if not _rule_enabled(concept):
            continue

        if pattern.search(normalized_text):

            score_modifier += weight

            signals.append(
                {
                    "signal": concept,
                    "category": "HIGH_RISK_CONTEXT",
                    "impact": weight,
                }
            )

    # ---------------------------------------------------------
    # MEDIUM-RISK CONTEXT
    # ---------------------------------------------------------

    for concept, (pattern, weight) in MEDIUM_RISK_CONTEXTS.items():

        if not _rule_enabled(concept):
            continue

        if pattern.search(normalized_text):

            score_modifier += weight

            signals.append(
                {
                    "signal": concept,
                    "category": "MEDIUM_RISK_CONTEXT",
                    "impact": weight,
                }
            )

    # ---------------------------------------------------------
    # SAFE CONTEXT
    # ---------------------------------------------------------

    for concept, (pattern, weight) in SAFE_CONTEXTS.items():

        if pattern.search(normalized_text):

            score_modifier += weight

            signals.append(
                {
                    "signal": concept,
                    "category": "SAFE_CONTEXT",
                    "impact": weight,
                }
            )

    # ---------------------------------------------------------
    # COMBINATION SIGNALS
    # ---------------------------------------------------------

    # Sensitive structured data + external AI destination
    # is more dangerous than either signal individually.
    if detection.get("detected"):

        if re.search(
            r"\b(?:chatgpt|gemini|claude|copilot|perplexity"
            r"|ai\s+assistant|external\s+ai)\b",
            normalized_text,
        ):

            combination_weight = 15
            score_modifier += combination_weight

            signals.append(
                {
                    "signal": "sensitive_data_to_external_ai",
                    "category": "COMBINATION_CONTEXT",
                    "impact": combination_weight,
                }
            )

    # Sensitive data + explicit external sharing
    if detection.get("detected"):

        if re.search(
            r"\b(?:send|share|upload|paste|forward|submit)\b",
            normalized_text,
        ):

            combination_weight = 10
            score_modifier += combination_weight

            signals.append(
                {
                    "signal": "sensitive_data_external_sharing",
                    "category": "COMBINATION_CONTEXT",
                    "impact": combination_weight,
                }
            )

    # ---------------------------------------------------------
    # LIMIT SCORE
    # ---------------------------------------------------------

    score_modifier = max(
        -20,
        min(score_modifier, 70),
    )

    # ---------------------------------------------------------
    # CONTEXT LEVEL
    # ---------------------------------------------------------

    if score_modifier >= 35:
        context_level = "HIGH"

    elif score_modifier >= 10:
        context_level = "MEDIUM"

    else:
        context_level = "LOW"

    return {
        "context_level": context_level,
        "score_modifier": score_modifier,
        "signals": signals,
    }