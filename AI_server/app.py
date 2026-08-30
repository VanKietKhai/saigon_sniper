import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import uvicorn
import math
from pathlib import Path
from ultralytics import YOLO
from scoring import TARGET_SPECS, normalize_target_type, score_issf_decimal_tenths

app = FastAPI()
@app.get("/ping")
async def ping():
    return {"status": "cham_diem_ai"}

# Tải mô hình AI bạn vừa huấn luyện (Load 1 lần khi khởi động)
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "best.pt"
model = YOLO(str(MODEL_PATH))

def _process_target_yolo(contents):
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Đưa ảnh cho YOLO phân tích
    results = model(img)
    
    bullseye_box = None
    holes = []
    
    # Trích xuất kết quả nhận diện
    for box in results[0].boxes:
        cls_id = int(box.cls[0])
        cls_name = model.names[cls_id].lower()
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        
        if 'bull' in cls_name: # Nhận diện hồng tâm (bull_eye)
            bullseye_box = (x1, y1, x2, y2)
        elif 'hole' in cls_name: # Nhận diện lỗ đạn (hole)
            holes.append((x1, y1, x2, y2, float(box.conf[0])))
            
    return img, bullseye_box, holes

@app.post("/check-align")
async def check_align(file: UploadFile = File(...)):
    contents = await file.read()
    _, bullseye_box, _ = _process_target_yolo(contents)
    return {"aligned": bullseye_box is not None}

@app.post("/analyze-target")
async def analyze_target(
    file: UploadFile = File(...), 
    shots_per_target: int = Form(5),
    target_type: str = Form("air_rifle_10m")
):
    contents = await file.read()
    img, bullseye, holes = _process_target_yolo(contents)
    
    try:
        normalized_target_type = normalize_target_type(target_type)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    score_tenths = []
    if bullseye is not None:
        # Tính tâm và bán kính pixel của hồng tâm
        bx1, by1, bx2, by2 = bullseye
        center_x = (bx1 + bx2) / 2
        center_y = (by1 + by2) / 2
        bullseye_radius_px = max(bx2 - bx1, by2 - by1) / 2
        
        black_radius_mm = TARGET_SPECS[normalized_target_type]["black_radius_mm"]
            
        mm_per_pixel = black_radius_mm / bullseye_radius_px
        
        # When there are extra detections, retain the most confident ones.
        if len(holes) > shots_per_target:
            holes.sort(key=lambda hole: hole[4], reverse=True)
            holes = holes[:shots_per_target]

        # Score each detected hole using deterministic decimal-zone boundaries.
        for hx1, hy1, hx2, hy2, _ in holes:
            hole_cx = (hx1 + hx2) / 2
            hole_cy = (hy1 + hy2) / 2
            
            distance_px = math.hypot(hole_cx - center_x, hole_cy - center_y)
            distance_mm = distance_px * mm_per_pixel
            score_tenths.append(
                score_issf_decimal_tenths(distance_mm, normalized_target_type)
            )

    scores = [tenths / 10 for tenths in score_tenths]

    return {
        "status": "success",
        "hole_count": len(scores),
        "scores": scores,
        "total_score": sum(score_tenths) / 10,
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
