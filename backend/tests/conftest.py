"""Global pytest configuration for AgiesAI Sentinel backend tests."""

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
