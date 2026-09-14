"""Independent local Ground Truth Labeler scaffold.

This module intentionally provides no image loading, annotation persistence,
scoring, or automated computer-vision behavior in R1.3D.1.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .manifest import (
    SourceManifest,
    SourceNotFoundError,
    dataset_root_from_environment,
)


LABELER_ROOT = Path(__file__).resolve().parent
MANIFEST_PATH = LABELER_ROOT.parent / "rifle_source_manifest.csv"
source_manifest = SourceManifest.load(MANIFEST_PATH)
app = FastAPI(title="Saigon Sniper Ground Truth Labeler", version="v1")
app.mount(
    "/static",
    StaticFiles(directory=LABELER_ROOT / "static"),
    name="static",
)


@app.get("/health")
async def health() -> dict[str, object]:
    """Return availability without scanning or hashing source images."""
    return {
        "status": "ground_truth_labeler",
        "version": "v1",
        "manifest_loaded": True,
        "manifest_record_count": source_manifest.record_count,
        "dataset_configured": dataset_root_from_environment() is not None,
    }


@app.get("/", response_class=FileResponse)
async def root() -> FileResponse:
    """Serve the static scaffold UI."""
    return FileResponse(LABELER_ROOT / "templates" / "index.html")


@app.get("/api/sources")
async def list_sources(image_format: str | None = None) -> dict[str, object]:
    """Return manifest metadata only; no local dataset path is exposed."""
    sources = source_manifest.all_metadata(image_format)
    return {"record_count": len(sources), "sources": sources}


@app.get("/api/sources/{source_id}")
async def source_detail(source_id: str) -> dict[str, object]:
    """Return one manifest record with its current on-demand identity state."""
    try:
        metadata = source_manifest.metadata_for(source_id)
        identity = source_manifest.verify_source(
            source_id, dataset_root_from_environment()
        )
    except SourceNotFoundError as error:
        raise HTTPException(
            status_code=404,
            detail={"status": "source_not_found", "source_id": source_id},
        ) from error
    return {"source": metadata, "identity": identity.public()}


@app.get("/api/sources/{source_id}/image")
async def source_image(source_id: str) -> FileResponse:
    """Serve only a manifest-verified supported image file."""
    try:
        metadata = source_manifest.metadata_for(source_id)
        identity = source_manifest.verify_source(
            source_id, dataset_root_from_environment()
        )
    except SourceNotFoundError as error:
        raise HTTPException(
            status_code=404,
            detail={"status": "source_not_found", "source_id": source_id},
        ) from error

    error_statuses = {
        "dataset_not_configured": 503,
        "unsupported_format": 415,
        "file_missing": 404,
        "hash_mismatch": 409,
        "unsafe_path": 400,
    }
    if identity.status != "verified":
        raise HTTPException(status_code=error_statuses[identity.status], detail=identity.public())
    return FileResponse(
        identity.path,
        media_type="image/jpeg",
        filename=metadata["original_filename"],
    )
