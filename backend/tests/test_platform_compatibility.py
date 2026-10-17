"""Focused backend platform compatibility and regression tests for AgiesAI Sentinel.

Verifies:
1. All seven supported platform identifiers are recognized in ALLOWED_PLATFORMS.
2. Contextual analysis recognizes DeepSeek and Grok alongside existing platforms.
3. Fallback logic safely defaults unknown platforms to ChatGPT.
4. /api/detect accepts each platform and preserves it in the response and incident logging.
5. Existing ChatGPT behavior remains unchanged.
"""

from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.auth import require_extension_protection
from app.engines.contextual_analysis import (
    MEDIUM_RISK_CONTEXTS,
    analyze_context,
)
from app.engines.detection_rules import DEFAULT_DETECTION_RULES
from app.engines.pattern_detection import detect_patterns
from app.engines.policy_engine import DEFAULT_POLICIES, evaluate_policy
from app.engines.risk_engine import calculate_risk
from app.main import ALLOWED_PLATFORMS, DetectionRequest, app


EXPECTED_PLATFORMS = {
    "ChatGPT",
    "Gemini",
    "Claude",
    "Copilot",
    "Perplexity",
    "DeepSeek",
    "Grok",
}


def test_allowed_platforms_set_contains_all_seven():
    """Verify ALLOWED_PLATFORMS contains all 7 target platforms exactly."""
    assert ALLOWED_PLATFORMS == EXPECTED_PLATFORMS
    assert len(ALLOWED_PLATFORMS) == 7
    for platform in EXPECTED_PLATFORMS:
        assert platform in ALLOWED_PLATFORMS


def test_detection_request_model_defaults_to_chatgpt():
    """Verify DetectionRequest default platform is 'ChatGPT' for backward compatibility."""
    req = DetectionRequest(text="Hello world")
    assert req.platform == "ChatGPT"


def test_detection_request_model_accepts_all_platforms():
    """Verify DetectionRequest accepts all 7 platforms in pydantic validation."""
    for platform in EXPECTED_PLATFORMS:
        req = DetectionRequest(text="Hello world", platform=platform)
        assert req.platform == platform


@pytest.mark.parametrize(
    "platform_keyword",
    [
        "chatgpt",
        "gemini",
        "claude",
        "copilot",
        "perplexity",
        "deepseek",
        "grok",
        "ai assistant",
        "external ai",
    ],
)
def test_contextual_analysis_external_ai_regex_matches(platform_keyword):
    """Verify external_ai regex in MEDIUM_RISK_CONTEXTS matches all platforms including DeepSeek & Grok."""
    pattern, weight = MEDIUM_RISK_CONTEXTS["external_ai"]
    assert weight == 20
    text = f"Please send this summary to {platform_keyword} for analysis."
    assert pattern.search(text.lower()) is not None


def test_contextual_analysis_external_ai_signal_generation():
    """Verify analyze_context produces external_ai signal for DeepSeek and Grok."""
    with patch("app.engines.contextual_analysis._rule_enabled", return_value=True):
        res_deepseek = analyze_context("Please summarize this code in DeepSeek", {"detected": False})
        signals_deepseek = [s["signal"] for s in res_deepseek["signals"]]
        assert "external_ai" in signals_deepseek

        res_grok = analyze_context("Please ask Grok for an answer", {"detected": False})
        signals_grok = [s["signal"] for s in res_grok["signals"]]
        assert "external_ai" in signals_grok


def test_contextual_analysis_combination_signal_with_deepseek_and_grok():
    """Verify combination signal sensitive_data_to_external_ai fires when data is detected with DeepSeek/Grok."""
    with patch("app.engines.contextual_analysis._rule_enabled", return_value=True):
        res_deepseek = analyze_context(
            "Send this database token to DeepSeek",
            {"detected": True},
        )
        signals = [s["signal"] for s in res_deepseek["signals"]]
        assert "external_ai" in signals
        assert "sensitive_data_to_external_ai" in signals

        res_grok = analyze_context(
            "Send this private key to Grok",
            {"detected": True},
        )
        signals = [s["signal"] for s in res_grok["signals"]]
        assert "external_ai" in signals
        assert "sensitive_data_to_external_ai" in signals


def test_detection_rule_description_updated():
    """Verify RUL-011 EXTERNAL_AI_DESTINATION pattern description lists all 7 platforms."""
    rul_011 = next(r for r in DEFAULT_DETECTION_RULES if r["rule_id"] == "RUL-011")
    for platform in EXPECTED_PLATFORMS:
        assert platform in rul_011["pattern"], f"{platform} missing in RUL-011 pattern description"


@pytest.fixture
def mock_extension_user():
    """Fixture providing mock authenticated employee context for require_extension_protection."""
    return {
        "employee_id": "EMP-TEST-PLATFORM",
        "name": "Platform Test User",
        "email": "platform.test@agiesai.test",
        "department": "Security Operations",
        "role": "Security Engineer",
        "status": "Active",
        "extension_active": True,
        "extension": {
            "paired": True,
            "access_enabled": True,
            "protection_enabled": True,
        },
    }


def test_api_detect_all_seven_platforms_preserved(mock_extension_user):
    """Verify /api/detect accepts each of the seven platforms and echoes the platform identifier."""
    client = TestClient(app)
    app.dependency_overrides[require_extension_protection] = lambda: mock_extension_user

    try:
        with (
            patch("app.main.employees_collection.update_one") as mock_update,
            patch("app.main.incidents_collection.insert_one") as mock_incident_insert,
            patch("app.main.audit_logs_collection.insert_one") as mock_audit_insert,
            patch("app.engines.pattern_detection.is_rule_active", return_value=True),
            patch("app.engines.contextual_analysis.is_rule_active", return_value=True),
            patch("app.engines.policy_engine.policies_collection.find", return_value=DEFAULT_POLICIES),
        ):
            mock_update.return_value = MagicMock(matched_count=1)
            mock_incident_insert.return_value = MagicMock(inserted_id="mock_inc_id")
            mock_audit_insert.return_value = MagicMock(inserted_id="mock_audit_id")

            for platform in EXPECTED_PLATFORMS:
                response = client.post(
                    "/api/detect",
                    json={
                        "text": f"Routine review of system logs on {platform}.",
                        "platform": platform,
                    },
                )
                assert response.status_code == 200, f"Expected 200 for {platform}"
                data = response.json()
                assert data["success"] is True
                assert data["platform"] == platform, f"Expected platform '{platform}', got '{data['platform']}'"
                assert data["employee_id"] == "EMP-TEST-PLATFORM"
                assert "detection" in data
                assert "risk" in data
                assert "policy" in data
    finally:
        app.dependency_overrides.clear()


def test_api_detect_unknown_platform_fallback_to_chatgpt(mock_extension_user):
    """Verify /api/detect safely coerces unrecognized platforms to 'ChatGPT'."""
    client = TestClient(app)
    app.dependency_overrides[require_extension_protection] = lambda: mock_extension_user

    try:
        with (
            patch("app.main.employees_collection.update_one") as mock_update,
            patch("app.main.incidents_collection.insert_one") as mock_incident_insert,
            patch("app.main.audit_logs_collection.insert_one") as mock_audit_insert,
            patch("app.engines.pattern_detection.is_rule_active", return_value=True),
            patch("app.engines.contextual_analysis.is_rule_active", return_value=True),
            patch("app.engines.policy_engine.policies_collection.find", return_value=DEFAULT_POLICIES),
        ):
            mock_update.return_value = MagicMock(matched_count=1)
            mock_incident_insert.return_value = MagicMock(inserted_id="mock_inc_id")
            mock_audit_insert.return_value = MagicMock(inserted_id="mock_audit_id")

            for invalid_platform in ["UnsupportedAI", "Bard", "", "CustomLLM", "Deepseek"]:  # Case-sensitive check
                response = client.post(
                    "/api/detect",
                    json={
                        "text": "Scanning query with invalid platform.",
                        "platform": invalid_platform,
                    },
                )
                assert response.status_code == 200
                data = response.json()
                assert data["success"] is True
                assert data["platform"] == "ChatGPT", f"Invalid platform '{invalid_platform}' must fall back to 'ChatGPT'"
    finally:
        app.dependency_overrides.clear()


def test_api_detect_chatgpt_regression(mock_extension_user):
    """Verify existing ChatGPT behavior is strictly preserved for safe and blocked prompts."""
    client = TestClient(app)
    app.dependency_overrides[require_extension_protection] = lambda: mock_extension_user

    try:
        with (
            patch("app.main.employees_collection.update_one") as mock_update,
            patch("app.main.incidents_collection.insert_one") as mock_incident_insert,
            patch("app.main.audit_logs_collection.insert_one") as mock_audit_insert,
            patch("app.engines.pattern_detection.is_rule_active", return_value=True),
            patch("app.engines.contextual_analysis.is_rule_active", return_value=True),
            patch("app.engines.policy_engine.policies_collection.find", return_value=DEFAULT_POLICIES),
        ):
            mock_update.return_value = MagicMock(matched_count=1)
            mock_incident_insert.return_value = MagicMock(inserted_id="mock_inc_id")
            mock_audit_insert.return_value = MagicMock(inserted_id="mock_audit_id")

            # 1. Safe prompt on ChatGPT -> ALLOW, no incident created
            res_safe = client.post(
                "/api/detect",
                json={"text": "Write a clean sorting function in Python.", "platform": "ChatGPT"},
            )
            assert res_safe.status_code == 200
            data_safe = res_safe.json()
            assert data_safe["platform"] == "ChatGPT"
            assert data_safe["policy"]["decision"] == "ALLOW"
            assert data_safe["incident_id"] is None
            mock_incident_insert.assert_not_called()

            # 2. Critical secret on ChatGPT -> BLOCK, incident created with platform="ChatGPT"
            res_block = client.post(
                "/api/detect",
                json={
                    "text": "AWS secret key AKIAIOSFODNN7EXAMPLE for cloud backup",
                    "platform": "ChatGPT",
                },
            )
            assert res_block.status_code == 200
            data_block = res_block.json()
            assert data_block["platform"] == "ChatGPT"
            assert data_block["policy"]["decision"] == "BLOCK"
            assert data_block["incident_id"] is not None

            # Verify incident document recorded "ChatGPT"
            mock_incident_insert.assert_called_once()
            call_args = mock_incident_insert.call_args[0][0]
            assert call_args["platform"] == "ChatGPT"
            assert call_args["action"] == "BLOCK"
            assert call_args["employee_id"] == "EMP-TEST-PLATFORM"
    finally:
        app.dependency_overrides.clear()
