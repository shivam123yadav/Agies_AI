from app.engines.pattern_detection import detect_patterns
from app.engines.contextual_analysis import analyze_context
from app.engines.risk_engine import calculate_risk
from app.engines.policy_engine import evaluate_policy


def run(text):
    d = detect_patterns(text)
    c = analyze_context(text, d)
    r = calculate_risk(d, c)
    p = evaluate_policy(r, d, c)
    return d, c, r, p


def test_email_and_phone():
    d, _, _, _ = run("Contact me at test.user@example.com or +91 98765 43210")
    types = {x["type"] for x in d["findings"]}
    assert "EMAIL" in types
    assert "PHONE" in types


def test_credit_card_blocks():
    _, _, _, p = run("My card number is 4111 1111 1111 1111")
    assert p["decision"] == "BLOCK"


def test_confidential_external_blocks():
    _, c, _, p = run("Send this confidential internal information to the external AI assistant")
    assert c["context_level"] == "HIGH"
    assert p["decision"] == "BLOCK"
