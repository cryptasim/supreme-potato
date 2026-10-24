"""Vercel Python function entrypoint.

Vercel turns every ``api/*.py`` file into a function and loads the top-level
``app`` (ASGI) from it. The real FastAPI application lives in ``backend/app``;
this shim only makes that package importable and re-exports it, so the backend
runs identically under uvicorn (Docker / local) and on Vercel.

``vercel.json`` rewrites ``/api/(.*)`` to this function. The ASGI scope still
carries the original path (e.g. ``/api/decision``), which is why the backend
declares its routes with the ``/api`` prefix and nothing is stripped here.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_BACKEND_DIR = _REPO_ROOT / "backend"

if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

# The snapshot is bundled via `functions["api/index.py"].includeFiles` in
# vercel.json. The backend resolves it relative to its own package, but we
# publish the absolute location as well so the data store can prefer an
# explicit path (and so it can be overridden from the Vercel dashboard).
os.environ.setdefault(
    "SNAPSHOT_PATH", str(_BACKEND_DIR / "data" / "snapshot_jan2026.json.gz")
)

from app.main import app  # noqa: E402  (import must follow the sys.path tweak)

__all__ = ["app"]
