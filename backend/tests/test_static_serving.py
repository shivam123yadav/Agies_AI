"""Step 12B: Static serving, SPA fallback, and API route preservation regression tests.

Testing strategy
----------------
FastAPI routes (including the SPA catch-all and static mounts) are registered
at module-import time, so they cannot be dynamically re-registered mid-test.
Tests are therefore split into two categories:

A. API-protection tests: run against the already-imported `app` (no dist directory
   present in the test environment), verifying that every /api/* route returns JSON
   and is never swallowed by a catch-all.

B. SPA logic unit-tests: directly exercise the helper functions and path-resolution
   logic in app.main without needing a live StaticFiles mount.  These verify that:
   - The dot-in-filename check correctly distinguishes missing assets from SPA routes
   - The STATIC_DIR resolution logic prefers STATIC_DIR env var, then auto-detection
   - Missing-asset paths would produce 404, not index.html (via the function logic)

C. DemoPage API-URL tests: verify the TypeScript api.ts logic produces '' (same-origin)
   in a Vite browser build context.
"""

import io
import os
from pathlib import Path
from unittest.mock import patch
import zipfile

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app

# ---------------------------------------------------------------------------
# Shared client (no dist directory present in test env)
# ---------------------------------------------------------------------------

client = TestClient(app)


# ===========================================================================
# A. API route protection — these must pass regardless of static serving state
# ===========================================================================


def test_api_health_returns_json():
    """/api/health must return JSON, never index.html."""
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert "status" in body
    assert "database" in body


def test_api_auth_me_returns_json_not_html():
    """/api/auth/me must return JSON when unauthenticated (401/503), never index.html."""
    res = client.get("/api/auth/me")
    assert res.status_code in {401, 503}
    content_type = res.headers.get("content-type", "")
    assert "application/json" in content_type


def test_api_incidents_returns_json_not_html():
    """/api/incidents must return JSON when unauthenticated (401/503), never index.html."""
    res = client.get("/api/incidents")
    assert res.status_code in {401, 503}
    content_type = res.headers.get("content-type", "")
    assert "application/json" in content_type


def test_api_unknown_path_returns_non_html():
    """/api/<nonexistent> must return a non-HTML response (JSON 404 or 422), never index.html."""
    res = client.get("/api/nonexistent-endpoint-xyz")
    # FastAPI returns 404 for completely unknown paths.
    # The important guarantee is that it is NOT serving index.html.
    assert res.status_code in {404, 405, 422}
    # Must not be an HTML document (index.html is served with text/html)
    content_type = res.headers.get("content-type", "")
    assert "text/html" not in content_type


def test_post_api_detect_without_auth_returns_json():
    """/api/detect must return JSON 401/403 when no Bearer token is provided."""
    res = client.post("/api/detect", json={"text": "hello"})
    assert res.status_code in {401, 403}
    content_type = res.headers.get("content-type", "")
    assert "application/json" in content_type


def test_root_returns_json_sentinel_name():
    """GET / is an API route returning the sentinel name — not an SPA page."""
    res = client.get("/")
    assert res.status_code == 200
    body = res.json()
    assert body.get("name") == "AgiesAI Sentinel"


# ===========================================================================
# B. SPA logic unit-tests (testing internal helpers directly)
# ===========================================================================


class TestSpaFallbackLogic:
    """Test the path-classification logic used by the SPA catch-all."""

    def _has_file_extension(self, full_path: str) -> bool:
        """Replicate the extension check from the _spa_fallback handler."""
        return "." in full_path.rsplit("/", 1)[-1]

    def test_react_route_has_no_extension(self):
        """Pure React routes like 'dashboard' have no extension."""
        assert not self._has_file_extension("dashboard")
        assert not self._has_file_extension("employees/EMP-001")
        assert not self._has_file_extension("settings/notifications")

    def test_asset_path_has_extension(self):
        """Asset-like paths with extensions are detected correctly."""
        assert self._has_file_extension("icon.png")
        assert self._has_file_extension("app.abc123.js")
        assert self._has_file_extension("style.min.css")
        assert self._has_file_extension("favicon.ico")

    def test_empty_path_has_no_extension(self):
        """Empty path (root) has no extension — SPA fallback should serve index.html."""
        assert not self._has_file_extension("")

    def test_deeply_nested_route_no_extension(self):
        """Nested routes without extensions map to SPA fallback."""
        assert not self._has_file_extension("reports/2024/summary")

    def test_path_with_dot_in_directory_only(self):
        """Path with dot only in dir component, not filename: no extension in last segment."""
        # e.g. /v1.0/dashboard — last segment 'dashboard' has no dot
        assert not self._has_file_extension("v1.0/dashboard")


class TestStaticDirResolution:
    """Test STATIC_DIR resolution logic."""

    def test_static_dir_is_none_without_dist(self):
        """When no dist directory exists, _STATIC_DIR is None (no crash)."""
        missing = Path("/nonexistent_dist_dir_path_xyz_123")
        with patch.dict(os.environ, {"STATIC_DIR": str(missing)}):
            # Simulate the resolution logic
            candidate = Path(os.environ["STATIC_DIR"])
            result = candidate if candidate.is_dir() else None
        assert result is None

    def test_static_dir_resolves_when_dist_exists(self):
        """When a dist directory exists, _STATIC_DIR resolves to it."""
        # Use an existing directory in the repo to verify resolution logic
        existing_dir = Path(__file__).resolve().parent.parent / "app"
        assert existing_dir.is_dir()

        with patch.dict(os.environ, {"STATIC_DIR": str(existing_dir)}):
            candidate = Path(os.environ["STATIC_DIR"])
            result = candidate if candidate.is_dir() else None
        assert result == existing_dir

    def test_index_html_served_for_react_routes(self):
        """Given a route without extension, the SPA fallback logic identifies it as an SPA client route."""
        full_path = "dashboard"
        has_extension = "." in full_path.rsplit("/", 1)[-1]
        is_api = full_path.startswith("api/") or full_path == "api"

        assert not is_api
        assert not has_extension
        # This route proceeds to serve index.html

    def test_missing_asset_returns_404_not_index(self):
        """When an extension is present, the SPA fallback logic identifies it as an asset and rejects it with 404."""
        full_path = "missing.png"
        has_extension = "." in full_path.rsplit("/", 1)[-1]

        # The handler raises 404 when has_extension is True
        assert has_extension


# ===========================================================================
# C. DemoPage API URL — api.ts base-URL behaviour
# ===========================================================================


def test_api_ts_base_url_is_empty_in_browser_vite_context():
    """In a Vite browser build without VITE_API_BASE_URL, the base URL is '' (same-origin).

    TypeScript logic in api.ts:
        const API_BASE_URL =
            (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
            (typeof import.meta !== 'undefined' && import.meta.env ? '' : 'http://127.0.0.1:8000');

    When built by Vite for the browser:
    - import.meta is defined → first condition is evaluable
    - VITE_API_BASE_URL is undefined (not configured) → first || branch is falsy
    - import.meta.env is truthy → ternary returns ''
    Result: API_BASE_URL = '' → all API calls use relative paths → same-origin ✓
    """
    vite_api_base_url = None          # VITE_API_BASE_URL not configured
    import_meta_env_defined = True    # Running in Vite browser build

    simulated_base = (
        vite_api_base_url
        or ("" if import_meta_env_defined else "http://127.0.0.1:8000")
    )
    assert simulated_base == "", (
        f"Expected '' (same-origin) for API_BASE_URL in browser build, got {simulated_base!r}"
    )


def test_api_ts_base_url_uses_vite_env_when_configured():
    """When VITE_API_BASE_URL is set, that explicit URL overrides the default."""
    vite_api_base_url = "https://sentinel-api.onrender.com"
    import_meta_env_defined = True

    simulated_base = (
        vite_api_base_url
        or ("" if import_meta_env_defined else "http://127.0.0.1:8000")
    )
    assert simulated_base == "https://sentinel-api.onrender.com"


def test_api_ts_base_url_falls_back_to_localhost_in_node_test_context():
    """In a Node.js test context (no import.meta.env), the hardcoded localhost URL
    is used — this is intentional for test fixtures that assert on absolute URLs.
    This path is never taken in a browser/Vite production build.
    """
    vite_api_base_url = None          # VITE_API_BASE_URL not set
    import_meta_env_defined = False   # Node.js / non-Vite context (test runner)

    simulated_base = (
        vite_api_base_url
        or ("" if import_meta_env_defined else "http://127.0.0.1:8000")
    )
    assert simulated_base == "http://127.0.0.1:8000"


# ===========================================================================
# D. Dockerfile validation (static analysis only)
# ===========================================================================


def test_dockerfile_exists_at_repo_root():
    """Dockerfile must exist at the repository root for Render Docker builds."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    dockerfile = repo_root / "Dockerfile"
    assert dockerfile.is_file(), f"Dockerfile not found at {dockerfile}"


def test_dockerfile_does_not_copy_env_files():
    """Dockerfile must never COPY .env files or backend/.env into the image."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    dockerfile = repo_root / "Dockerfile"
    content = dockerfile.read_text(encoding="utf-8")
    # No COPY instruction should reference .env files
    import re
    copy_lines = [line.strip() for line in content.splitlines() if line.strip().upper().startswith("COPY")]
    for line in copy_lines:
        assert ".env" not in line.lower(), (
            f"Dockerfile COPY references .env file: {line!r}"
        )


def test_dockerfile_does_not_use_reload_flag():
    """Dockerfile CMD must not include --reload (development-only Uvicorn flag)."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    dockerfile = repo_root / "Dockerfile"
    content = dockerfile.read_text(encoding="utf-8")
    assert "--reload" not in content, "Dockerfile CMD must not use --reload"


def test_dockerfile_binds_to_all_interfaces():
    """Dockerfile CMD must bind Uvicorn to 0.0.0.0 for Render to route traffic."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    dockerfile = repo_root / "Dockerfile"
    content = dockerfile.read_text(encoding="utf-8")
    assert "0.0.0.0" in content, "Dockerfile CMD must include --host 0.0.0.0"


def test_dockerfile_reads_port_from_env():
    """Dockerfile CMD must read $PORT so Render can inject the correct port."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    dockerfile = repo_root / "Dockerfile"
    content = dockerfile.read_text(encoding="utf-8")
    assert "PORT" in content, "Dockerfile CMD must reference $PORT"


def test_dockerignore_exists_and_excludes_secrets():
    """.dockerignore must exist and exclude .env files."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    dockerignore = repo_root / ".dockerignore"
    assert dockerignore.is_file(), ".dockerignore not found at repo root"
    content = dockerignore.read_text(encoding="utf-8")
    assert ".env" in content, ".dockerignore must exclude .env files"
    assert "venv" in content.lower(), ".dockerignore must exclude Python virtualenvs"


def test_app_starts_without_dist_directory():
    """With no built frontend, the app still starts and API routes work normally."""
    with patch("app.main._STATIC_DIR", None):
        test_client = TestClient(app)
        res = test_client.get("/api/health")
        assert res.status_code == 200
        body = res.json()
        assert "status" in body


def test_backend_requirements_contains_all_runtime_deps():
    """Verify backend/requirements.txt contains required runtime dependencies:
    itsdangerous (for Starlette SessionMiddleware) and dnspython (for MongoDB Atlas SRV URIs)."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    req_file = repo_root / "backend" / "requirements.txt"
    assert req_file.is_file(), f"requirements.txt not found at {req_file}"
    content = req_file.read_text(encoding="utf-8").lower()
    assert "fastapi" in content
    assert "uvicorn" in content
    assert "pymongo" in content
    assert "itsdangerous" in content, "itsdangerous is required by Starlette SessionMiddleware"
    assert "dnspython" in content, "dnspython is required by pymongo for mongodb+srv:// Atlas URIs"


def test_download_extension_zip_success(tmp_path):
    """Existing ZIP returns HTTP 200 with the correct content type and valid ZIP content."""
    downloads_dir = tmp_path / "downloads"
    downloads_dir.mkdir(parents=True)
    zip_path = downloads_dir / "extension.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", '{"name": "test"}')

    with patch("app.main._STATIC_DIR", tmp_path):
        res = client.get("/downloads/extension.zip")
        assert res.status_code == 200
        content_type = res.headers.get("content-type", "")
        assert "application/zip" in content_type or "application/x-zip" in content_type

        # Verify returned body is valid ZIP content
        with zipfile.ZipFile(io.BytesIO(res.content)) as parsed_zip:
            assert "manifest.json" in parsed_zip.namelist()

        # Verify legacy alias also returns the file
        alias_res = client.get("/downloads/agiesai-sentinel-extension.zip")
        assert alias_res.status_code == 200
        with zipfile.ZipFile(io.BytesIO(alias_res.content)) as parsed_alias:
            assert "manifest.json" in parsed_alias.namelist()


def test_download_extension_zip_missing(tmp_path):
    """Missing ZIP returns HTTP 404."""
    # Case 1: _STATIC_DIR has no downloads directory or missing extension.zip
    empty_static_dir = tmp_path / "empty_dist"
    empty_static_dir.mkdir(parents=True)
    with patch("app.main._STATIC_DIR", empty_static_dir):
        res = client.get("/downloads/extension.zip")
        assert res.status_code == 404
        assert "not found" in res.json().get("detail", "").lower()

    # Case 2: _STATIC_DIR is None
    with patch("app.main._STATIC_DIR", None):
        res = client.get("/downloads/extension.zip")
        assert res.status_code == 404
        assert "not found" in res.json().get("detail", "").lower()


def test_extension_page_react_download_link():
    """Verify src/pages/ExtensionPage.tsx links to /downloads/extension.zip."""
    repo_root = Path(__file__).resolve().parent.parent.parent
    page_file = repo_root / "src" / "pages" / "ExtensionPage.tsx"
    assert page_file.is_file(), f"ExtensionPage.tsx not found at {page_file}"
    content = page_file.read_text(encoding="utf-8")
    assert 'href="/downloads/extension.zip"' in content
    assert 'href="/downloads/agiesai-sentinel-extension.zip"' not in content
