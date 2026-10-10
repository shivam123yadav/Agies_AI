"""Step 9: Admin Login Rate Limiting Tests.

Verifies:
1. Login succeeds below configured limit with valid credentials.
2. Invalid credentials count toward the rate limit.
3. Repeated failed attempts trigger HTTP 429 Too Many Requests.
4. HTTP 429 response includes a positive integer Retry-After header and generic error.
5. Successful login resets the failed-attempt counter.
6. Rate limit expires after the window/lockout period (using injected time).
7. Per-IP tracking limits single-IP brute force across multiple account identifiers.
8. Per-account tracking limits distributed brute force targeting a single account.
9. Audit log records rate-limiting events without leaking secrets.
10. Legitimate admin login is not locked out by failed attempts on a different account from another IP.
"""

import os
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.database import audit_logs_collection, login_rate_limits_collection
from app.main import app
from app.rate_limiter import (
    check_login_rate_limit,
    record_login_failure,
    reset_login_rate_limit,
)

TEST_ADMIN_EMAIL = "ratelimit_admin@agiesai.test"
TEST_ADMIN_PASSWORD = "StrongTestPassword123!"
TRUSTED_ORIGIN = "http://localhost:5173"


@pytest.fixture(autouse=True)
def configure_rate_limit_env():
    """Ensure consistent test admin, CSRF, and rate limit configuration."""
    login_rate_limits_collection.delete_many({})
    with patch.dict(
        os.environ,
        {
            "ADMIN_EMAIL": TEST_ADMIN_EMAIL,
            "ADMIN_PASSWORD": TEST_ADMIN_PASSWORD,
            "SESSION_SECRET": "test-rate-limit-session-secret-key-32!",
            "CSRF_TRUSTED_ORIGINS": TRUSTED_ORIGIN,
            "LOGIN_RATE_LIMIT_IP_MAX_ATTEMPTS": "5",
            "LOGIN_RATE_LIMIT_ACCOUNT_MAX_ATTEMPTS": "10",
            "LOGIN_RATE_LIMIT_WINDOW_SECONDS": "900",
            "LOGIN_RATE_LIMIT_LOCKOUT_SECONDS": "900",
        },
        clear=False,
    ):
        yield
    login_rate_limits_collection.delete_many({})


@pytest.fixture
def csrf_client():
    return TestClient(app, headers={"Origin": TRUSTED_ORIGIN})


# ===========================================================================
# 1. Basic Rate Limiting Below and At Threshold
# ===========================================================================


def test_login_succeeds_below_limit(csrf_client):
    """Login succeeds with valid credentials when below the rate limit."""
    res = csrf_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_failed_attempts_count_toward_limit_and_lock_at_threshold(csrf_client):
    """5 consecutive failed attempts trigger 429 Too Many Requests on the 6th attempt."""
    # 5 failed attempts
    for attempt in range(5):
        res = csrf_client.post(
            "/api/auth/login",
            json={"email": TEST_ADMIN_EMAIL, "password": f"WrongPass{attempt}!"},
        )
        assert res.status_code == 401
        assert res.json()["detail"] == "Invalid admin credentials"

    # 6th attempt is blocked by rate limiter with 429, even with correct password!
    blocked_res = csrf_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert blocked_res.status_code == 429
    assert blocked_res.json()["detail"] == "Too many failed login attempts. Please try again later."
    assert "Retry-After" in blocked_res.headers
    retry_after = int(blocked_res.headers["Retry-After"])
    assert 0 < retry_after <= 900


def test_rate_limited_response_does_not_leak_account_existence(csrf_client):
    """429 response message does not disclose whether account exists."""
    # Lock out IP by trying fake emails
    for attempt in range(5):
        res = csrf_client.post(
            "/api/auth/login",
            json={"email": f"unknown{attempt}@example.com", "password": "BadPassword123!"},
        )
        assert res.status_code == 401

    # Attempt against valid admin account
    res = csrf_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert res.status_code == 429
    assert "admin" not in res.json()["detail"].lower()
    assert "email" not in res.json()["detail"].lower()


# ===========================================================================
# 2. Counter Reset on Successful Login and IP Bypass Prevention
# ===========================================================================


def test_successful_login_resets_account_counter(csrf_client):
    """A successful login deletes the account-specific failure record from database."""
    # 4 failed attempts against the account
    for _ in range(4):
        csrf_client.post(
            "/api/auth/login",
            json={"email": TEST_ADMIN_EMAIL, "password": "WrongPassword!"},
        )

    account_key = f"account:{TEST_ADMIN_EMAIL.lower()}"
    assert login_rate_limits_collection.find_one({"key": account_key}) is not None

    # Successful login occurs
    success_res = csrf_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert success_res.status_code == 200

    # Account record is completely cleared
    assert login_rate_limits_collection.find_one({"key": account_key}) is None


def test_successful_login_preserves_ip_strikes_preventing_bypass(csrf_client):
    """A successful login by one account does NOT wipe the shared IP strikes.

    This prevents an attacker with one valid credential from repeatedly resetting
    their IP strikes while brute-forcing other accounts.
    """
    # 4 failed attempts from this IP against a victim account
    for i in range(4):
        csrf_client.post(
            "/api/auth/login",
            json={"email": f"victim_{i}@example.com", "password": "BadPassword!"},
        )

    ip_key = "ip:testclient"
    ip_doc = login_rate_limits_collection.find_one({"key": ip_key})
    assert ip_doc is not None
    assert ip_doc["attempts"] == 4

    # Attacker logs in with their own valid credential from the same IP
    success_res = csrf_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert success_res.status_code == 200

    # The IP counter must NOT be wiped! It still has its 4 failed strikes
    ip_doc_after = login_rate_limits_collection.find_one({"key": ip_key})
    assert ip_doc_after is not None
    assert ip_doc_after["attempts"] == 4

    # 5th failed attempt from this IP fails with 401, reaching 5 strikes on the IP
    fifth_res = csrf_client.post(
        "/api/auth/login",
        json={"email": "another_victim@example.com", "password": "BadPassword!"},
    )
    assert fifth_res.status_code == 401

    # 6th attempt from this IP is now locked out and blocked with 429 Too Many Requests
    blocked_res = csrf_client.post(
        "/api/auth/login",
        json={"email": "yet_another_victim@example.com", "password": "BadPassword!"},
    )
    assert blocked_res.status_code == 429
    assert blocked_res.json()["detail"] == "Too many failed login attempts. Please try again later."


def test_concurrent_failed_logins_increment_atomically_without_losses():
    """Concurrent failed login requests are atomically incremented in MongoDB without lost updates."""
    from concurrent.futures import ThreadPoolExecutor

    test_ip = "198.51.100.77"
    now = datetime(2026, 10, 10, 15, 0, 0, tzinfo=timezone.utc)

    # Simulate 12 concurrent failures from the same IP across multiple threads
    def run_concurrent_failure(i):
        req = type("MockReq", (), {
            "client": type("Client", (), {"host": test_ip})(),
            "headers": {},
        })()
        record_login_failure(req, f"user{i}@example.com", now=now)

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(run_concurrent_failure, range(12)))

    ip_doc = login_rate_limits_collection.find_one({"key": f"ip:{test_ip}"})
    assert ip_doc is not None
    # All 12 increments must be preserved atomically without lost updates
    assert ip_doc["attempts"] == 12
    assert ip_doc["locked_until"] is not None


# ===========================================================================
# 3. Time Window Expiry and Lockout Recovery
# ===========================================================================


def test_lockout_expires_after_lockout_seconds(csrf_client):
    """After lockout period passes, user can attempt login again."""
    base_time = datetime(2026, 10, 10, 12, 0, 0, tzinfo=timezone.utc)

    # 5 failed attempts at base_time
    with patch("app.main.check_login_rate_limit") as mock_check, \
         patch("app.main.record_login_failure") as mock_record:
        mock_check.side_effect = lambda req, email: check_login_rate_limit(req, email, now=base_time)
        mock_record.side_effect = lambda req, email: record_login_failure(req, email, now=base_time)

        for _ in range(5):
            csrf_client.post(
                "/api/auth/login",
                json={"email": TEST_ADMIN_EMAIL, "password": "BadPassword!"},
            )

        # Confirm locked out at base_time + 10 seconds
        check_time_locked = base_time + timedelta(seconds=10)
        mock_check.side_effect = lambda req, email: check_login_rate_limit(req, email, now=check_time_locked)

        res_locked = csrf_client.post(
            "/api/auth/login",
            json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
        )
        assert res_locked.status_code == 429

        # Advance time by 901 seconds (past 900s lockout window)
        check_time_unlocked = base_time + timedelta(seconds=901)
        mock_check.side_effect = lambda req, email: check_login_rate_limit(req, email, now=check_time_unlocked)
        mock_record.side_effect = lambda req, email: record_login_failure(req, email, now=check_time_unlocked)

        res_unlocked = csrf_client.post(
            "/api/auth/login",
            json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
        )
        assert res_unlocked.status_code == 200


# ===========================================================================
# 4. Multi-IP and Multi-Account Scenarios
# ===========================================================================


def test_ip_rate_limiting_protects_against_email_rotation():
    """An attacker rotating email addresses from the same IP is blocked after 5 attempts."""
    attacker_client = TestClient(app, headers={"Origin": TRUSTED_ORIGIN})

    for i in range(5):
        res = attacker_client.post(
            "/api/auth/login",
            json={"email": f"victim{i}@company.com", "password": "WrongPassword!"},
        )
        assert res.status_code == 401

    # 6th attempt with yet another email is blocked by IP limit
    res_blocked = attacker_client.post(
        "/api/auth/login",
        json={"email": "another_victim@company.com", "password": "WrongPassword!"},
    )
    assert res_blocked.status_code == 429


def test_account_rate_limiting_protects_against_distributed_brute_force():
    """An attacker rotating client IPs targeting the same administrator email is blocked

    once the account-level threshold (10 attempts) is reached.
    """
    now = datetime(2026, 10, 10, 10, 0, 0, tzinfo=timezone.utc)
    target_email = TEST_ADMIN_EMAIL

    # Simulate 10 different client IPs each attempting once
    with patch("app.rate_limiter.get_rate_limit_config") as mock_cfg:
        mock_cfg.return_value = {
            "ip_max_attempts": 5,
            "account_max_attempts": 10,
            "window_seconds": 900,
            "lockout_seconds": 900,
        }

        # 10 distinct client IPs attack the account
        for i in range(10):
            # Create a mock request with client.host = f"198.51.100.{i}"
            mock_req = type("MockReq", (), {
                "client": type("Client", (), {"host": f"198.51.100.{i}"})(),
                "headers": {},
            })()
            # None of these individual IPs hit the 5 IP limit
            check_login_rate_limit(mock_req, target_email, now=now)
            record_login_failure(mock_req, target_email, now=now)

        # 11th attempt from a brand new IP (198.51.100.99) targeting target_email is blocked by account limit!
        new_attacker_req = type("MockReq", (), {
            "client": type("Client", (), {"host": "198.51.100.99"})(),
            "headers": {},
        })()
        with pytest.raises(Exception) as exc_info:
            check_login_rate_limit(new_attacker_req, target_email, now=now)
        assert exc_info.value.status_code == 429
        assert "Retry-After" in exc_info.value.headers


# ===========================================================================
# 5. Audit Logging for Rate Limited Events
# ===========================================================================


def test_rate_limiting_event_audit_logged(csrf_client):
    """Exceeding rate limit writes ADMIN_LOGIN_RATE_LIMITED audit log without leaking passwords."""
    for _ in range(5):
        csrf_client.post(
            "/api/auth/login",
            json={"email": TEST_ADMIN_EMAIL, "password": "WrongPassword!"},
        )

    # Trigger rate limit
    csrf_client.post(
        "/api/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": "SecretPassword123!"},
    )

    event = audit_logs_collection.find_one(
        {"event": "ADMIN_LOGIN_RATE_LIMITED"},
        sort=[("timestamp", -1)],
    )
    assert event is not None
    assert event["account"] == TEST_ADMIN_EMAIL.lower()
    assert "SecretPassword123!" not in str(event)
    assert "retry_after" in event
