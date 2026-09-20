import csv, json, math, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from AI_server.benchmark.labeler.app import app
from AI_server.benchmark.labeler.annotations import FIELDNAMES

ANCHORS=[{"x_px":100,"y_px":50,"semantic_role":"12h"},{"x_px":150,"y_px":100,"semantic_role":"3h"},{"x_px":100,"y_px":150,"semantic_role":"6h"},{"x_px":50,"y_px":100,"semantic_role":"9h"},{"x_px":135,"y_px":65},{"x_px":135,"y_px":135},{"x_px":65,"y_px":135},{"x_px":65,"y_px":65}]
HOLE_POINTS=[{"x_px":100,"y_px":92,"semantic_role":"hole_12h"},{"x_px":112,"y_px":100,"semantic_role":"hole_3h"},{"x_px":100,"y_px":108,"semantic_role":"hole_6h"},{"x_px":88,"y_px":100,"semantic_role":"hole_9h"},{"x_px":108.485,"y_px":94.343},{"x_px":108.485,"y_px":105.657},{"x_px":91.515,"y_px":105.657},{"x_px":91.515,"y_px":94.343}]
DATASET=os.environ.get("SAIGON_SNIPER_TEST_DATASET_ROOT")

@unittest.skipUnless(DATASET, "Set SAIGON_SNIPER_TEST_DATASET_ROOT to run annotation persistence tests.")
class AnnotationPersistenceTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(); self.path=Path(self.temp.name)/"annotations.csv"
  self.env=patch.dict(os.environ,{"SAIGON_SNIPER_DATASET_ROOT":DATASET,"SAIGON_SNIPER_ANNOTATIONS_PATH":str(self.path)},clear=False); self.env.start(); self.client=TestClient(app)
 def tearDown(self): self.env.stop(); self.temp.cleanup()
 def payload(self, annotation_pass="A", **extra):
  value={"source_id":"RIFLE_SRC_0001","annotation_pass":annotation_pass,"labeler_id":"TEST_LABELER","calibration_points":ANCHORS,"hole_boundary_points":HOLE_POINTS,"target_label_quality":"good","hole_label_quality":"good","notes":"a,b\nquoted"}; value.update(extra); return value
 def rows(self):
  with self.path.open(newline="",encoding="utf-8") as f:return list(csv.DictReader(f))
 def test_append_persists_semantic_anchors_and_eight_point_boundary(self):
  response=self.client.post("/api/annotations",json=self.payload(target_center={"x_px":1,"y_px":1})); self.assertEqual(response.status_code,201)
  row=self.rows()[0]; self.assertEqual(row["schema_version"],"2.7"); self.assertEqual([point["semantic_role"] for point in json.loads(row["target_anchor_points"])],["12h","3h","6h","9h"]); self.assertEqual(len(json.loads(row["target_boundary_points"])),8)
  self.assertEqual(row["target_center_method"],"cardinal_diameter_intersection_v1"); self.assertAlmostEqual(float(row["bull_center_x_px"]),100); self.assertAlmostEqual(float(row["bull_center_y_px"]),100)
  self.assertEqual(row["target_label_quality"],"good"); self.assertEqual(row["hole_center_method"],"cardinal_diameter_intersection_v1"); self.assertEqual([point["semantic_role"] for point in json.loads(row["hole_anchor_points"])],["hole_12h","hole_3h","hole_6h","hole_9h"]); self.assertAlmostEqual(float(row["hole_center_x_px"]),100); self.assertAlmostEqual(float(row["hole_center_y_px"]),100)
  self.assertNotIn("target_point_residuals_px",row); self.assertEqual(row["derived_score_tenths"],"109")
 def test_rejects_nonfour_or_invalid_cardinal_geometry(self):
  self.assertEqual(self.client.post("/api/annotations",json=self.payload(calibration_points=ANCHORS[:3])).status_code,422)
  parallel=[{**ANCHORS[0],"x_px":10,"y_px":10},{**ANCHORS[1],"x_px":30,"y_px":90},{**ANCHORS[2],"x_px":10,"y_px":90},{**ANCHORS[3],"x_px":30,"y_px":10}]
  self.assertEqual(self.client.post("/api/annotations",json=self.payload(calibration_points=parallel)).status_code,422)
 def test_duplicate_pass_is_blocked_and_hole_workflow_persists(self):
  self.assertEqual(self.client.post("/api/annotations",json=self.payload()).status_code,201)
  self.assertEqual(self.client.post("/api/annotations",json=self.payload()).status_code,409)
  row=self.rows()[0]; self.assertEqual(len(json.loads(row["hole_boundary_points"])),8); self.assertTrue(row["hole_ellipse_rms_residual_px"])
 def test_target_center_endpoint_ignores_forged_center_and_requires_semantic_roles(self):
  response=self.client.post("/api/target-center",json={"points":ANCHORS[:4],"target_center":{"x_px":1,"y_px":1}}); self.assertEqual(response.status_code,200)
  center=response.json()["cardinal_projective_center"]; self.assertAlmostEqual(center["cardinal_center_x_px"],100); self.assertAlmostEqual(center["cardinal_center_y_px"],100)
  self.assertEqual(self.client.post("/api/target-center",json={"points":[{"x_px":1,"y_px":1}]*4}).status_code,422)
 def test_hole_center_endpoint_and_persistence_reject_invalid_semantic_hole_geometry(self):
  response=self.client.post("/api/hole-center",json={"points":HOLE_POINTS[:4]}); self.assertEqual(response.status_code,200)
  self.assertEqual(response.json()["hole_center_method"],"cardinal_diameter_intersection_v1")
  self.assertEqual(self.client.post("/api/hole-center",json={"points":[{"x_px":1,"y_px":1}]*4}).status_code,422)
  invalid=[point.copy() for point in HOLE_POINTS]; invalid[0].pop("semantic_role")
  self.assertEqual(self.client.post("/api/annotations",json=self.payload(hole_boundary_points=invalid)).status_code,422)
 def test_saved_annotation_reloads_the_semantic_hole_roles(self):
  saved=self.client.post("/api/annotations",json=self.payload()).json()["annotation_id"]
  restored=self.client.get(f"/api/annotations/{saved}"); self.assertEqual(restored.status_code,200)
  self.assertEqual([point["semantic_role"] for point in restored.json()["annotation"]["hole_boundary_points"][:4]],["hole_12h","hole_3h","hole_6h","hole_9h"])
