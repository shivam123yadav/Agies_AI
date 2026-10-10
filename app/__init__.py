import pathlib

# Add the backend/app directory to this package's __path__ so that imports like
# `from app.auth import require_admin` resolve to the implementation located at
# `backend/app`.
_backend_path = pathlib.Path(__file__).parent.parent / "backend" / "app"
if not _backend_path.is_dir():
    raise ImportError(f"Backend app directory not found at {_backend_path!s}")
# Extend the package search path.
__path__.append(str(_backend_path.resolve()))
