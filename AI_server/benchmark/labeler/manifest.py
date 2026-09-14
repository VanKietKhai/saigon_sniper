"""Read-only source-manifest access and on-demand image identity checks."""

from __future__ import annotations

import csv
import hashlib
import os
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Mapping


DATASET_ROOT_ENV = "SAIGON_SNIPER_DATASET_ROOT"
SUPPORTED_IMAGE_FORMATS = frozenset({"jpg", "jpeg"})
REQUIRED_MANIFEST_COLUMNS = frozenset(
    {
        "source_id",
        "original_filename",
        "relative_source_path",
        "target_type",
        "shot_count",
        "image_format",
        "width_px",
        "height_px",
        "file_size_bytes",
        "image_sha256",
        "provenance",
        "reference_status",
        "split",
        "include_in_benchmark",
    }
)


class ManifestError(ValueError):
    """Raised when the committed source-manifest contract is invalid."""


class SourceNotFoundError(KeyError):
    """Raised when a browser-supplied source ID has no manifest record."""


class UnsafeSourcePathError(ValueError):
    """Raised when a manifest path would escape the configured dataset root."""


@dataclass(frozen=True)
class IdentityResult:
    """Read-only file identity state; resolved paths never reach browser JSON."""

    status: str
    path: Path | None = None
    detail: str | None = None

    def public(self) -> dict[str, str]:
        payload = {"status": self.status}
        if self.detail:
            payload["detail"] = self.detail
        return payload


class SourceManifest:
    """Immutable in-memory index of committed source-manifest values."""

    def __init__(self, records: Mapping[str, Mapping[str, str]]):
        self._records = dict(records)

    @classmethod
    def load(cls, manifest_path: Path) -> "SourceManifest":
        with manifest_path.open(newline="", encoding="utf-8") as manifest_file:
            reader = csv.DictReader(manifest_file)
            if reader.fieldnames is None:
                raise ManifestError("Source manifest has no header row.")
            missing_columns = REQUIRED_MANIFEST_COLUMNS - set(reader.fieldnames)
            if missing_columns:
                raise ManifestError(
                    "Source manifest is missing columns: "
                    + ", ".join(sorted(missing_columns))
                )

            records: dict[str, Mapping[str, str]] = {}
            for row in reader:
                source_id = row["source_id"].strip()
                if not source_id:
                    raise ManifestError("Source manifest contains an empty source_id.")
                if source_id in records:
                    raise ManifestError(f"Duplicate source_id: {source_id}")
                records[source_id] = dict(row)

        return cls(records)

    @property
    def record_count(self) -> int:
        return len(self._records)

    def record_for(self, source_id: str) -> Mapping[str, str]:
        try:
            return self._records[source_id]
        except KeyError as error:
            raise SourceNotFoundError(source_id) from error

    def metadata_for(self, source_id: str) -> dict[str, str]:
        record = self.record_for(source_id)
        return {
            key: record[key]
            for key in (
                "source_id",
                "original_filename",
                "relative_source_path",
                "target_type",
                "shot_count",
                "image_format",
                "width_px",
                "height_px",
                "provenance",
                "reference_status",
                "split",
                "include_in_benchmark",
                "image_sha256",
            )
        }

    def all_metadata(self, image_format: str | None = None) -> list[dict[str, str]]:
        source_ids = sorted(self._records)
        if image_format is not None:
            expected_format = image_format.lower()
            source_ids = [
                source_id
                for source_id in source_ids
                if self._records[source_id]["image_format"].lower() == expected_format
            ]
        return [self.metadata_for(source_id) for source_id in source_ids]

    def verify_source(
        self, source_id: str, dataset_root: Path | None
    ) -> IdentityResult:
        record = self.record_for(source_id)
        if record["image_format"].lower() not in SUPPORTED_IMAGE_FORMATS:
            return IdentityResult("unsupported_format")
        if dataset_root is None:
            return IdentityResult("dataset_not_configured")

        try:
            resolved_path = resolve_source_path(
                dataset_root, record["relative_source_path"]
            )
        except UnsafeSourcePathError:
            return IdentityResult("unsafe_path")

        if not resolved_path.is_file():
            return IdentityResult("file_missing")
        if sha256_file(resolved_path).upper() != record["image_sha256"].upper():
            return IdentityResult("hash_mismatch")
        return IdentityResult("verified", path=resolved_path)


def dataset_root_from_environment() -> Path | None:
    """Return an existing configured dataset root without exposing it to clients."""
    configured_value = os.environ.get(DATASET_ROOT_ENV)
    if not configured_value:
        return None
    configured_root = Path(configured_value).expanduser()
    if not configured_root.is_dir():
        return None
    return configured_root.resolve()


def resolve_source_path(dataset_root: Path, relative_source_path: str) -> Path:
    """Resolve only a manifest-relative path that remains beneath dataset_root."""
    posix_path = PurePosixPath(relative_source_path)
    windows_path = PureWindowsPath(relative_source_path)
    if (
        not relative_source_path
        or posix_path.is_absolute()
        or windows_path.is_absolute()
        or ".." in posix_path.parts
    ):
        raise UnsafeSourcePathError(relative_source_path)

    root = dataset_root.resolve()
    candidate = (root.joinpath(*posix_path.parts)).resolve(strict=False)
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise UnsafeSourcePathError(relative_source_path) from error
    return candidate


def sha256_file(file_path: Path) -> str:
    """Hash one requested file on demand; do not scan the source pool at startup."""
    digest = hashlib.sha256()
    with file_path.open("rb") as source_file:
        for block in iter(lambda: source_file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
