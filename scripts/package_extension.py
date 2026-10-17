"""Packaging script for AgiesAI Sentinel Extension.

Builds a clean, installable Manifest V3 distribution ZIP containing all
verified extension assets at the archive root (no nested folders).
Updates both project/public/downloads/extension.zip and project/dist/downloads/extension.zip.
"""

import hashlib
import os
from pathlib import Path
import zipfile

# Paths
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
EXTENSION_DIR = REPO_ROOT / "extension"
PUBLIC_ZIP = REPO_ROOT / "project" / "public" / "downloads" / "extension.zip"
DIST_ZIP = REPO_ROOT / "project" / "dist" / "downloads" / "extension.zip"

EXTENSION_FILES = [
    "manifest.json",
    "background.js",
    "content.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "README.md",
]


def verify_source_files():
    """Verify all required extension files exist."""
    missing = [f for f in EXTENSION_FILES if not (EXTENSION_DIR / f).is_file()]
    if missing:
        raise FileNotFoundError(f"Missing required extension files: {missing}")


def build_zip(output_path: Path) -> dict:
    """Build installable zip with files at the root of the archive."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for filename in sorted(EXTENSION_FILES):
            file_path = EXTENSION_DIR / filename
            # Store at root of archive without 'extension/' directory prefix
            zf.write(file_path, arcname=filename)

    # Compute hash and size
    data = output_path.read_bytes()
    sha256_hash = hashlib.sha256(data).hexdigest()
    size = len(data)

    # Verify contents
    with zipfile.ZipFile(output_path, "r") as zf:
        namelist = zf.namelist()
        assert "manifest.json" in namelist, "manifest.json must be at root"
        assert not any(n.startswith("extension/") for n in namelist), "Archive must not have nested extension/ prefix"

    return {
        "path": str(output_path),
        "size": size,
        "sha256": sha256_hash,
        "files": namelist,
    }


def main():
    verify_source_files()
    print("Source files verified in:", EXTENSION_DIR)

    # 1. Build public zip
    res_public = build_zip(PUBLIC_ZIP)
    print(f"\n[Public ZIP]")
    print(f"Path: {res_public['path']}")
    print(f"Size: {res_public['size']} bytes")
    print(f"SHA-256: {res_public['sha256']}")
    print("Files in archive:")
    for f in res_public["files"]:
        print(f"  - {f}")

    # 2. Build dist zip if dist exists
    if DIST_ZIP.parent.parent.exists():
        res_dist = build_zip(DIST_ZIP)
        print(f"\n[Dist ZIP]")
        print(f"Path: {res_dist['path']}")
        print(f"Size: {res_dist['size']} bytes")
        print(f"SHA-256: {res_dist['sha256']}")
        assert res_dist["sha256"] == res_public["sha256"], "Public and Dist ZIPs must be bit-identical"


if __name__ == "__main__":
    main()
