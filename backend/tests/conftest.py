"""Global pytest configuration for AgiesAI Sentinel backend tests."""

import os
import sys
from urllib.parse import urlsplit

# ---------------------------------------------------------------------------
# Test Suite Safety Guard: Production and Database Isolation
# ---------------------------------------------------------------------------
# Do not load production .env automatically. Tests require explicit test configuration.

PROD_ENV_NAMES = {"production", "prod"}
PROD_DB_NAMES = {"agiesai_sentinel", "sentinel", "agiesai_sentinel_prod", "agiesai_prod"}
TEST_DB_REQUIRED_SUBSTRING = "test"
ALLOWED_LOCAL_TEST_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def enforce_test_environment_safety() -> None:
    """Ensure tests never execute against production environment, cluster, or database."""
    # 1. Defend against pre-import pollution
    if "app.database" in sys.modules or "app.main" in sys.modules:
        raise RuntimeError(
            "TEST SUITE SAFETY GUARD: Application database module ('app.database') was imported "
            "before test safety validation could run. Cannot guarantee database isolation. "
            "Ensure conftest.py executes before any test or application imports."
        )

    # 2. Block execution when ENVIRONMENT is production
    env = os.getenv("ENVIRONMENT", "").strip().lower()
    if env in PROD_ENV_NAMES:
        raise RuntimeError(
            f"TEST SUITE SAFETY GUARD: Tests cannot run when ENVIRONMENT='{env}'. "
            "Aborting test session to prevent accidental modification of production systems."
        )

    # 3. Require explicitly configured test database name (MONGODB_DB)
    raw_db = os.getenv("MONGODB_DB")
    if not raw_db or not raw_db.strip():
        raise RuntimeError(
            "TEST SUITE SAFETY GUARD: Test database configuration is missing (MONGODB_DB is unset). "
            "Tests require an explicitly configured test database (e.g. MONGODB_DB='agiesai_sentinel_test'). "
            "Silent fallback to the default production database 'agiesai_sentinel' is blocked."
        )

    db_name = raw_db.strip()
    db_lower = db_name.lower()

    # 4. Block pointing to known production database names
    if db_lower in PROD_DB_NAMES:
        raise RuntimeError(
            f"TEST SUITE SAFETY GUARD: MONGODB_DB='{db_name}' points to the production database. "
            "Tests must run against a dedicated test database (e.g. MONGODB_DB='agiesai_sentinel_test')."
        )

    # 5. Require verified test database identifier
    if TEST_DB_REQUIRED_SUBSTRING not in db_lower:
        raise RuntimeError(
            f"TEST SUITE SAFETY GUARD: MONGODB_DB='{db_name}' cannot be verified as a test database. "
            f"Test database name must explicitly contain '{TEST_DB_REQUIRED_SUBSTRING}' (e.g. 'agiesai_sentinel_test')."
        )

    # 6. Require explicitly configured test MongoDB URI (no silent fallback)
    raw_uri = os.getenv("MONGODB_URI")
    if not raw_uri or not raw_uri.strip():
        raise RuntimeError(
            "TEST SUITE SAFETY GUARD: Test database URI is missing (MONGODB_URI is unset). "
            "Tests require an explicitly configured local test MongoDB URI (e.g. MONGODB_URI='mongodb://127.0.0.1:27017'). "
            "Silent fallback to default development or production URIs is strictly blocked."
        )

    clean_uri = raw_uri.strip()
    try:
        parsed = urlsplit(clean_uri)
    except Exception:
        raise RuntimeError(
            "TEST SUITE SAFETY GUARD: MONGODB_URI is malformed and cannot be parsed."
        )

    scheme = parsed.scheme.lower()
    if scheme == "mongodb+srv":
        raise RuntimeError(
            "TEST SUITE SAFETY GUARD: MONGODB_URI uses 'mongodb+srv://' (Atlas cloud cluster). "
            "Tests must not connect to remote Atlas clusters. Only local MongoDB instances are permitted."
        )

    if scheme != "mongodb":
        raise RuntimeError(
            f"TEST SUITE SAFETY GUARD: Invalid MONGODB_URI scheme '{scheme}' for test suite. "
            "Must use standard 'mongodb://'."
        )

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise RuntimeError(
            "TEST SUITE SAFETY GUARD: MONGODB_URI is missing a database hostname."
        )

    if "mongodb.net" in hostname:
        raise RuntimeError(
            "TEST SUITE SAFETY GUARD: MONGODB_URI points to an Atlas cloud cluster (*.mongodb.net). "
            "Tests are strictly forbidden from connecting to cloud clusters to prevent data loss or resource consumption."
        )

    # Strictly enforce recognized local test hosts. Remote hosts are forbidden.
    if hostname not in ALLOWED_LOCAL_TEST_HOSTS:
        raise RuntimeError(
            f"TEST SUITE SAFETY GUARD: MONGODB_URI points to unverified host '{hostname}'. "
            f"Tests are strictly restricted to local MongoDB instances ({sorted(ALLOWED_LOCAL_TEST_HOSTS)})."
        )

    # 7. Validate database name in URI path component if present
    raw_path = (parsed.path or "").strip()
    if raw_path and raw_path != "/":
        stripped_path = raw_path.lstrip("/")
        if "/" in stripped_path:
            raise RuntimeError(
                "TEST SUITE SAFETY GUARD: MONGODB_URI path contains invalid additional '/' segments. "
                "URI path must specify only a single test database name."
            )

        path_db = stripped_path
        path_db_lower = path_db.lower()
        if path_db_lower in PROD_DB_NAMES:
            raise RuntimeError(
                f"TEST SUITE SAFETY GUARD: MONGODB_URI path specifies production database '{path_db}'. "
                "URI database path must either be empty or specify an authorized test database."
            )
        if TEST_DB_REQUIRED_SUBSTRING not in path_db_lower:
            raise RuntimeError(
                f"TEST SUITE SAFETY GUARD: MONGODB_URI path specifies database '{path_db}', "
                f"which cannot be verified as a test database (must contain '{TEST_DB_REQUIRED_SUBSTRING}')."
            )

    # 8. Normalize validated configuration and protect environment against main.py load_dotenv()
    os.environ["MONGODB_DB"] = db_name
    os.environ["MONGODB_URI"] = clean_uri
    if not os.getenv("ENVIRONMENT"):
        os.environ["ENVIRONMENT"] = "test"


# Execute safety guard immediately upon importing conftest.py
enforce_test_environment_safety()


def pytest_configure(config):
    """Pytest hook to re-validate environment before test execution."""
    enforce_test_environment_safety()


from fastapi.testclient import TestClient

# In test suites, default TestClient instances to simulate requests from the trusted
# frontend origin (http://localhost:5173). Tests explicitly asserting missing or
# untrusted origins can pass headers={} or custom headers to override.
_orig_testclient_init = TestClient.__init__


def _csrf_aware_testclient_init(self, app, base_url="http://testserver", headers=None, **kwargs):
    if headers is None:
        headers = {"Origin": "http://localhost:5173"}
    _orig_testclient_init(self, app, base_url=base_url, headers=headers, **kwargs)


TestClient.__init__ = _csrf_aware_testclient_init
