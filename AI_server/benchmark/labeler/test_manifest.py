"""Focused synthetic tests for manifest identity and path safety."""

from __future__ import annotations

import csv
import hashlib
import tempfile
import unittest
from pathlib import Path

try:
    from .manifest import SourceManifest
except ImportError:  # Supports direct execution from the repository root.
    from manifest import SourceManifest


FIELDNAMES = [
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
    "reference_score_tenths",
    "reference_status",
    "reference_source",
    "split",
    "include_in_benchmark",
    "ground_truth_method",
    "review_status",
    "capture_session",
    "notes",
]


def sha256_bytes(contents: bytes) -> str:
    return hashlib.sha256(contents).hexdigest().upper()


def make_record(
    source_id: str,
    relative_source_path: str,
    image_format: str,
    contents: bytes,
) -> dict[str, str]:
    return {
        "source_id": source_id,
        "original_filename": Path(relative_source_path).name,
        "relative_source_path": relative_source_path,
        "target_type": "air_rifle_10m",
        "shot_count": "1",
        "image_format": image_format,
        "width_px": "1",
        "height_px": "1",
        "file_size_bytes": str(len(contents)),
        "image_sha256": sha256_bytes(contents),
        "provenance": "definitely_unseen",
        "reference_score_tenths": "",
        "reference_status": "unlabeled",
        "reference_source": "",
        "split": "unassigned",
        "include_in_benchmark": "false",
        "ground_truth_method": "",
        "review_status": "unreviewed",
        "capture_session": "",
        "notes": "",
    }


class SourceManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_directory.name)
        self.dataset_root = self.root / "dataset"
        self.dataset_root.mkdir()
        self.contents = b"synthetic-jpg-bytes"
        (self.dataset_root / "sample.jpg").write_bytes(self.contents)

    def tearDown(self) -> None:
        self.temp_directory.cleanup()

    def load_manifest(self, record: dict[str, str]) -> SourceManifest:
        manifest_path = self.root / "manifest.csv"
        with manifest_path.open("w", newline="", encoding="utf-8") as manifest_file:
            writer = csv.DictWriter(manifest_file, fieldnames=FIELDNAMES)
            writer.writeheader()
            writer.writerow(record)
        return SourceManifest.load(manifest_path)

    def test_matching_file_is_verified(self) -> None:
        manifest = self.load_manifest(
            make_record("RIFLE_SRC_0001", "sample.jpg", "jpg", self.contents)
        )
        self.assertEqual(
            manifest.verify_source("RIFLE_SRC_0001", self.dataset_root).status,
            "verified",
        )

    def test_modified_file_is_hash_mismatch(self) -> None:
        manifest = self.load_manifest(
            make_record("RIFLE_SRC_0001", "sample.jpg", "jpg", self.contents)
        )
        (self.dataset_root / "sample.jpg").write_bytes(b"changed")
        self.assertEqual(
            manifest.verify_source("RIFLE_SRC_0001", self.dataset_root).status,
            "hash_mismatch",
        )

    def test_missing_file_is_reported(self) -> None:
        manifest = self.load_manifest(
            make_record("RIFLE_SRC_0001", "missing.jpg", "jpg", self.contents)
        )
        self.assertEqual(
            manifest.verify_source("RIFLE_SRC_0001", self.dataset_root).status,
            "file_missing",
        )

    def test_dng_is_unsupported(self) -> None:
        manifest = self.load_manifest(
            make_record("RIFLE_SRC_0001", "sample.dng", "dng", self.contents)
        )
        self.assertEqual(
            manifest.verify_source("RIFLE_SRC_0001", self.dataset_root).status,
            "unsupported_format",
        )

    def test_unknown_source_id_raises(self) -> None:
        manifest = self.load_manifest(
            make_record("RIFLE_SRC_0001", "sample.jpg", "jpg", self.contents)
        )
        with self.assertRaises(KeyError):
            manifest.verify_source("RIFLE_SRC_9999", self.dataset_root)

    def test_unsafe_relative_path_is_rejected(self) -> None:
        manifest = self.load_manifest(
            make_record("RIFLE_SRC_0001", "../escape.jpg", "jpg", self.contents)
        )
        self.assertEqual(
            manifest.verify_source("RIFLE_SRC_0001", self.dataset_root).status,
            "unsafe_path",
        )

    def test_missing_dataset_root_is_reported(self) -> None:
        manifest = self.load_manifest(
            make_record("RIFLE_SRC_0001", "sample.jpg", "jpg", self.contents)
        )
        self.assertEqual(
            manifest.verify_source("RIFLE_SRC_0001", None).status,
            "dataset_not_configured",
        )


if __name__ == "__main__":
    unittest.main()
