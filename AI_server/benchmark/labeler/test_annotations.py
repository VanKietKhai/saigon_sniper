import csv, json, math, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from AI_server.benchmark.labeler.app import app
from AI_server.benchmark.labeler.annotations import FIELDNAMES

POINTS=[{"x_px":100,"y_px":50},{"x_px":135,"y_px":65},{"x_px":150,"y_px":100},{"x_px":135,"y_px":135},{"x_px":100,"y_px":150},{"x_px":65,"y_px":135},{"x_px":50,"y_px":100},{"x_px":65,"y_px":65}]
HOLE_POINTS=[{"x_px":100+12*math.cos(index*math.pi/4),"y_px":100+8*math.sin(index*math.pi/4)} for index in range(8)]
DATASET=os.environ.get("SAIGON_SNIPER_TEST_DATASET_ROOT")
@unittest.skipUnless(DATASET, "Set SAIGON_SNIPER_TEST_DATASET_ROOT to run annotation persistence tests.")
class AnnotationPersistenceTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(); self.path=Path(self.temp.name)/"annotations.csv"
  self.env=patch.dict(os.environ,{"SAIGON_SNIPER_DATASET_ROOT":DATASET,"SAIGON_SNIPER_ANNOTATIONS_PATH":str(self.path)},clear=False); self.env.start(); self.client=TestClient(app)
 def tearDown(self): self.env.stop(); self.temp.cleanup()
 def payload(self, annotation_pass="A", **extra):
  value={"source_id":"RIFLE_SRC_0001","annotation_pass":annotation_pass,"labeler_id":"TEST_LABELER","calibration_points":POINTS,"hole_boundary_points":HOLE_POINTS,"perspective_status":"circular","label_quality":"good","notes":"a,b\nquoted"}; value.update(extra); return value
 def rows(self):
  with self.path.open(newline="",encoding="utf-8") as f:return list(csv.DictReader(f))
 def test_append_a_b_integrity_and_server_fields(self):
  a=self.client.post("/api/annotations",json=self.payload(derived_score_tenths=109,image_sha256="0"*64,rule_set_id="forged")); self.assertEqual(a.status_code,201)
  before=self.rows()[0].copy(); b=self.client.post("/api/annotations",json=self.payload("B")); self.assertEqual(b.status_code,201)
  rows=self.rows(); self.assertEqual(len(rows),2); self.assertEqual(rows[0],before); self.assertNotEqual(rows[0]["annotation_id"],rows[1]["annotation_id"])
  self.assertEqual({r["annotation_pass"] for r in rows},{"A","B"}); self.assertEqual(rows[0]["review_status"],"unreviewed"); self.assertEqual(rows[0]["rule_set_id"],"saigon_sniper_air_rifle_10m_decimal_v1"); self.assertEqual(rows[0]["calibration_method"],"ring1_outer_8pt_v2"); self.assertEqual(rows[0]["calibration_reference_diameter_mm"],"45.5"); self.assertNotEqual(rows[0]["image_sha256"],"0"*64); self.assertEqual((rows[0]["image_width_px"],rows[0]["image_height_px"]),("3024","3024")); self.assertTrue(rows[0]["annotation_timestamp_utc"].endswith("+00:00")); self.assertEqual(json.loads(rows[0]["calibration_points"]),POINTS); self.assertEqual(json.loads(rows[0]["target_anchor_points"]),POINTS[:4]); self.assertEqual(json.loads(rows[0]["target_final_diagonal_points"]),POINTS[4:]); self.assertEqual(json.loads(rows[0]["hole_boundary_points"]),HOLE_POINTS); self.assertEqual(json.loads(rows[0]["hole_anchor_points"]),HOLE_POINTS[:4]); self.assertEqual(json.loads(rows[0]["hole_final_diagonal_points"]),HOLE_POINTS[4:]); self.assertEqual(len(json.loads(rows[0]["target_point_residuals_px"])),8); self.assertEqual(len(json.loads(rows[0]["hole_point_residuals_px"])),8); self.assertEqual(rows[0]["hole_center_method"],"assisted_ellipse_8pt_v1"); self.assertEqual(rows[0]["target_center_method"],"assisted_ellipse_8pt_v1"); self.assertAlmostEqual(float(rows[0]["hole_ellipse_center_x_px"]),100,places=3); self.assertTrue(rows[0]["hole_ellipse_rms_residual_px"]); self.assertNotIn("reference_score_tenths",rows[0]); self.assertEqual(rows[0]["notes"],"a,b\nquoted")
 def test_rejects_duplicate_and_bad_operator_input_without_leak(self):
  self.assertEqual(self.client.post("/api/annotations",json=self.payload()).status_code,201)
  duplicate=self.client.post("/api/annotations",json=self.payload()); self.assertEqual(duplicate.status_code,409); self.assertEqual(duplicate.json(),{"detail":{"status":"duplicate_annotation_pass"}})
  for change in ({"labeler_id":""},{"labeler_id":"x"*129},{"annotation_pass":"C"},{"hole_boundary_points":HOLE_POINTS[:7]},{"hole_boundary_points":[HOLE_POINTS[0]]*8},{"hole_boundary_points":[{"x_px":99999,"y_px":1}]*8},{"calibration_points":POINTS[:4]}): self.assertEqual(self.client.post("/api/annotations",json=self.payload(**change)).status_code,422)
 def test_unsupported_source_is_blocked(self): self.assertEqual(self.client.post("/api/annotations",json=self.payload(source_id="RIFLE_SRC_0003")).status_code,422)
 def test_server_refits_target_and_hole_and_ignores_forged_client_centers(self):
  request={"source_id":"RIFLE_SRC_0001","calibration_points":POINTS,"hole_boundary_points":HOLE_POINTS,"target_center":{"x_px":1,"y_px":1},"hole_center":{"x_px":1,"y_px":1}}
  response=self.client.post("/api/derive",json=request); self.assertEqual(response.status_code,200)
  result=response.json()["result"]; self.assertAlmostEqual(result["hole_center_x_px"],100,places=3); self.assertAlmostEqual(result["hole_center_y_px"],100,places=3); self.assertAlmostEqual(result["target_center_x_px"],100,places=3); self.assertAlmostEqual(result["target_center_y_px"],100,places=3)
 def test_printed_center_reference_is_not_an_input_to_score_derivation(self):
  request={"source_id":"RIFLE_SRC_0001","calibration_points":POINTS,"hole_boundary_points":HOLE_POINTS}
  baseline=self.client.post("/api/derive",json=request); self.assertEqual(baseline.status_code,200)
  with_reference=self.client.post("/api/derive",json={**request,"printed_center_reference":{"x_px":1,"y_px":1}}); self.assertEqual(with_reference.status_code,200)
  self.assertEqual(with_reference.json()["result"],baseline.json()["result"])
 def test_target_fit_returns_transient_stability_diagnostics(self):
  response=self.client.post("/api/calibration/fit",json={"points":POINTS})
  self.assertEqual(response.status_code,200); stability=response.json()["stability"]
  self.assertIn(stability["quality"],{"good","usable","unstable"}); self.assertEqual(len(stability["midpoints"]),4); self.assertEqual(len(stability["pairs"]),4)
  self.assertEqual({pair["first"]["clock_label"] for pair in stability["pairs"]},{"12h","1h30","3h","4h30"})
 def test_hole_fit_returns_the_same_opposite_pair_diagnostics(self):
  response=self.client.post("/api/hole-ellipse/fit",json={"points":HOLE_POINTS})
  self.assertEqual(response.status_code,200); stability=response.json()["stability"]
  self.assertEqual(len(stability["midpoints"]),4); self.assertEqual(len(stability["pairs"]),4)
 def test_historical_30_5_storage_is_not_silently_mixed(self):
  with self.path.open("w",newline="",encoding="utf-8") as file:
   writer=csv.DictWriter(file,fieldnames=FIELDNAMES); writer.writeheader(); writer.writerow({"calibration_method":"human_selected_points_then_ellipse_fit"})
  response=self.client.post("/api/annotations",json=self.payload())
  self.assertEqual(response.status_code,422); self.assertEqual(response.json()["detail"]["status"],"historical_calibration_storage_requires_new_pilot_file")
