import csv, json, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from AI_server.benchmark.labeler.app import app

POINTS=[{"x_px":100,"y_px":50},{"x_px":135,"y_px":65},{"x_px":150,"y_px":100},{"x_px":135,"y_px":135},{"x_px":100,"y_px":150},{"x_px":65,"y_px":135},{"x_px":50,"y_px":100},{"x_px":65,"y_px":65}]
DATASET=os.environ.get("SAIGON_SNIPER_TEST_DATASET_ROOT")
@unittest.skipUnless(DATASET, "Set SAIGON_SNIPER_TEST_DATASET_ROOT to run annotation persistence tests.")
class AnnotationPersistenceTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(); self.path=Path(self.temp.name)/"annotations.csv"
  self.env=patch.dict(os.environ,{"SAIGON_SNIPER_DATASET_ROOT":DATASET,"SAIGON_SNIPER_ANNOTATIONS_PATH":str(self.path)},clear=False); self.env.start(); self.client=TestClient(app)
 def tearDown(self): self.env.stop(); self.temp.cleanup()
 def payload(self, annotation_pass="A", **extra):
  value={"source_id":"RIFLE_SRC_0001","annotation_pass":annotation_pass,"labeler_id":"TEST_LABELER","calibration_points":POINTS,"hole_center":{"x_px":100,"y_px":100},"perspective_status":"circular","label_quality":"good","notes":"a,b\nquoted"}; value.update(extra); return value
 def rows(self):
  with self.path.open(newline="",encoding="utf-8") as f:return list(csv.DictReader(f))
 def test_append_a_b_integrity_and_server_fields(self):
  a=self.client.post("/api/annotations",json=self.payload(derived_score_tenths=109,image_sha256="0"*64,rule_set_id="forged")); self.assertEqual(a.status_code,201)
  before=self.rows()[0].copy(); b=self.client.post("/api/annotations",json=self.payload("B")); self.assertEqual(b.status_code,201)
  rows=self.rows(); self.assertEqual(len(rows),2); self.assertEqual(rows[0],before); self.assertNotEqual(rows[0]["annotation_id"],rows[1]["annotation_id"])
  self.assertEqual({r["annotation_pass"] for r in rows},{"A","B"}); self.assertEqual(rows[0]["review_status"],"unreviewed"); self.assertEqual(rows[0]["rule_set_id"],"saigon_sniper_air_rifle_10m_decimal_v1"); self.assertNotEqual(rows[0]["image_sha256"],"0"*64); self.assertEqual((rows[0]["image_width_px"],rows[0]["image_height_px"]),("3024","3024")); self.assertTrue(rows[0]["annotation_timestamp_utc"].endswith("+00:00")); self.assertEqual(json.loads(rows[0]["calibration_points"]),POINTS); self.assertEqual(json.loads(rows[0]["hole_boundary_points"]),None); self.assertNotIn("reference_score_tenths",rows[0]); self.assertEqual(rows[0]["notes"],"a,b\nquoted")
 def test_rejects_duplicate_and_bad_operator_input_without_leak(self):
  self.assertEqual(self.client.post("/api/annotations",json=self.payload()).status_code,201)
  duplicate=self.client.post("/api/annotations",json=self.payload()); self.assertEqual(duplicate.status_code,409); self.assertEqual(duplicate.json(),{"detail":{"status":"duplicate_annotation_pass"}})
  for change in ({"labeler_id":""},{"labeler_id":"x"*129},{"annotation_pass":"C"},{"hole_center":{"x_px":99999,"y_px":1}},{"calibration_points":POINTS[:4]}): self.assertEqual(self.client.post("/api/annotations",json=self.payload(**change)).status_code,422)
 def test_unsupported_source_is_blocked(self): self.assertEqual(self.client.post("/api/annotations",json=self.payload(source_id="RIFLE_SRC_0003")).status_code,422)
