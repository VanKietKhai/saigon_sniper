"""Independent local Ground Truth Labeler scaffold.

This module intentionally provides no image loading, annotation persistence,
scoring, or automated computer-vision behavior in R1.3D.1.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


LABELER_ROOT = Path(__file__).resolve().parent
app = FastAPI(title="Saigon Sniper Ground Truth Labeler", version="v1")
app.mount(
    "/static",
    StaticFiles(directory=LABELER_ROOT / "static"),
    name="static",
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Return local labeler availability without accessing dataset content."""
    return {"status": "ground_truth_labeler", "version": "v1"}


@app.get("/", response_class=FileResponse)
async def root() -> FileResponse:
    """Serve the static scaffold UI."""
    return FileResponse(LABELER_ROOT / "templates" / "index.html")
