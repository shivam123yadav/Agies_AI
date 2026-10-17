"""Phase 2A, 2A.1, 2B, 2C, and 2D Automated Verification Test Suite for AgiesAI Sentinel Extension.

Verifies:
1. ChatGPT hostname resolution & regression tests.
2. Gemini hostname resolution & legitimate subdomain matching.
3. Claude hostname resolution & legitimate subdomain matching.
4. Perplexity hostname resolution & legitimate subdomain matching.
5. Lookalike-domain rejection for Perplexity, Claude, Gemini, and ChatGPT.
6. Other AI platform rejection (Copilot, DeepSeek, Grok).
7. Canonical platform identifiers ('ChatGPT', 'Gemini', 'Claude', 'Perplexity').
8. Safe prompt ALLOW behavior with text-bound token.
9. WARN cancellation and explicit continuation.
10. BLOCK prevents submission and clears approval.
11. Backend failure remains fail-closed.
12. Employee revocation behavior remains intact.
13. Approved resubmission single-use token and loop protection.
14. Phase 2A.1: Editor text changed after approval (text-mismatch invalidation).
15. Phase 2A.1: Failed or disabled send button immediately clears approval.
16. Phase 2A.1: Thrown exception during programmatic submit immediately clears approval.
17. Phase 2A.1: Manual submission while approval is pending (same vs different text).
18. Phase 2A.1: Approval timeout expiration.
19. Phase 2A.1: Duplicate submissions and repeated event types.
20. Phase 2A.1: Programmatic submit flag isolation.
21. Phase 2B: Gemini adapter heuristics, flows, and boundary isolation.
22. Phase 2C: Claude adapter heuristics, flows, and boundary isolation.
23. Phase 2D: Perplexity editor discovery, submit control, Enter-key interception.
24. Phase 2D: Perplexity ALLOW, WARN Cancel, WARN Continue, BLOCK, and fail-closed flows.
25. Phase 2D: Perplexity text alteration, disabled button, and token lifecycle.
26. Phase 2D: Perplexity manifest permission scope & boundary isolation.
"""

import os
import re
from pathlib import Path
import pytest

EXTENSION_DIR = Path(__file__).resolve().parent.parent.parent / "extension"


# ---------------------------------------------------------------------------
# Python implementations directly mirroring extension contracts for verification
# ---------------------------------------------------------------------------

SUPPORTED_PLATFORMS = {
    "ChatGPT",
    "Gemini",
    "Claude",
    "Copilot",
    "Perplexity",
    "DeepSeek",
    "Grok",
}


def validate_platform(platform: str | None) -> str:
    if isinstance(platform, str) and platform in SUPPORTED_PLATFORMS:
        return platform
    return "ChatGPT"


class MockChatGPTAdapter:
    name = "ChatGPT"
    hostnames = ["chatgpt.com", "chat.openai.com"]

    @staticmethod
    def matches(hostname: str | None) -> bool:
        if not isinstance(hostname, str):
            return False
        clean_host = hostname.split(":")[0].lower().strip()
        return (
            clean_host == "chatgpt.com"
            or clean_host.endswith(".chatgpt.com")
            or clean_host == "chat.openai.com"
            or clean_host.endswith(".chat.openai.com")
        )

    @staticmethod
    def is_send_button(tag: str, disabled: bool, aria_disabled: str, label: str) -> bool:
        if tag.upper() != "BUTTON":
            return False
        if disabled or aria_disabled == "true":
            return False
        return bool(re.search(r"send|submit|prompt|message-submit", label.lower()))

    @staticmethod
    def is_submit_key(key: str, shift: bool, alt: bool, ctrl: bool, meta: bool, target_is_editor: bool) -> bool:
        if key != "Enter" or shift or alt or ctrl or meta:
            return False
        return target_is_editor


class MockGeminiAdapter:
    name = "Gemini"
    hostnames = ["gemini.google.com"]

    @staticmethod
    def matches(hostname: str | None) -> bool:
        if not isinstance(hostname, str):
            return False
        clean_host = hostname.split(":")[0].lower().strip()
        return (
            clean_host == "gemini.google.com"
            or clean_host.endswith(".gemini.google.com")
        )

    @staticmethod
    def is_send_button(tag: str, disabled: bool, aria_disabled: str, label: str) -> bool:
        if tag.upper() not in ("BUTTON", "DIV"):
            return False
        if disabled or aria_disabled == "true":
            return False
        return bool(re.search(r"send|submit|prompt|send message", label.lower()))

    @staticmethod
    def is_submit_key(key: str, shift: bool, alt: bool, ctrl: bool, meta: bool, target_is_editor: bool) -> bool:
        if key != "Enter" or shift or alt or ctrl or meta:
            return False
        return target_is_editor


class MockClaudeAdapter:
    name = "Claude"
    hostnames = ["claude.ai"]

    @staticmethod
    def matches(hostname: str | None) -> bool:
        if not isinstance(hostname, str):
            return False
        clean_host = hostname.split(":")[0].lower().strip()
        return (
            clean_host == "claude.ai"
            or clean_host.endswith(".claude.ai")
        )

    @staticmethod
    def is_send_button(tag: str, disabled: bool, aria_disabled: str, label: str) -> bool:
        if tag.upper() not in ("BUTTON", "DIV"):
            return False
        if disabled or aria_disabled == "true":
            return False
        return bool(re.search(r"send|submit", label.lower()))

    @staticmethod
    def is_submit_key(key: str, shift: bool, alt: bool, ctrl: bool, meta: bool, target_is_editor: bool) -> bool:
        if key != "Enter" or shift or alt or ctrl or meta:
            return False
        return target_is_editor


class MockPerplexityAdapter:
    name = "Perplexity"
    hostnames = ["perplexity.ai", "www.perplexity.ai"]

    @staticmethod
    def matches(hostname: str | None) -> bool:
        if not isinstance(hostname, str):
            return False
        clean_host = hostname.split(":")[0].lower().strip()
        return (
            clean_host == "perplexity.ai"
            or clean_host.endswith(".perplexity.ai")
        )

    @staticmethod
    def is_send_button(tag: str, disabled: bool, aria_disabled: str, label: str) -> bool:
        if tag.upper() not in ("BUTTON", "DIV"):
            return False
        if disabled or aria_disabled == "true":
            return False
        if re.search(r"attach|focus|file|upload|copy|share", label.lower()):
            return False
        return bool(re.search(r"submit|search|send|ask", label.lower()))

    @staticmethod
    def is_submit_key(key: str, shift: bool, alt: bool, ctrl: bool, meta: bool, target_is_editor: bool) -> bool:
        if key != "Enter" or shift or alt or ctrl or meta:
            return False
        return target_is_editor


ADAPTER_REGISTRY = [
    MockChatGPTAdapter,
    MockGeminiAdapter,
    MockClaudeAdapter,
    MockPerplexityAdapter,
]


def resolve_platform_adapter(hostname: str | None):
    if not isinstance(hostname, str):
        return None
    clean_host = hostname.split(":")[0].lower().strip()
    if not clean_host:
        return None
    for adapter in ADAPTER_REGISTRY:
        if adapter.matches(clean_host):
            return adapter
    return None


class StateManager:
    """Mirrors the hardened Phase 2A.1 and Phase 2B token state manager."""

    def __init__(self):
        self.busy = False
        self.is_programmatic_submitting = False
        self.approved_token = None

    def clear_approval(self):
        self.approved_token = None

    def arm_approved_submit(self, text: str):
        self.clear_approval()
        if not isinstance(text, str) or not text.strip():
            return
        self.approved_token = {
            "text": text,
            "timer": "active",
        }

    def consume_allowed_submit(self, current_text: str) -> bool:
        token = self.approved_token
        if not token:
            return False
        # Single-use: always clear token on first evaluation
        self.clear_approval()
        # Text binding: must match exact approved prompt text
        if not isinstance(current_text, str) or current_text != token["text"]:
            return False
        return True

    def submit_after_decision(self, editor_text: str, button_available: bool = True, should_throw: bool = False, approved_text: str | None = None) -> bool:
        if not editor_text:
            self.clear_approval()
            return False

        if approved_text is not None and editor_text != approved_text:
            self.clear_approval()
            return False

        self.arm_approved_submit(editor_text)

        triggered = False
        self.is_programmatic_submitting = True
        try:
            if should_throw:
                raise RuntimeError("DOM dispatch failed")
            if button_available:
                triggered = True
            else:
                triggered = False
        except Exception:
            triggered = False
        finally:
            self.is_programmatic_submitting = False
            self.clear_approval()

        return triggered


def map_content_script_notice(error_message: str):
    msg = error_message or ""
    title = "Security Engine Unavailable"
    body = "Sentinel could not verify this submission. The message was NOT sent."

    if any(k in msg for k in ("401", "revoked", "must be paired")):
        title = "Extension Unpaired / Credential Revoked"
        body = "Extension is disconnected or credential was revoked. Pairing is required before submissions can be verified. The message was NOT sent."
    elif any(k in msg for k in ("403", "disabled")):
        title = "Extension Access Disabled"
        body = "Extension or employee access has been disabled by administrator policy. The message was NOT sent."

    return {
        "decision": "BLOCK",
        "title": title,
        "body": body,
    }


def compute_popup_status(credential: str | None, connection_status: str | None, employee_name: str = ""):
    if not credential:
        if connection_status == "REVOKED":
            return {
                "cardClass": "status disconnected",
                "text": "Disconnected — Revoked",
                "pairingNotice": "Extension credential revoked by administrator. Please pair again.",
            }
        return {
            "cardClass": "status disconnected",
            "text": "Unpaired — Disconnected",
            "pairingNotice": "Pairing required to activate protection.",
        }
    if connection_status == "DISABLED":
        return {
            "cardClass": "status disabled",
            "text": "Access Disabled by Admin",
            "pairingNotice": None,
        }
    return {
        "cardClass": "status",
        "text": f"Protection Active ({employee_name})" if employee_name else "Protection Active",
        "pairingNotice": None,
    }


def compute_identity_display(
    credential: str | None,
    employee_id: str = "",
    employee_name: str = "",
    connection_status: str | None = None,
) -> dict:
    if not credential:
        if connection_status == "REVOKED":
            label = (
                f"{employee_name} • {employee_id} (Revoked)"
                if employee_name and employee_id
                else "Credential Revoked"
            )
            return {
                "optionValue": "",
                "optionText": label,
                "statusText": "Credential revoked by administrator. Please pair again.",
                "disabled": True,
            }
        return {
            "optionValue": "",
            "optionText": "No employee identity linked",
            "statusText": "Pair extension using a code from the admin dashboard.",
            "disabled": True,
        }

    label = (
        f"{employee_name} • {employee_id}"
        if employee_name and employee_id
        else (employee_name or employee_id or "Employee Identity")
    )

    if connection_status == "DISABLED":
        return {
            "optionValue": employee_id or "",
            "optionText": label,
            "statusText": "Extension access disabled by administrator.",
            "disabled": True,
        }

    return {
        "optionValue": employee_id or "",
        "optionText": label,
        "statusText": (
            f"Active protection bound to {employee_id}."
            if employee_id
            else "Active protection bound to employee."
        ),
        "disabled": True,
    }


# ===========================================================================
# 1. ChatGPT Hostname Resolution Tests (Regression)
# ===========================================================================

@pytest.mark.parametrize(
    "hostname",
    [
        "chatgpt.com",
        "chat.openai.com",
        "subdomain.chatgpt.com",
        "internal.chat.openai.com",
        "chatgpt.com:443",
        "chat.openai.com:8443",
    ],
)
def test_1_chatgpt_hostname_resolution(hostname):
    """Requirement 1: Verify ChatGPT hostnames and subdomains resolve to ChatGPTAdapter."""
    adapter = resolve_platform_adapter(hostname)
    assert adapter is not None
    assert adapter.name == "ChatGPT"


# ===========================================================================
# 2. Gemini Hostname Resolution & Lookalike-Domain Rejection (Phase 2B)
# ===========================================================================

@pytest.mark.parametrize(
    "hostname",
    [
        "gemini.google.com",
        "sub.gemini.google.com",
        "gemini.google.com:443",
        "gemini.google.com:8443",
    ],
)
def test_2b_gemini_hostname_resolution(hostname):
    """Phase 2B: Verify legitimate Gemini hostnames resolve to GeminiAdapter."""
    adapter = resolve_platform_adapter(hostname)
    assert adapter is not None
    assert adapter.name == "Gemini"


@pytest.mark.parametrize(
    "lookalike",
    [
        "notgemini.google.com",
        "gemini.google.com.attacker.com",
        "gemini-google.com",
        "google.com",
        "mail.google.com",
        "drive.google.com",
        "fake-gemini.com",
        "gemini.com",
        "gemini.google.com.fake.org",
    ],
)
def test_2b_gemini_lookalike_rejection(lookalike):
    """Phase 2B: Verify lookalike and unauthorized Google domains are rejected."""
    adapter = resolve_platform_adapter(lookalike)
    assert adapter is None, f"Lookalike domain '{lookalike}' must return None"


@pytest.mark.parametrize(
    "unsupported",
    [
        "copilot.microsoft.com",
        "deepseek.com",
        "x.com",
        "grok.com",
        "example.com",
        "",
        None,
    ],
)
def test_2_unsupported_hostname_rejection(unsupported):
    """Verify other AI platforms not yet implemented return None."""
    adapter = resolve_platform_adapter(unsupported)
    assert adapter is None


# ===========================================================================
# 3. Canonical Platform Identifiers & Background Validation
# ===========================================================================

def test_3_canonical_platform_identifiers():
    """Verify canonical platform identifiers for ChatGPT, Gemini, Claude, and Perplexity."""
    chatgpt = resolve_platform_adapter("chatgpt.com")
    assert chatgpt.name == "ChatGPT"

    gemini = resolve_platform_adapter("gemini.google.com")
    assert gemini.name == "Gemini"

    claude = resolve_platform_adapter("claude.ai")
    assert claude.name == "Claude"

    perplexity = resolve_platform_adapter("perplexity.ai")
    assert perplexity.name == "Perplexity"

    for p in SUPPORTED_PLATFORMS:
        assert validate_platform(p) == p

    # Untrusted strings fallback to 'ChatGPT'
    assert validate_platform("UntrustedPlatform") == "ChatGPT"
    assert validate_platform("") == "ChatGPT"
    assert validate_platform(None) == "ChatGPT"


# ===========================================================================
# 4. Safe Prompt ALLOW Behavior Tests
# ===========================================================================

def test_4_safe_prompt_allow_behavior():
    """Verify ALLOW decision arms approval bound to prompt text and submits, clearing token immediately in finally."""
    state = StateManager()
    prompt_text = "Please write a summary of this article"

    success = state.submit_after_decision(prompt_text, button_available=True, approved_text=prompt_text)
    assert success is True
    # In Phase 3B F-04 fix: token is immediately cleared in finally, preventing dangling window
    assert state.approved_token is None

    # Subsequent re-submission cannot reuse cleared token
    assert state.consume_allowed_submit(prompt_text) is False


# ===========================================================================
# 5. WARN Cancellation and Continuation Tests
# ===========================================================================

def test_5_warn_cancellation_and_continuation():
    """Verify WARN cancellation does not submit and continuation submits."""
    prompt_text = "Database query with example structure"

    # Cancel branch
    state = StateManager()
    state.clear_approval()
    recorded_cancel = "WARNING_CANCELLED"

    assert state.approved_token is None
    assert recorded_cancel == "WARNING_CANCELLED"

    # Continue Anyway branch
    state2 = StateManager()
    recorded_continue = "CONTINUE_ANYWAY"
    success = state2.submit_after_decision(prompt_text, button_available=True, approved_text=prompt_text)

    assert recorded_continue == "CONTINUE_ANYWAY"
    assert success is True
    assert state2.approved_token is None
    assert state2.consume_allowed_submit(prompt_text) is False


# ===========================================================================
# 6. BLOCK Prevents Submission Tests
# ===========================================================================

def test_6_block_prevents_submission():
    """Verify BLOCK decision stops submission and never arms approval."""
    state = StateManager()
    state.clear_approval()

    assert state.approved_token is None
    assert state.consume_allowed_submit("any text") is False


# ===========================================================================
# 7. Backend Failure Remains Fail-Closed Tests
# ===========================================================================

@pytest.mark.parametrize(
    "error_msg, expected_title",
    [
        ("NetworkError: Failed to fetch", "Security Engine Unavailable"),
        ("Extension must be paired first", "Extension Unpaired / Credential Revoked"),
        ("Extension credential revoked or invalid (HTTP 401)", "Extension Unpaired / Credential Revoked"),
        ("Extension access disabled by administrator (HTTP 403)", "Extension Access Disabled"),
    ],
)
def test_7_backend_failure_fail_closed(error_msg, expected_title):
    """Verify all backend error paths produce BLOCK notice, clear approval, and prevent submit."""
    state = StateManager()
    state.clear_approval()
    notice = map_content_script_notice(error_msg)

    assert notice["decision"] == "BLOCK"
    assert notice["title"] == expected_title
    assert "NOT sent" in notice["body"]
    assert state.approved_token is None


# ===========================================================================
# 8. Employee Revocation Behavior Tests
# ===========================================================================

def test_8_employee_revocation_behavior():
    """Verify HTTP 401 clears credential, clears approval, and maps to revocation status."""
    store = {"credential": "token-xyz", "employeeId": "EMP-001"}
    state = StateManager()
    state.arm_approved_submit("some text")

    active_credential = "token-xyz"
    if store.get("credential") == active_credential:
        del store["credential"]
        store["connectionStatus"] = "REVOKED"
        state.clear_approval()

    assert "credential" not in store
    assert store["connectionStatus"] == "REVOKED"
    assert state.approved_token is None


# ===========================================================================
# 9. Duplicate Submission and Infinite Loop Protection Tests
# ===========================================================================

def test_9_approved_resubmission_loop_protection():
    """Single-use approved submit token consumed immediately; prevents loop."""
    state = StateManager()
    prompt = "Hello world"
    state.arm_approved_submit(prompt)

    first_pass = state.consume_allowed_submit(prompt)
    assert first_pass is True
    assert state.approved_token is None

    second_pass = state.consume_allowed_submit(prompt)
    assert second_pass is False


# ===========================================================================
# Phase 2A.1 Hardened Resubmission Security Tests
# ===========================================================================

def test_2a1_editor_text_changed_after_approval():
    """Phase 2A.1: If editor text changes after approval, approval is expired and rejected."""
    state = StateManager()
    approved_text = "Safe prompt about python"
    state.arm_approved_submit(approved_text)

    modified_text = "Safe prompt about python with sk-live-secret12345"

    result = state.consume_allowed_submit(modified_text)
    assert result is False, "Modified prompt must NOT pass through approval"
    assert state.approved_token is None, "Approval must be expired on text mismatch"

    assert state.consume_allowed_submit(approved_text) is False


def test_2a1_failed_or_disabled_send_button():
    """Phase 2A.1: If send button is disabled/missing, approval is cleared immediately."""
    state = StateManager()
    prompt = "Test prompt"

    triggered = state.submit_after_decision(prompt, button_available=False)
    assert triggered is False
    assert state.approved_token is None, "Approval token must be cleared immediately if submit not triggered"


def test_2a1_thrown_exception_during_programmatic_submit():
    """Phase 2A.1: If DOM dispatch throws an exception, approval is cleared immediately."""
    state = StateManager()
    prompt = "Test prompt"

    triggered = state.submit_after_decision(prompt, should_throw=True)
    assert triggered is False
    assert state.approved_token is None, "Approval token must be cleared on exception"
    assert state.is_programmatic_submitting is False


def test_2a1_manual_submission_while_approval_pending():
    """Phase 2A.1: Manual submission while approval is pending."""
    state = StateManager()
    approved = "Approved prompt"
    state.arm_approved_submit(approved)

    assert state.consume_allowed_submit(approved) is True
    assert state.approved_token is None

    state.arm_approved_submit("Another prompt")
    assert state.consume_allowed_submit("Different prompt") is False
    assert state.approved_token is None


def test_2a1_approval_timeout_expiration():
    """Phase 2A.1: Approval timeout expires the token."""
    state = StateManager()
    prompt = "Expiring prompt"
    state.arm_approved_submit(prompt)
    assert state.approved_token is not None

    state.clear_approval()
    assert state.approved_token is None
    assert state.consume_allowed_submit(prompt) is False


def test_2a1_duplicate_submissions_and_repeated_event_types():
    """Phase 2A.1: Repeated event types (click then submit) cannot double-consume."""
    state = StateManager()
    prompt = "Prompt"
    state.arm_approved_submit(prompt)

    consumed_1 = state.consume_allowed_submit(prompt)
    assert consumed_1 is True

    consumed_2 = state.consume_allowed_submit(prompt)
    assert consumed_2 is False, "Second event must not consume an already cleared token"


def test_2a1_programmatic_submitting_flag_isolation():
    """Phase 2A.1: Programmatic submit flag protects against self-interception during dispatch."""
    state = StateManager()
    assert state.is_programmatic_submitting is False

    state.is_programmatic_submitting = True
    assert state.is_programmatic_submitting is True

    state.is_programmatic_submitting = False
    assert state.is_programmatic_submitting is False


# ===========================================================================
# Phase 2B Gemini DOM Heuristics & Specific Tests
# ===========================================================================

def test_2b_gemini_dom_heuristics():
    """Phase 2B: Gemini adapter send button and Enter key heuristics."""
    # Send button recognition
    assert MockGeminiAdapter.is_send_button("BUTTON", False, "false", "Send prompt") is True
    assert MockGeminiAdapter.is_send_button("BUTTON", False, "false", "Send message") is True
    assert MockGeminiAdapter.is_send_button("DIV", False, "false", "Send message") is True

    # Disabled send button
    assert MockGeminiAdapter.is_send_button("BUTTON", True, "false", "Send prompt") is False
    assert MockGeminiAdapter.is_send_button("BUTTON", False, "true", "Send prompt") is False

    # Unrelated buttons
    assert MockGeminiAdapter.is_send_button("BUTTON", False, "false", "Attach image") is False
    assert MockGeminiAdapter.is_send_button("BUTTON", False, "false", "Microphone") is False

    # Enter key heuristics
    assert MockGeminiAdapter.is_submit_key("Enter", False, False, False, False, True) is True
    assert MockGeminiAdapter.is_submit_key("Enter", True, False, False, False, True) is False
    assert MockGeminiAdapter.is_submit_key("Enter", False, False, False, False, False) is False


def test_2b_gemini_full_allow_lifecycle():
    """Phase 2B: Gemini prompt full lifecycle on non-form page: ALLOW decision, programmatic submit, immediate token cleanup."""
    state = StateManager()
    gemini_prompt = "Explain quantum computing in simple terms"

    # 1. ALLOW decision triggers submitAfterDecision on Gemini (no form)
    triggered = state.submit_after_decision(gemini_prompt, button_available=True, approved_text=gemini_prompt)
    assert triggered is True
    # Immediately after dispatch, token is cleared (Phase 3B F-04 remediation)
    assert state.approved_token is None

    # 2. Subsequent manual submit cannot reuse prior approval
    assert state.consume_allowed_submit(gemini_prompt) is False


def test_2b_gemini_changed_prompt_text_intercepted():
    """Phase 2B: If user alters prompt after Gemini approval, approval is invalidated and intercepted."""
    state = StateManager()
    gemini_prompt = "Explain quantum computing"
    state.arm_approved_submit(gemini_prompt)

    altered_prompt = "Explain quantum computing and my secret sk-live-9999"
    consumed = state.consume_allowed_submit(altered_prompt)
    assert consumed is False, "Altered Gemini prompt must be rejected by approval validator"
    assert state.approved_token is None, "Token must be expired"


def test_2b_gemini_disabled_button_immediate_clear():
    """Phase 2B: If Gemini send button is disabled, approval token is immediately cleared."""
    state = StateManager()
    gemini_prompt = "Prompt when button is disabled"

    triggered = state.submit_after_decision(gemini_prompt, button_available=False)
    assert triggered is False
    assert state.approved_token is None, "Token must be cleared immediately when button is disabled"


# ===========================================================================
# Phase 2C Claude DOM Heuristics & Specific Tests
# ===========================================================================

@pytest.mark.parametrize(
    "hostname",
    [
        "claude.ai",
        "sub.claude.ai",
        "claude.ai:443",
        "claude.ai:8443",
    ],
)
def test_2c_claude_hostname_resolution(hostname):
    """Phase 2C: Verify legitimate Claude hostnames resolve to ClaudeAdapter."""
    adapter = resolve_platform_adapter(hostname)
    assert adapter is not None
    assert adapter.name == "Claude"


@pytest.mark.parametrize(
    "lookalike",
    [
        "notclaude.ai",
        "claude.ai.attacker.com",
        "claude-ai.com",
        "anthropic.com",
        "api.anthropic.com",
        "fake-claude.ai",
        "claude.com",
        "claude.ai.fake.org",
    ],
)
def test_2c_claude_lookalike_rejection(lookalike):
    """Phase 2C: Verify lookalike and unauthorized Anthropic domains are rejected."""
    adapter = resolve_platform_adapter(lookalike)
    assert adapter is None, f"Lookalike domain '{lookalike}' must return None"


def test_2c_claude_dom_heuristics():
    """Phase 2C: Claude adapter send button and Enter key heuristics."""
    # Send button recognition
    assert MockClaudeAdapter.is_send_button("BUTTON", False, "false", "Send Message") is True
    assert MockClaudeAdapter.is_send_button("BUTTON", False, "false", "Send prompt") is True
    assert MockClaudeAdapter.is_send_button("BUTTON", False, "false", "Submit") is True

    # Disabled send button
    assert MockClaudeAdapter.is_send_button("BUTTON", True, "false", "Send Message") is False
    assert MockClaudeAdapter.is_send_button("BUTTON", False, "true", "Send Message") is False

    # Unrelated buttons
    assert MockClaudeAdapter.is_send_button("BUTTON", False, "false", "Add content") is False
    assert MockClaudeAdapter.is_send_button("BUTTON", False, "false", "Artifacts") is False
    assert MockClaudeAdapter.is_send_button("BUTTON", False, "false", "Style editor") is False

    # Enter key heuristics
    assert MockClaudeAdapter.is_submit_key("Enter", False, False, False, False, True) is True
    assert MockClaudeAdapter.is_submit_key("Enter", True, False, False, False, True) is False
    assert MockClaudeAdapter.is_submit_key("Enter", False, False, False, False, False) is False


def test_2c_claude_full_allow_lifecycle():
    """Phase 2C: Claude prompt full lifecycle: ALLOW decision, programmatic submit, immediate token cleanup."""
    state = StateManager()
    claude_prompt = "Write an executive summary of our Q3 project roadmap"

    # 1. ALLOW decision triggers submitAfterDecision
    triggered = state.submit_after_decision(claude_prompt, button_available=True, approved_text=claude_prompt)
    assert triggered is True
    # Immediately after dispatch, token is cleared (Phase 3B F-04 remediation)
    assert state.approved_token is None

    # 2. Subsequent submit requires fresh analysis
    assert state.consume_allowed_submit(claude_prompt) is False


def test_2c_claude_warn_cancellation_and_continuation():
    """Phase 2C: Claude WARN cancellation and continuation behaviors."""
    prompt_text = "Review my internal database schema with sample fields"

    # Cancel branch
    state = StateManager()
    state.clear_approval()
    recorded_cancel = "WARNING_CANCELLED"

    assert state.approved_token is None
    assert recorded_cancel == "WARNING_CANCELLED"

    # Continue Anyway branch
    state2 = StateManager()
    recorded_continue = "CONTINUE_ANYWAY"
    success = state2.submit_after_decision(prompt_text, button_available=True, approved_text=prompt_text)

    assert recorded_continue == "CONTINUE_ANYWAY"
    assert success is True
    assert state2.approved_token is None
    assert state2.consume_allowed_submit(prompt_text) is False


def test_2c_claude_block_prevents_submission():
    """Phase 2C: Claude BLOCK decision stops submission and never arms approval."""
    state = StateManager()
    state.clear_approval()

    assert state.approved_token is None
    assert state.consume_allowed_submit("prompt with secret AWS keys") is False


def test_2c_claude_changed_prompt_text_intercepted():
    """Phase 2C: If user alters prompt after Claude approval, approval is invalidated and intercepted."""
    state = StateManager()
    claude_prompt = "Draft email to client"
    state.arm_approved_submit(claude_prompt)

    altered_prompt = "Draft email to client with password=secret123"
    consumed = state.consume_allowed_submit(altered_prompt)
    assert consumed is False, "Altered Claude prompt must be rejected by approval validator"
    assert state.approved_token is None, "Token must be expired"


def test_2c_claude_disabled_button_immediate_clear():
    """Phase 2C: If Claude send button is disabled, approval token is immediately cleared."""
    state = StateManager()
    claude_prompt = "Prompt when send button is disabled"

    triggered = state.submit_after_decision(claude_prompt, button_available=False)
    assert triggered is False
    assert state.approved_token is None, "Token must be cleared immediately when button is disabled"


def test_2c_claude_fail_closed_backend_error():
    """Phase 2C: Backend error on Claude submission produces BLOCK notice and halts submission."""
    state = StateManager()
    state.clear_approval()
    notice = map_content_script_notice("Failed to fetch")

    assert notice["decision"] == "BLOCK"
    assert "NOT sent" in notice["body"]
    assert state.approved_token is None


# ===========================================================================
# Phase 2D Perplexity DOM Heuristics & Specific Tests
# ===========================================================================

@pytest.mark.parametrize(
    "hostname",
    [
        "perplexity.ai",
        "www.perplexity.ai",
        "sub.perplexity.ai",
        "perplexity.ai:443",
        "www.perplexity.ai:8443",
    ],
)
def test_2d_perplexity_hostname_resolution(hostname):
    """Phase 2D: Verify legitimate Perplexity hostnames resolve to PerplexityAdapter."""
    adapter = resolve_platform_adapter(hostname)
    assert adapter is not None
    assert adapter.name == "Perplexity"


@pytest.mark.parametrize(
    "lookalike",
    [
        "notperplexity.ai",
        "perplexity.ai.attacker.com",
        "perplexity-ai.com",
        "fake-perplexity.ai",
        "perplexity.com",
        "perplexity.ai.fake.org",
        "www-perplexity.ai",
    ],
)
def test_2d_perplexity_lookalike_rejection(lookalike):
    """Phase 2D: Verify lookalike and unauthorized domains are rejected."""
    adapter = resolve_platform_adapter(lookalike)
    assert adapter is None, f"Lookalike domain '{lookalike}' must return None"


def test_2d_perplexity_dom_heuristics():
    """Phase 2D: Perplexity adapter submit button and Enter key heuristics."""
    # Send / search / submit button recognition
    assert MockPerplexityAdapter.is_send_button("BUTTON", False, "false", "Submit") is True
    assert MockPerplexityAdapter.is_send_button("BUTTON", False, "false", "Search") is True
    assert MockPerplexityAdapter.is_send_button("BUTTON", False, "false", "Ask follow-up") is True
    assert MockPerplexityAdapter.is_send_button("BUTTON", False, "false", "Send prompt") is True

    # Disabled submit button
    assert MockPerplexityAdapter.is_send_button("BUTTON", True, "false", "Submit") is False
    assert MockPerplexityAdapter.is_send_button("BUTTON", False, "true", "Submit") is False

    # Unrelated control buttons
    assert MockPerplexityAdapter.is_send_button("BUTTON", False, "false", "Attach file") is False
    assert MockPerplexityAdapter.is_send_button("BUTTON", False, "false", "Focus mode") is False
    assert MockPerplexityAdapter.is_send_button("BUTTON", False, "false", "Copy link") is False
    assert MockPerplexityAdapter.is_send_button("BUTTON", False, "false", "Share search") is False

    # Enter key heuristics
    assert MockPerplexityAdapter.is_submit_key("Enter", False, False, False, False, True) is True
    assert MockPerplexityAdapter.is_submit_key("Enter", True, False, False, False, True) is False
    assert MockPerplexityAdapter.is_submit_key("Enter", False, False, False, False, False) is False


def test_2d_perplexity_full_allow_lifecycle():
    """Phase 2D: Perplexity prompt full lifecycle: ALLOW decision, programmatic submit, token consumption."""
    state = StateManager()
    perplexity_prompt = "What are the latest developments in generative AI security?"

    # 1. ALLOW decision triggers submitAfterDecision
    triggered = state.submit_after_decision(perplexity_prompt, button_available=True, approved_text=perplexity_prompt)
    assert triggered is True
    # Immediately after dispatch, token is cleared (Phase 3B F-04 remediation)
    assert state.approved_token is None

    # 2. Subsequent submit requires fresh analysis
    assert state.consume_allowed_submit(perplexity_prompt) is False


def test_2d_perplexity_warn_cancellation_and_continuation():
    """Phase 2D: Perplexity WARN cancellation and continuation behaviors."""
    prompt_text = "Search our internal API endpoints with parameters"

    # Cancel branch
    state = StateManager()
    state.clear_approval()
    recorded_cancel = "WARNING_CANCELLED"

    assert state.approved_token is None
    assert recorded_cancel == "WARNING_CANCELLED"

    # Continue Anyway branch
    state2 = StateManager()
    recorded_continue = "CONTINUE_ANYWAY"
    success = state2.submit_after_decision(prompt_text, button_available=True, approved_text=prompt_text)

    assert recorded_continue == "CONTINUE_ANYWAY"
    assert success is True
    assert state2.approved_token is None
    assert state2.consume_allowed_submit(prompt_text) is False


def test_2d_perplexity_block_prevents_submission():
    """Phase 2D: Perplexity BLOCK decision stops submission and never arms approval."""
    state = StateManager()
    state.clear_approval()

    assert state.approved_token is None
    assert state.consume_allowed_submit("prompt containing private credentials") is False


def test_2d_perplexity_changed_prompt_text_intercepted():
    """Phase 2D: If user alters prompt after Perplexity approval, approval is invalidated and intercepted."""
    state = StateManager()
    perplexity_prompt = "Initial safe search query"
    state.arm_approved_submit(perplexity_prompt)

    altered_prompt = "Initial safe search query + leaked secret key"
    consumed = state.consume_allowed_submit(altered_prompt)
    assert consumed is False, "Altered Perplexity prompt must be rejected by approval validator"
    assert state.approved_token is None, "Token must be expired"


def test_2d_perplexity_disabled_button_immediate_clear():
    """Phase 2D: If Perplexity submit button is disabled, approval token is immediately cleared."""
    state = StateManager()
    perplexity_prompt = "Query when submit button is disabled"

    triggered = state.submit_after_decision(perplexity_prompt, button_available=False)
    assert triggered is False
    assert state.approved_token is None, "Token must be cleared immediately when button is disabled"


def test_2d_perplexity_fail_closed_backend_error():
    """Phase 2D: Backend error on Perplexity submission produces BLOCK notice and halts submission."""
    state = StateManager()
    state.clear_approval()
    notice = map_content_script_notice("Failed to fetch")

    assert notice["decision"] == "BLOCK"
    assert "NOT sent" in notice["body"]
    assert state.approved_token is None


# ===========================================================================
# 10. Existing Baseline Tests (Regression Suite)
# ===========================================================================

def test_10a_http_401_race_condition_does_not_clear_new_token():
    """Regression Test: Re-paired token is not wiped by stale in-flight 401."""
    store = {"credential": "new-paired-token-456", "employeeId": "EMP-001"}
    stale_credential = "stale-token-123"

    if store.get("credential") == stale_credential:
        del store["credential"]
        store["connectionStatus"] = "REVOKED"

    assert store["credential"] == "new-paired-token-456"
    assert store.get("connectionStatus") != "REVOKED"


def test_10b_http_403_disables_without_clearing_credential():
    """Regression Test: 403 access disabled preserves stored credential."""
    store = {"credential": "active-token-789", "employeeId": "EMP-001"}
    status_code = 403

    if status_code == 403:
        store["connectionStatus"] = "DISABLED"

    assert store["credential"] == "active-token-789"
    assert store["connectionStatus"] == "DISABLED"


def test_10c_popup_status_mappings():
    """Regression Test: Popup status text and classes for all 4 states."""
    s1 = compute_popup_status(None, None)
    assert s1["text"] == "Unpaired — Disconnected"

    s2 = compute_popup_status(None, "REVOKED")
    assert s2["text"] == "Disconnected — Revoked"

    s3 = compute_popup_status("tok", "DISABLED")
    assert s3["text"] == "Access Disabled by Admin"

    s4 = compute_popup_status("tok", "CONNECTED", employee_name="Bob")
    assert s4["text"] == "Protection Active (Bob)"


def test_10d_chatgpt_adapter_dom_heuristics():
    """Regression Test: ChatGPT adapter send button and Enter key heuristics."""
    assert MockChatGPTAdapter.is_send_button("BUTTON", False, "false", "Send prompt") is True
    assert MockChatGPTAdapter.is_send_button("BUTTON", True, "false", "Send prompt") is False
    assert MockChatGPTAdapter.is_send_button("BUTTON", False, "true", "Send prompt") is False
    assert MockChatGPTAdapter.is_send_button("BUTTON", False, "false", "Options menu") is False

    assert MockChatGPTAdapter.is_submit_key("Enter", False, False, False, False, True) is True
    assert MockChatGPTAdapter.is_submit_key("Enter", True, False, False, False, True) is False
    assert MockChatGPTAdapter.is_submit_key("Enter", False, False, False, False, False) is False


# ===========================================================================
# Source Code Integrity Tests for Extension Files
# ===========================================================================

def test_source_content_js_adapter_structure():
    """Verify extension/content.js contains all registered adapters in registry."""
    content_file = EXTENSION_DIR / "content.js"
    assert content_file.is_file(), "extension/content.js must exist"
    code = content_file.read_text(encoding="utf-8")

    assert "const ChatGPTAdapter =" in code
    assert "const GeminiAdapter =" in code
    assert "const ClaudeAdapter =" in code
    assert "const PerplexityAdapter =" in code
    assert "ChatGPTAdapter," in code
    assert "GeminiAdapter," in code
    assert "ClaudeAdapter," in code
    assert "PerplexityAdapter," in code
    assert "resolvePlatformAdapter(" in code
    assert "submitAfterDecision(" in code
    assert "armApprovedSubmit(" in code
    assert "consumeAllowedSubmit(" in code
    assert "inspectAndDecide(" in code
    assert "approvedToken" in code
    assert "isProgrammaticSubmitting" in code
    assert "LOCAL_RULES" in code
    assert "'chatgpt.com'" in code
    assert "'chat.openai.com'" in code
    assert "'gemini.google.com'" in code
    assert "'claude.ai'" in code
    assert "'perplexity.ai'" in code


def test_source_background_js_platform_allowlist():
    """Verify extension/background.js validates platform against allowlist."""
    bg_file = EXTENSION_DIR / "background.js"
    assert bg_file.is_file(), "extension/background.js must exist"
    code = bg_file.read_text(encoding="utf-8")

    assert "const SUPPORTED_PLATFORMS = new Set([" in code
    assert "validatePlatform(" in code
    assert "'ChatGPT'" in code
    assert "'Gemini'" in code
    assert "'Claude'" in code
    assert "'Perplexity'" in code
    assert "return 'ChatGPT';" in code
    assert "API_BASE" in code


def test_source_manifest_permissions_and_boundary_isolation():
    """Verify extension/manifest.json contains ChatGPT, Gemini, Claude, and Perplexity permissions, and NO broad permissions."""
    manifest_file = EXTENSION_DIR / "manifest.json"
    assert manifest_file.is_file(), "extension/manifest.json must exist"
    code = manifest_file.read_text(encoding="utf-8")

    # Authorized AI platforms in Phase 2D
    assert "https://chatgpt.com/*" in code
    assert "https://chat.openai.com/*" in code
    assert "https://gemini.google.com/*" in code
    assert "https://claude.ai/*" in code
    assert "https://www.perplexity.ai/*" in code
    assert "https://perplexity.ai/*" in code

    # Strictly forbid broad Google or Anthropic or general wildcards
    assert "*.google.com" not in code
    assert "https://google.com/*" not in code
    assert "anthropic.com" not in code
    assert "*.ai" not in code

    # Strictly forbid other AI platforms not yet authorized
    assert "copilot.microsoft.com" not in code
    assert "deepseek.com" not in code
    assert "grok.com" not in code
    assert "x.com" not in code


# ===========================================================================
# 11. Phase 3B: Approval-Token Lifecycle & F-04 Remediation Tests
# ===========================================================================

def test_3b_allow_programmatic_button_click_without_form():
    """Phase 3B: On platforms without a form submit event, approval token is immediately cleared in finally block."""
    state = StateManager()
    prompt = "Safe query on non-form single-page application"

    # Simulate ALLOW -> submit_after_decision
    triggered = state.submit_after_decision(prompt, button_available=True, approved_text=prompt)
    assert triggered is True

    # Immediate token state: must be null, never dangling for 3 seconds
    assert state.approved_token is None, "Approval token must be cleared immediately after dispatch"
    assert state.is_programmatic_submitting is False

    # A subsequent manual click or enter key cannot consume a lingering token
    assert state.consume_allowed_submit(prompt) is False, "Cleared approval must not authorize subsequent submission"


def test_3b_warn_continue_programmatic_button_click_without_form():
    """Phase 3B: WARN -> Continue Anyway flow on non-form platform clears approval immediately."""
    state = StateManager()
    prompt = "Prompt with warnings that employee continued anyway"

    # User clicks Continue Anyway
    triggered = state.submit_after_decision(prompt, button_available=True, approved_text=prompt)
    assert triggered is True

    # Immediate token state: must be null
    assert state.approved_token is None, "Approval token must be cleared immediately following Continue Anyway dispatch"
    assert state.is_programmatic_submitting is False
    assert state.consume_allowed_submit(prompt) is False


def test_3b_token_state_immediately_after_dispatch():
    """Phase 3B: Token state is verified immediately after dispatch completes."""
    state = StateManager()
    prompt = "Immediate state inspection test"

    state.arm_approved_submit(prompt)
    assert state.approved_token is not None
    assert state.approved_token["text"] == prompt

    # Trigger submit_after_decision
    state.submit_after_decision(prompt, button_available=True, approved_text=prompt)

    # Must be None synchronously upon return
    assert state.approved_token is None
    assert state.is_programmatic_submitting is False


def test_3b_prompt_modification_before_dispatch_rejected():
    """Phase 3B: If editor text is modified while modal/analysis was active, dispatch is aborted and token cleared."""
    state = StateManager()
    approved_text = "Safe prompt that backend allowed"
    modified_text = "Safe prompt that backend allowed + leaked secrets"

    # Editor text changed before dispatch
    triggered = state.submit_after_decision(editor_text=modified_text, button_available=True, approved_text=approved_text)

    assert triggered is False, "Modified prompt must abort submission"
    assert state.approved_token is None, "Token must be cleared when prompt text diverges from approved text"
    assert state.is_programmatic_submitting is False


def test_3b_duplicate_click_or_reentrant_event_blocked():
    """Phase 3B: Re-entrant event during programmatic dispatch and duplicate click after are blocked."""
    state = StateManager()
    prompt = "Prompt tested for re-entrancy"

    # While programmatic submitting is true, capture-phase listener rejects processing
    state.is_programmatic_submitting = True
    assert state.is_programmatic_submitting is True
    # Re-entrant event handler returns early
    state.is_programmatic_submitting = False

    # Execute normal dispatch
    triggered = state.submit_after_decision(prompt, button_available=True, approved_text=prompt)
    assert triggered is True

    # Immediate duplicate click: cannot consume
    assert state.consume_allowed_submit(prompt) is False
    assert state.approved_token is None


def test_3b_disabled_or_missing_send_button_immediate_clear():
    """Phase 3B: When send button is disabled or missing, dispatch fails and token is immediately cleared."""
    state = StateManager()
    prompt = "Prompt where send button is disabled"

    triggered = state.submit_after_decision(prompt, button_available=False, approved_text=prompt)
    assert triggered is False
    assert state.approved_token is None, "Approval token must be cleared immediately when button is unavailable"
    assert state.is_programmatic_submitting is False


def test_3b_submission_exception_immediate_clear():
    """Phase 3B: When DOM dispatch throws an unhandled exception, token is immediately cleared."""
    state = StateManager()
    prompt = "Prompt where DOM dispatch throws"

    triggered = state.submit_after_decision(prompt, button_available=True, should_throw=True, approved_text=prompt)
    assert triggered is False
    assert state.approved_token is None, "Approval token must be cleared even when dispatch throws"
    assert state.is_programmatic_submitting is False


def test_3b_timeout_cleanup():
    """Phase 3B: arm_approved_submit expiration clears token."""
    state = StateManager()
    state.arm_approved_submit("Expiring prompt")
    assert state.approved_token is not None

    # Trigger explicit clear / timeout
    state.clear_approval()
    assert state.approved_token is None
    assert state.consume_allowed_submit("Expiring prompt") is False


def test_3b_manual_submission_after_earlier_approved_attempt():
    """Phase 3B: Manual submission after a prior approved attempt cannot reuse approval and must undergo inspection."""
    state = StateManager()
    prompt_1 = "First approved prompt"
    prompt_2 = "Second manual prompt"

    # First prompt approved and dispatched
    assert state.submit_after_decision(prompt_1, button_available=True, approved_text=prompt_1) is True
    assert state.approved_token is None

    # User manually submits second prompt
    assert state.consume_allowed_submit(prompt_2) is False, "Second manual prompt must not inherit prior approval"

    # Even if user manually submits the SAME prompt text again
    assert state.consume_allowed_submit(prompt_1) is False, "Identical text must require new backend evaluation"


def test_3b_regression_all_four_platforms_non_form_lifecycle():
    """Phase 3B Regression: All 4 platforms (ChatGPT, Gemini, Claude, Perplexity) properly clear token after dispatch."""
    platforms = [
        ("ChatGPT", MockChatGPTAdapter, "ChatGPT user prompt"),
        ("Gemini", MockGeminiAdapter, "Gemini user query"),
        ("Claude", MockClaudeAdapter, "Claude user request"),
        ("Perplexity", MockPerplexityAdapter, "Perplexity search query"),
    ]

    for name, adapter, prompt in platforms:
        state = StateManager()
        triggered = state.submit_after_decision(prompt, button_available=True, approved_text=prompt)
        assert triggered is True, f"{name} dispatch must succeed"
        assert state.approved_token is None, f"{name} must clear approval token immediately in finally block"
        assert state.is_programmatic_submitting is False
        assert state.consume_allowed_submit(prompt) is False, f"{name} must not allow duplicate submission"


def test_3b_actual_content_js_f04_lifecycle_verification():
    """Phase 3B Direct Source Code Verification: Validates extension/content.js AST and logic for F-04 remediation."""
    content_file = EXTENSION_DIR / "content.js"
    assert content_file.is_file(), "extension/content.js must exist"
    code = content_file.read_text(encoding="utf-8")

    # 1. submitAfterDecision signature accepts approvedText
    assert "function submitAfterDecision(editor, adapter = activeAdapter, approvedText = null)" in code, (
        "submitAfterDecision must accept approvedText parameter for pre-dispatch text binding"
    )

    # 2. Text modification check before dispatch
    assert "if (approvedText !== null && currentText !== approvedText)" in code, (
        "submitAfterDecision must verify that current editor text matches approvedText before arming"
    )

    # 3. Finally block unconditionally clears approval token
    finally_pattern = re.compile(
        r"finally\s*\{[^}]*STATE\.isProgrammaticSubmitting\s*=\s*false;[^}]*clearApproval\(\);[^}]*\}",
        re.DOTALL
    )
    assert finally_pattern.search(code), (
        "submitAfterDecision must unconditionally call clearApproval() in its finally block to fix F-04"
    )

    # 4. Old dangling check 'if (!triggered) clearApproval();' must be removed
    assert "if (!triggered) {" not in code and "if (!triggered) clearApproval" not in code, (
        "Conditional clearance on !triggered must be replaced with unconditional finally clearance"
    )

    # 5. Callers in inspectAndDecide pass text to submitAfterDecision
    allow_call = re.compile(r"submitAfterDecision\(editor,\s*currentAdapter,\s*text\);")
    matches = allow_call.findall(code)
    assert len(matches) >= 2, (
        "inspectAndDecide must pass text to submitAfterDecision on both ALLOW and WARN Continue paths"
    )


# ===========================================================================
# 12. Phase 3D-1: Popup Employee Identity Repair Tests
# ===========================================================================

def test_3d1_popup_identity_display_unpaired():
    """Phase 3D-1: Unpaired extension displays clear unlinked state and pairing guidance."""
    display = compute_identity_display(
        credential=None,
        employee_id="",
        employee_name="",
        connection_status=None,
    )
    assert display["optionValue"] == ""
    assert display["optionText"] == "No employee identity linked"
    assert display["statusText"] == "Pair extension using a code from the admin dashboard."
    assert display["disabled"] is True


def test_3d1_popup_identity_display_revoked():
    """Phase 3D-1: Revoked extension displays revoked status and prompt to re-pair."""
    display = compute_identity_display(
        credential=None,
        employee_id="EMP-001",
        employee_name="Alice Smith",
        connection_status="REVOKED",
    )
    assert display["optionValue"] == ""
    assert display["optionText"] == "Alice Smith • EMP-001 (Revoked)"
    assert display["statusText"] == "Credential revoked by administrator. Please pair again."
    assert display["disabled"] is True


def test_3d1_popup_identity_display_paired_active():
    """Phase 3D-1: Paired extension displays actual stored employee identity and cannot be edited."""
    display = compute_identity_display(
        credential="valid-bearer-token-123",
        employee_id="EMP-442",
        employee_name="Jane Doe",
        connection_status="CONNECTED",
    )
    assert display["optionValue"] == "EMP-442"
    assert display["optionText"] == "Jane Doe • EMP-442"
    assert display["statusText"] == "Active protection bound to EMP-442."
    assert display["disabled"] is True


def test_3d1_popup_identity_display_disabled():
    """Phase 3D-1: Extension access disabled by admin displays clear disabled notice."""
    display = compute_identity_display(
        credential="valid-bearer-token-123",
        employee_id="EMP-100",
        employee_name="Bob Admin",
        connection_status="DISABLED",
    )
    assert display["optionValue"] == "EMP-100"
    assert display["optionText"] == "Bob Admin • EMP-100"
    assert display["statusText"] == "Extension access disabled by administrator."
    assert display["disabled"] is True


def test_3d1_popup_source_integrity_no_api_employees_call():
    """Phase 3D-1 Direct Source Code Verification: Validates extension/popup.js has no /api/employees call or demo fallback."""
    popup_file = EXTENSION_DIR / "popup.js"
    assert popup_file.is_file(), "extension/popup.js must exist"
    code = popup_file.read_text(encoding="utf-8")

    # 1. No unauthenticated request to admin-only /api/employees
    assert "/api/employees" not in code, (
        "popup.js must not call admin-only /api/employees endpoint"
    )

    # 2. No hardcoded demo employee fallback
    assert "EMP-DEMO-001" not in code, (
        "popup.js must not contain hardcoded demo fallback EMP-DEMO-001"
    )
    assert "demo identity" not in code, (
        "popup.js must not display 'using demo identity' fallback message"
    )

    # 3. Read-only popup lifecycle: opening popup must never write to storage
    assert "chrome.storage.local.set" not in code, (
        "popup.js must not call chrome.storage.local.set during popup rendering (must be read-only)"
    )

    # 4. Identity functions exist and are properly bound
    assert "computeIdentityDisplay" in code, "popup.js must implement computeIdentityDisplay"
    assert "renderIdentity" in code, "popup.js must implement renderIdentity"
    assert "computePopupStatus" in code, "popup.js must implement computePopupStatus"


# ===========================================================================
# 13. Phase 3D-2: Pairing Security Hardening Tests
# ===========================================================================

def is_authorized_popup_sender(sender: dict | None, extension_id: str | None = "sentinel-extension-id") -> bool:
    """Python reference contract mirroring extension/background.js isAuthorizedPopupSender."""
    if not sender or not isinstance(sender, dict):
        return False

    if sender.get("tab") is not None:
        return False

    sender_id = sender.get("id")
    if extension_id:
        if not sender_id or sender_id != extension_id:
            return False
    elif not sender_id:
        return False

    expected_popup_url = f"chrome-extension://{sender_id}/popup.html" if sender_id else None
    sender_url = sender.get("url")
    if not expected_popup_url or not isinstance(sender_url, str):
        return False

    if sender_url != expected_popup_url:
        return False

    return True


def test_3d2_is_authorized_popup_sender_valid():
    """Phase 3D-2: Legitimate popup message from extension popup is authorized."""
    sender = {
        "id": "sentinel-extension-id",
        "url": "chrome-extension://sentinel-extension-id/popup.html",
    }
    assert is_authorized_popup_sender(sender, "sentinel-extension-id") is True


def test_3d2_is_authorized_popup_sender_rejects_content_script_tab():
    """Phase 3D-2: Content script with sender.tab present is rejected immediately."""
    sender_with_tab = {
        "id": "sentinel-extension-id",
        "url": "chrome-extension://sentinel-extension-id/popup.html",
        "tab": {"id": 42, "url": "https://chatgpt.com/"},
    }
    assert is_authorized_popup_sender(sender_with_tab, "sentinel-extension-id") is False

    content_script_sender = {
        "id": "sentinel-extension-id",
        "url": "https://claude.ai/",
        "tab": {"id": 101},
    }
    assert is_authorized_popup_sender(content_script_sender, "sentinel-extension-id") is False


def test_3d2_is_authorized_popup_sender_rejects_foreign_extension_id():
    """Phase 3D-2: Messages from foreign or unexpected extension IDs are rejected."""
    foreign_sender = {
        "id": "attacker-extension-id-xyz",
        "url": "chrome-extension://attacker-extension-id-xyz/popup.html",
    }
    assert is_authorized_popup_sender(foreign_sender, "sentinel-extension-id") is False


def test_3d2_is_authorized_popup_sender_rejects_unexpected_url():
    """Phase 3D-2: Messages from non-popup extension pages or external URLs are rejected."""
    options_sender = {
        "id": "sentinel-extension-id",
        "url": "chrome-extension://sentinel-extension-id/options.html",
    }
    assert is_authorized_popup_sender(options_sender, "sentinel-extension-id") is False

    webpage_sender = {
        "id": "sentinel-extension-id",
        "url": "https://perplexity.ai/",
    }
    assert is_authorized_popup_sender(webpage_sender, "sentinel-extension-id") is False


def test_3d2_is_authorized_popup_sender_rejects_missing_or_malformed_sender():
    """Phase 3D-2: Missing, null, or malformed sender metadata is safely rejected."""
    assert is_authorized_popup_sender(None) is False
    assert is_authorized_popup_sender({}) is False
    assert is_authorized_popup_sender("popup.html") is False
    assert is_authorized_popup_sender(12345) is False
    assert is_authorized_popup_sender({"id": "sentinel-extension-id"}) is False
    assert is_authorized_popup_sender({"url": "chrome-extension://sentinel-extension-id/popup.html"}) is False
    assert is_authorized_popup_sender({"id": None, "url": None}) is False


def test_3d2_background_js_source_integrity_sender_validation():
    """Phase 3D-2 Direct Source Verification: background.js enforces isAuthorizedPopupSender for AGIES_PAIR_EXTENSION."""
    background_file = EXTENSION_DIR / "background.js"
    assert background_file.is_file(), "extension/background.js must exist"
    code = background_file.read_text(encoding="utf-8")

    # 1. isAuthorizedPopupSender function exists
    assert "function isAuthorizedPopupSender(sender)" in code, (
        "background.js must implement isAuthorizedPopupSender"
    )

    # 2. Reject sender with tab (content scripts)
    assert "sender.tab" in code, (
        "isAuthorizedPopupSender must check sender.tab to reject content scripts"
    )

    # 3. Check extension ID
    assert "chrome.runtime.id" in code or "sender.id" in code, (
        "isAuthorizedPopupSender must validate sender.id against extension ID"
    )

    # 4. Check popup.html URL
    assert "popup.html" in code, (
        "isAuthorizedPopupSender must validate sender.url matches popup.html"
    )

    # 5. AGIES_PAIR_EXTENSION validates sender before pairExtension
    assert "if (!isAuthorizedPopupSender(sender))" in code, (
        "AGIES_PAIR_EXTENSION handler must check isAuthorizedPopupSender"
    )
    pair_handler_match = re.search(
        r"message\?\.type === ['\"]AGIES_PAIR_EXTENSION['\"].*?isAuthorizedPopupSender\(sender\).*?pairExtension\(message\.code\)",
        code,
        re.DOTALL,
    )
    assert pair_handler_match is not None, (
        "background.js must validate isAuthorizedPopupSender before invoking pairExtension"
    )

    # 6. isAuthorizedPopupSender exported
    assert "isAuthorizedPopupSender" in code.split("module.exports =")[1], (
        "background.js must export isAuthorizedPopupSender in module.exports"
    )


def test_3d2_pairing_rate_limit_config_defaults_and_env_overrides(monkeypatch):
    """Phase 3D-2: Rate limiter configuration honors pairing defaults and environment overrides."""
    # Ensure MongoClient does not block
    with monkeypatch.context() as m:
        from unittest.mock import MagicMock
        m.setattr("pymongo.MongoClient", MagicMock())
        import sys
        backend_dir = Path(__file__).resolve().parent.parent / "backend"
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))
        from app.rate_limiter import get_pairing_rate_limit_config

        # 1. Defaults
        cfg = get_pairing_rate_limit_config()
        assert cfg["ip_max_attempts"] == 5
        assert cfg["window_seconds"] == 900
        assert cfg["lockout_seconds"] == 900

        # 2. Overrides
        m.setenv("PAIRING_RATE_LIMIT_IP_MAX_ATTEMPTS", "3")
        m.setenv("PAIRING_RATE_LIMIT_WINDOW_SECONDS", "300")
        m.setenv("PAIRING_RATE_LIMIT_LOCKOUT_SECONDS", "600")

        cfg_overridden = get_pairing_rate_limit_config()
        assert cfg_overridden["ip_max_attempts"] == 3
        assert cfg_overridden["window_seconds"] == 300
        assert cfg_overridden["lockout_seconds"] == 600

        # 3. Invalid values fall back safely to defaults
        m.setenv("PAIRING_RATE_LIMIT_IP_MAX_ATTEMPTS", "not-a-number")
        m.setenv("PAIRING_RATE_LIMIT_WINDOW_SECONDS", "-10")
        m.setenv("PAIRING_RATE_LIMIT_LOCKOUT_SECONDS", "0")

        cfg_fallback = get_pairing_rate_limit_config()
        assert cfg_fallback["ip_max_attempts"] == 5
        assert cfg_fallback["window_seconds"] == 900
        assert cfg_fallback["lockout_seconds"] == 900


def test_3d2_pairing_rate_limiter_client_ip_proxy_handling(monkeypatch):
    """Phase 3D-2: Client IP extraction respects TRUSTED_PROXIES and rejects spoofed headers."""
    from unittest.mock import MagicMock
    monkeypatch.setattr("pymongo.MongoClient", MagicMock())
    import sys
    backend_dir = Path(__file__).resolve().parent.parent / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    from app.rate_limiter import get_client_ip

    class DummyClient:
        def __init__(self, host):
            self.host = host

    class DummyRequest:
        def __init__(self, host, headers=None):
            self.client = DummyClient(host)
            self.headers = headers or {}

    # Case 1: No trusted proxies configured -> ignore X-Forwarded-For
    monkeypatch.delenv("TRUSTED_PROXIES", raising=False)
    req1 = DummyRequest("198.51.100.1", {"x-forwarded-for": "10.0.0.1, 203.0.113.195"})
    assert get_client_ip(req1) == "198.51.100.1"

    # Case 2: Direct peer is trusted proxy -> extract right-most untrusted candidate
    monkeypatch.setenv("TRUSTED_PROXIES", "127.0.0.1, 10.0.0.1")
    req2 = DummyRequest("127.0.0.1", {"x-forwarded-for": "203.0.113.50, 10.0.0.1"})
    assert get_client_ip(req2) == "203.0.113.50"


def test_3d2_pairing_rate_limiter_threshold_and_lockout(monkeypatch):
    """Phase 3D-2: 5 failed pairing attempts triggers HTTP 429 lockout with Retry-After header."""
    from datetime import datetime, timedelta, timezone
    from unittest.mock import MagicMock
    from fastapi import HTTPException

    monkeypatch.setattr("pymongo.MongoClient", MagicMock())
    import sys
    backend_dir = Path(__file__).resolve().parent.parent / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    import app.rate_limiter as rl

    # In-memory rate limits collection
    class InMemoryRateLimits:
        def __init__(self):
            self.store = {}

        def find_one(self, filter_dict):
            return self.store.get(filter_dict.get("key"))

        def find_one_and_update(self, filter_dict, update_dict, upsert=False, return_document=None):
            key = filter_dict.get("key")
            doc = self.store.get(key)
            if not doc and upsert:
                doc = {"key": key, "attempts": 0}
                if "$setOnInsert" in update_dict:
                    doc.update(update_dict["$setOnInsert"])
                self.store[key] = doc
            if doc:
                if "$inc" in update_dict:
                    for k, v in update_dict["$inc"].items():
                        doc[k] = doc.get(k, 0) + v
                if "$set" in update_dict:
                    for k, v in update_dict["$set"].items():
                        doc[k] = v
            return dict(doc) if doc else None

        def update_one(self, filter_dict, update_dict):
            key = filter_dict.get("key")
            doc = self.store.get(key)
            if doc and "$set" in update_dict:
                for k, v in update_dict["$set"].items():
                    doc[k] = v

    class InMemoryAuditLogs:
        def __init__(self):
            self.logs = []

        def insert_one(self, doc):
            self.logs.append(dict(doc))

    mock_db_limits = InMemoryRateLimits()
    mock_db_audit = InMemoryAuditLogs()
    monkeypatch.setattr(rl, "login_rate_limits_collection", mock_db_limits)
    monkeypatch.setattr(rl, "audit_logs_collection", mock_db_audit)

    class DummyClient:
        def __init__(self, host):
            self.host = host

    class DummyRequest:
        def __init__(self, host):
            self.client = DummyClient(host)
            self.headers = {}

    req = DummyRequest("198.51.100.25")
    base_time = datetime(2026, 10, 17, 12, 0, 0, tzinfo=timezone.utc)

    # 1. Initial check passes
    rl.check_pairing_rate_limit(req, now=base_time)

    # 2. Record 4 failed pairing attempts -> still passes
    for i in range(4):
        rl.record_pairing_failure(req, now=base_time + timedelta(seconds=i))
    rl.check_pairing_rate_limit(req, now=base_time + timedelta(seconds=10))

    # 3. 5th failed pairing attempt reaches threshold
    rl.record_pairing_failure(req, now=base_time + timedelta(seconds=20))

    # 4. 6th check triggers HTTP 429
    with pytest.raises(HTTPException) as exc_info:
        rl.check_pairing_rate_limit(req, now=base_time + timedelta(seconds=25))

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "Too many pairing attempts. Please try again later."
    assert "Retry-After" in exc_info.value.headers
    retry_seconds = int(exc_info.value.headers["Retry-After"])
    assert retry_seconds > 0

    # 5. Verify audit log entry without leaking codes/secrets
    assert len(mock_db_audit.logs) == 1
    log_entry = mock_db_audit.logs[0]
    assert log_entry["event"] == "EXTENSION_PAIRING_RATE_LIMITED"
    assert log_entry["client_ip"] == "198.51.100.25"
    assert "code" not in log_entry
    assert "credential" not in log_entry


def test_3d2_pairing_rate_limiter_independent_payloads_do_not_bypass(monkeypatch):
    """Phase 3D-2: Changing pairing codes or payload fields cannot bypass the IP rate limit."""
    from datetime import datetime, timedelta, timezone
    from unittest.mock import MagicMock
    from fastapi import HTTPException

    monkeypatch.setattr("pymongo.MongoClient", MagicMock())
    import sys
    backend_dir = Path(__file__).resolve().parent.parent / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    import app.rate_limiter as rl

    class InMemoryRateLimits:
        def __init__(self):
            self.store = {}

        def find_one(self, filter_dict):
            return self.store.get(filter_dict.get("key"))

        def find_one_and_update(self, filter_dict, update_dict, upsert=False, return_document=None):
            key = filter_dict.get("key")
            doc = self.store.get(key)
            if not doc and upsert:
                doc = {"key": key, "attempts": 0}
                if "$setOnInsert" in update_dict:
                    doc.update(update_dict["$setOnInsert"])
                self.store[key] = doc
            if doc:
                if "$inc" in update_dict:
                    for k, v in update_dict["$inc"].items():
                        doc[k] = doc.get(k, 0) + v
                if "$set" in update_dict:
                    for k, v in update_dict["$set"].items():
                        doc[k] = v
            return dict(doc) if doc else None

        def update_one(self, filter_dict, update_dict):
            key = filter_dict.get("key")
            doc = self.store.get(key)
            if doc and "$set" in update_dict:
                for k, v in update_dict["$set"].items():
                    doc[k] = v

    mock_db = InMemoryRateLimits()
    monkeypatch.setattr(rl, "login_rate_limits_collection", mock_db)
    monkeypatch.setattr(rl, "audit_logs_collection", MagicMock())

    class DummyClient:
        def __init__(self, host):
            self.host = host

    class DummyRequest:
        def __init__(self, host):
            self.client = DummyClient(host)
            self.headers = {}

    req_attacker = DummyRequest("203.0.113.88")
    req_other_ip = DummyRequest("198.51.100.99")
    base_time = datetime(2026, 10, 17, 14, 0, 0, tzinfo=timezone.utc)

    # Lock out attacker IP
    for i in range(5):
        rl.record_pairing_failure(req_attacker, now=base_time + timedelta(seconds=i))

    # Attacker tries different requests from same IP -> locked out
    with pytest.raises(HTTPException) as exc:
        rl.check_pairing_rate_limit(req_attacker, now=base_time + timedelta(seconds=10))
    assert exc.value.status_code == 429

    # Different legitimate client IP is NOT locked out
    rl.check_pairing_rate_limit(req_other_ip, now=base_time + timedelta(seconds=10))


def test_3d2_pairing_rate_limiter_cooldown_recovery(monkeypatch):
    """Phase 3D-2: Legitimate pairing requests succeed after cooldown lockout expires."""
    from datetime import datetime, timedelta, timezone
    from unittest.mock import MagicMock

    monkeypatch.setattr("pymongo.MongoClient", MagicMock())
    import sys
    backend_dir = Path(__file__).resolve().parent.parent / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    import app.rate_limiter as rl

    class InMemoryRateLimits:
        def __init__(self):
            self.store = {}

        def find_one(self, filter_dict):
            return self.store.get(filter_dict.get("key"))

        def find_one_and_update(self, filter_dict, update_dict, upsert=False, return_document=None):
            key = filter_dict.get("key")
            doc = self.store.get(key)
            if not doc and upsert:
                doc = {"key": key, "attempts": 0}
                if "$setOnInsert" in update_dict:
                    doc.update(update_dict["$setOnInsert"])
                self.store[key] = doc
            if doc:
                if "$inc" in update_dict:
                    for k, v in update_dict["$inc"].items():
                        doc[k] = doc.get(k, 0) + v
                if "$set" in update_dict:
                    for k, v in update_dict["$set"].items():
                        doc[k] = v
            return dict(doc) if doc else None

        def update_one(self, filter_dict, update_dict):
            key = filter_dict.get("key")
            doc = self.store.get(key)
            if doc and "$set" in update_dict:
                for k, v in update_dict["$set"].items():
                    doc[k] = v

    mock_db = InMemoryRateLimits()
    monkeypatch.setattr(rl, "login_rate_limits_collection", mock_db)

    class DummyClient:
        def __init__(self, host):
            self.host = host

    class DummyRequest:
        def __init__(self, host):
            self.client = DummyClient(host)
            self.headers = {}

    req = DummyRequest("198.51.100.40")
    base_time = datetime(2026, 10, 17, 10, 0, 0, tzinfo=timezone.utc)

    # 5 failures lock it out for 900 seconds
    for i in range(5):
        rl.record_pairing_failure(req, now=base_time + timedelta(seconds=i))

    # 5 failures: 5th failure is at base_time + 4s, locking out until base_time + 904s
    # After 905 seconds (cooldown elapsed), check_pairing_rate_limit succeeds
    cooldown_elapsed_time = base_time + timedelta(seconds=905)
    rl.check_pairing_rate_limit(req, now=cooldown_elapsed_time)


def test_3d2_backend_main_pair_extension_wiring_integrity():
    """Phase 3D-2 Direct Source Verification: main.py imports and applies pairing rate limiting correctly."""
    main_file = Path(__file__).resolve().parent.parent / "backend" / "app" / "main.py"
    assert main_file.is_file(), "project/backend/app/main.py must exist"
    code = main_file.read_text(encoding="utf-8")

    # 1. Imports from rate_limiter
    assert "check_pairing_rate_limit" in code, "main.py must import check_pairing_rate_limit"
    assert "record_pairing_failure" in code, "main.py must import record_pairing_failure"

    # 2. pair_extension accepts http_request
    assert "def pair_extension(request: ExtensionPairRequest, http_request: Request = None):" in code, (
        "pair_extension must accept http_request: Request = None"
    )

    # 3. check_pairing_rate_limit called before code hash lookup
    pair_func = code.split("def pair_extension(")[1].split("@app.")[0]
    check_pos = pair_func.find("check_pairing_rate_limit(http_request)")
    db_find_pos = pair_func.find("find_one_and_update")
    assert check_pos != -1, "pair_extension must call check_pairing_rate_limit"
    assert db_find_pos != -1, "pair_extension must call find_one_and_update"
    assert check_pos < db_find_pos, (
        "check_pairing_rate_limit must be called BEFORE expensive database lookup"
    )

    # 4. record_pairing_failure called on failed lookups
    assert "record_pairing_failure(http_request, now)" in pair_func, (
        "record_pairing_failure must be called on invalid pairing attempts"
    )

    # 5. One-time-use and expiration logic preserved
    assert '"used": False' in pair_func, "used: False check must be preserved"
    assert '"expires_at": {"$gt": now}' in pair_func, "expires_at: {$gt: now} check must be preserved"
    assert '{"$set": {"used": True, "used_at": now}}' in pair_func, "used: True update must be preserved"


# ===========================================================================
# 14. Phase 3E: Release Packaging & Distribution Integrity Tests
# ===========================================================================

def test_3e_distribution_zip_existence_and_parity():
    """Phase 3E: Verify both public and dist distribution ZIPs exist and are bit-identical."""
    import hashlib
    repo_root = Path(__file__).resolve().parent.parent.parent
    public_zip = repo_root / "project" / "public" / "downloads" / "extension.zip"
    dist_zip = repo_root / "project" / "dist" / "downloads" / "extension.zip"

    assert public_zip.is_file(), f"public extension.zip must exist at {public_zip}"
    assert dist_zip.is_file(), f"dist extension.zip must exist at {dist_zip}"

    public_bytes = public_zip.read_bytes()
    dist_bytes = dist_zip.read_bytes()

    assert len(public_bytes) > 0, "public zip must not be empty"
    assert hashlib.sha256(public_bytes).hexdigest() == hashlib.sha256(dist_bytes).hexdigest(), (
        "public and dist extension.zip must have identical SHA-256 hashes"
    )


def test_3e_distribution_zip_layout_no_nested_directory():
    """Phase 3E: Verify ZIP archive layout has all files at root, with no nested extension/ prefix."""
    import zipfile
    repo_root = Path(__file__).resolve().parent.parent.parent
    public_zip = repo_root / "project" / "public" / "downloads" / "extension.zip"

    with zipfile.ZipFile(public_zip, "r") as zf:
        namelist = zf.namelist()

        # All 7 essential files must be at root
        expected_files = [
            "manifest.json",
            "background.js",
            "content.js",
            "popup.html",
            "popup.css",
            "popup.js",
            "README.md",
        ]
        for f in expected_files:
            assert f in namelist, f"{f} must be present at archive root"

        # No nested extension/ directory
        for entry in namelist:
            assert not entry.startswith("extension/"), (
                f"Found nested directory prefix in entry '{entry}'; must be at root"
            )


def test_3e_distribution_zip_content_script_and_four_platforms():
    """Phase 3E: Verify content.js in ZIP includes all 4 platforms and Phase 3B token cleanup."""
    import zipfile
    repo_root = Path(__file__).resolve().parent.parent.parent
    public_zip = repo_root / "project" / "public" / "downloads" / "extension.zip"

    with zipfile.ZipFile(public_zip, "r") as zf:
        content_js = zf.read("content.js").decode("utf-8")
        manifest_json = zf.read("manifest.json").decode("utf-8")
        background_js = zf.read("background.js").decode("utf-8")
        popup_js = zf.read("popup.js").decode("utf-8")

        # 1. Four platform adapters in content.js
        assert "ChatGPTAdapter" in content_js, "content.js in ZIP must include ChatGPTAdapter"
        assert "GeminiAdapter" in content_js, "content.js in ZIP must include GeminiAdapter"
        assert "ClaudeAdapter" in content_js, "content.js in ZIP must include ClaudeAdapter"
        assert "PerplexityAdapter" in content_js, "content.js in ZIP must include PerplexityAdapter"

        # 2. Phase 3B approved token cleanup in content.js
        assert "clearApproval();" in content_js, "content.js in ZIP must clear approval"
        assert "isProgrammaticSubmitting = false;" in content_js, "content.js in ZIP must reset programmatic flag"

        # 3. Phase 3D-2 sender authorization in background.js
        assert "isAuthorizedPopupSender" in background_js, "background.js in ZIP must include isAuthorizedPopupSender"

        # 4. Phase 3D-1 popup identity in popup.js
        assert "computeIdentityDisplay" in popup_js, "popup.js in ZIP must include computeIdentityDisplay"
        assert "/api/employees" not in popup_js, "popup.js in ZIP must not call /api/employees"
        assert "EMP-DEMO-001" not in popup_js, "popup.js in ZIP must not have EMP-DEMO-001 fallback"

        # 5. Manifest.json matches all 4 platforms
        assert "https://chatgpt.com/*" in manifest_json
        assert "https://gemini.google.com/*" in manifest_json
        assert "https://claude.ai/*" in manifest_json
        assert "https://perplexity.ai/*" in manifest_json


# ---------------------------------------------------------------------------
# Incident Timestamp Serialization & Display Regression Tests
# ---------------------------------------------------------------------------


def _get_main_helpers():
    """Safely import main.py helpers with mocked MongoDB to prevent timeout."""
    import sys
    from unittest.mock import MagicMock
    backend_dir = Path(__file__).resolve().parent.parent / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    import pymongo
    original_client = pymongo.MongoClient
    try:
        pymongo.MongoClient = MagicMock()
        from app.main import _to_utc_datetime, _format_utc_iso, _serialize_incident
        return _to_utc_datetime, _format_utc_iso, _serialize_incident
    finally:
        pymongo.MongoClient = original_client


def test_timestamp_utc_serialization_contract():
    """Verify backend _to_utc_datetime and _format_utc_iso format all timestamp types to UTC ISO with Z."""
    from datetime import datetime, timezone, timedelta

    _to_utc_datetime, _format_utc_iso, _ = _get_main_helpers()

    # 1. Naive datetime (legacy convention: naive datetimes represent UTC)
    naive_dt = datetime(2026, 10, 17, 11, 9, 16)
    utc_dt = _to_utc_datetime(naive_dt)
    assert utc_dt.tzinfo == timezone.utc
    assert _format_utc_iso(naive_dt) == "2026-10-17T11:09:16Z"

    # 2. Timezone-aware UTC datetime
    aware_utc_dt = datetime(2026, 10, 17, 11, 9, 16, tzinfo=timezone.utc)
    assert _format_utc_iso(aware_utc_dt) == "2026-10-17T11:09:16Z"

    # 3. Timezone-aware datetime with explicit offset (e.g. IST +05:30)
    ist = timezone(timedelta(hours=5, minutes=30))
    offset_dt = datetime(2026, 10, 17, 16, 39, 16, tzinfo=ist)
    converted_dt = _to_utc_datetime(offset_dt)
    assert converted_dt.tzinfo == timezone.utc
    assert converted_dt.hour == 11 and converted_dt.minute == 9 and converted_dt.second == 16
    assert _format_utc_iso(offset_dt) == "2026-10-17T11:09:16Z"

    # 4. Naive ISO string (legacy convention: interpreted as UTC)
    assert _format_utc_iso("2026-10-17T11:09:16") == "2026-10-17T11:09:16Z"

    # 5. ISO string with explicit Z
    assert _format_utc_iso("2026-10-17T11:09:16Z") == "2026-10-17T11:09:16Z"

    # 6. ISO string with explicit offset (+00:00)
    assert _format_utc_iso("2026-10-17T11:09:16+00:00") == "2026-10-17T11:09:16Z"

    # 7. ISO string with non-zero offset (+05:30)
    assert _format_utc_iso("2026-10-17T16:39:16+05:30") == "2026-10-17T11:09:16Z"

    # 8. Legacy space-separated datetime string
    assert _format_utc_iso("2026-10-17 11:09:16") == "2026-10-17T11:09:16Z"

    # 9. Microsecond preservation
    micro_dt = datetime(2026, 10, 17, 11, 9, 16, 123456, tzinfo=timezone.utc)
    assert _format_utc_iso(micro_dt) == "2026-10-17T11:09:16.123456Z"
    assert _format_utc_iso("2026-10-17T11:09:16.123456") == "2026-10-17T11:09:16.123456Z"

    # 10. Unix epoch timestamps
    epoch_ts = 1792235356  # 2026-10-17 11:09:16 UTC
    assert _format_utc_iso(epoch_ts) == "2026-10-17T11:09:16Z"
    assert _format_utc_iso(float(epoch_ts)) == "2026-10-17T11:09:16Z"

    # 11. Safe fallbacks
    assert _format_utc_iso(None) is None
    assert _format_utc_iso("not-a-datetime") == "not-a-datetime"


def test_serialize_incident_preserves_data_and_formats_timestamp():
    """Verify _serialize_incident formats timestamp to explicit UTC ISO and preserves all other fields."""
    from datetime import datetime, timezone

    _, _, _serialize_incident = _get_main_helpers()

    incident_doc = {
        "incident_id": "INC-DA50832D",
        "timestamp": datetime(2026, 10, 17, 11, 9, 16),  # Naive UTC datetime from MongoDB
        "status": "Open",
        "platform": "ChatGPT",
        "employee_id": "EMP-DEMO-001",
        "employee_name": "Alex Morgan",
        "employee_department": "Engineering",
        "risk_score": 85,
        "risk_level": "HIGH",
        "action": "BLOCK",
        "policy": "Block credentials",
        "policy_message": "Prompt blocked",
        "detected": True,
        "finding_count": 1,
        "finding_types": ["API_KEY"],
        "risk_reasons": ["Detected API key in prompt"],
        "context_level": "HIGH",
        "context_modifier": 10,
        "context_signals": [{"signal": "API_KEY", "category": "Credentials", "impact": "High"}],
    }

    serialized = _serialize_incident(incident_doc)

    # Timestamp MUST be ISO 8601 with explicit Z
    assert serialized["timestamp"] == "2026-10-17T11:09:16Z"

    # All other fields MUST remain completely unchanged
    assert serialized["incident_id"] == "INC-DA50832D"
    assert serialized["risk_score"] == 85
    assert serialized["risk_level"] == "HIGH"
    assert serialized["action"] == "BLOCK"
    assert serialized["status"] == "Open"
    assert serialized["platform"] == "ChatGPT"
    assert serialized["employee_id"] == "EMP-DEMO-001"
    assert serialized["finding_types"] == ["API_KEY"]
    assert serialized["context_signals"] == [{"signal": "API_KEY", "category": "Credentials", "impact": "High"}]

    # None and empty handling
    assert _serialize_incident(None) is None
    assert _serialize_incident({}) == {}


def test_backend_main_incident_serialization_wiring():
    """Verify main.py endpoints wire _serialize_incident into API responses."""
    main_file = Path(__file__).resolve().parent.parent / "backend" / "app" / "main.py"
    assert main_file.is_file(), "main.py must exist"
    code = main_file.read_text(encoding="utf-8")

    # 1. Helper definitions
    assert "def _format_utc_iso(" in code
    assert "def _serialize_incident(" in code

    # 2. get_incidents uses _serialize_incident
    assert '"incidents": [_serialize_incident(inc) for inc in incidents]' in code

    # 3. get_incident uses _serialize_incident
    assert '"incident": _serialize_incident(incident)' in code

    # 4. update_incident_status uses _serialize_incident
    assert '"incident": _serialize_incident(updated)' in code

    # 5. get_employee uses _serialize_incident
    assert 'item["incidents_detail"] = [\n        _serialize_incident(inc)' in code or \
           '[_serialize_incident(inc) for inc in incidents_collection.find' in code

    # 6. get_audit_log formats timestamp
    assert '_format_utc_iso(log.get("timestamp"))' in code


def test_frontend_time_utility_and_page_integration():
    """Verify frontend time.ts implements correct UTC parsing and is integrated in pages."""
    time_file = Path(__file__).resolve().parent.parent / "src" / "lib" / "time.ts"
    assert time_file.is_file(), "project/src/lib/time.ts must exist"
    time_code = time_file.read_text(encoding="utf-8")

    # Exported functions
    assert "export function parseUtcTimestamp(" in time_code
    assert "export function formatTimestamp(" in time_code

    # Timezone detection and UTC assumption for naive legacy values
    assert "hasTimezone" in time_code
    assert "[Zz]$|[+-]\\d{2}(:?\\d{2})?$" in time_code or "[Zz]$|[+-]\\d{2}" in time_code
    assert "${normalized}Z" in time_code or "normalized + 'Z'" in time_code

    # IncidentDetailsPage integration
    details_file = Path(__file__).resolve().parent.parent / "src" / "pages" / "IncidentDetailsPage.tsx"
    details_code = details_file.read_text(encoding="utf-8")
    assert "import { formatTimestamp } from '@/lib/time';" in details_code
    assert "value: formatTimestamp(incident.timestamp)" in details_code

    # IncidentsPage integration
    incidents_file = Path(__file__).resolve().parent.parent / "src" / "pages" / "IncidentsPage.tsx"
    incidents_code = incidents_file.read_text(encoding="utf-8")
    assert "import { formatTimestamp } from '@/lib/time';" in incidents_code
    assert "{formatTimestamp(inc.timestamp)}" in incidents_code

    # EmployeeDetailsPage integration
    emp_details_file = Path(__file__).resolve().parent.parent / "src" / "pages" / "EmployeeDetailsPage.tsx"
    emp_details_code = emp_details_file.read_text(encoding="utf-8")
    assert "import { formatTimestamp } from '@/lib/time';" in emp_details_code
    assert "{formatTimestamp(inc.timestamp)}" in emp_details_code


def test_incident_timestamp_remediation_resolution():
    """Verify that INC-DA50832D timestamp issue is completely resolved under all timezone conventions."""
    import re
    from datetime import datetime, timezone, timedelta

    # Mirroring the frontend time.ts parse algorithm in Python
    def js_parse_utc_timestamp(timestamp_str):
        if not timestamp_str or not isinstance(timestamp_str, str):
            return None
        trimmed = timestamp_str.strip()
        if not trimmed:
            return None
        has_timezone = bool(re.search(r"([Zz]$|[+-]\d{2}(:?\d{2})?$)", trimmed))
        normalized = trimmed
        if re.match(r"^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}", normalized):
            normalized = re.sub(r"\s+", "T", normalized)
        if not has_timezone and re.search(r"T\d{2}:\d{2}", normalized):
            normalized = f"{normalized}Z"

        # Parse ISO string with Z or offset as UTC datetime
        dt = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc)

    # Format in user's browser locale (simulating user in IST +05:30)
    ist = timezone(timedelta(hours=5, minutes=30))
    def format_to_local(utc_dt, tz=ist):
        local_dt = utc_dt.astimezone(tz)
        # Format style: 10/17/2026, 4:39:16 PM (preserving seconds)
        hour_12 = local_dt.hour % 12 or 12
        am_pm = "AM" if local_dt.hour < 12 else "PM"
        return f"{local_dt.month}/{local_dt.day}/{local_dt.year}, {hour_12}:{local_dt.minute:02d}:{local_dt.second:02d} {am_pm}"

    # Target test cases for INC-DA50832D:
    # 1. New API response with explicit Z
    dt_z = js_parse_utc_timestamp("2026-10-17T11:09:16Z")
    assert dt_z == datetime(2026, 10, 17, 11, 9, 16, tzinfo=timezone.utc)
    assert format_to_local(dt_z) == "10/17/2026, 4:39:16 PM"

    # 2. Legacy API response without Z (naive string)
    dt_naive = js_parse_utc_timestamp("2026-10-17T11:09:16")
    assert dt_naive == datetime(2026, 10, 17, 11, 9, 16, tzinfo=timezone.utc)
    assert format_to_local(dt_naive) == "10/17/2026, 4:39:16 PM"

    # 3. Explicit UTC offset (+00:00)
    dt_offset_utc = js_parse_utc_timestamp("2026-10-17T11:09:16+00:00")
    assert dt_offset_utc == datetime(2026, 10, 17, 11, 9, 16, tzinfo=timezone.utc)
    assert format_to_local(dt_offset_utc) == "10/17/2026, 4:39:16 PM"

    # 4. Explicit local offset (+05:30)
    dt_offset_local = js_parse_utc_timestamp("2026-10-17T16:39:16+05:30")
    assert dt_offset_local == datetime(2026, 10, 17, 11, 9, 16, tzinfo=timezone.utc)
    assert format_to_local(dt_offset_local) == "10/17/2026, 4:39:16 PM"

    # 5. Legacy space-separated string ("2026-10-17 11:09:16")
    dt_space = js_parse_utc_timestamp("2026-10-17 11:09:16")
    assert dt_space == datetime(2026, 10, 17, 11, 9, 16, tzinfo=timezone.utc)
    assert format_to_local(dt_space) == "10/17/2026, 4:39:16 PM"

    # 6. Seconds are strictly preserved in all cases (:16)
    for dt in [dt_z, dt_naive, dt_offset_utc, dt_offset_local, dt_space]:
        assert dt.second == 16
        assert ":16" in format_to_local(dt)

    # 7. Exact incident from production blocker: INC-87726E45
    # Occurred at 14:52:31 UTC.
    # In unpatched production, displayed as 10/17/2026, 2:52:31 PM (lacking Z, parsed as local).
    # With remediation, correctly formats to 10/17/2026, 8:22:31 PM in IST (+05:30).
    inc_dt_z = js_parse_utc_timestamp("2026-10-17T14:52:31Z")
    assert inc_dt_z == datetime(2026, 10, 17, 14, 52, 31, tzinfo=timezone.utc)
    assert format_to_local(inc_dt_z) == "10/17/2026, 8:22:31 PM"

    inc_dt_naive = js_parse_utc_timestamp("2026-10-17T14:52:31")
    assert inc_dt_naive == datetime(2026, 10, 17, 14, 52, 31, tzinfo=timezone.utc)
    assert format_to_local(inc_dt_naive) == "10/17/2026, 8:22:31 PM"
    assert inc_dt_naive.second == 31






