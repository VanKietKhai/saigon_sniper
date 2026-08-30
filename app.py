import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form
import uvicorn
import math
from ultralytics import YOLO

app = FastAPI()
@app.get("/ping")
async def ping():
    return {"status": "cham_diem_ai"}

# Tải mô hình AI bạn vừa huấn luyện (Load 1 lần khi khởi động)
model = YOLO('best.pt')

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
            holes.append((x1, y1, x2, y2))
            
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
    target_type: str = Form("bia_nho") 
):
    contents = await file.read()
    img, bullseye, holes = _process_target_yolo(contents)
    
    scores = []
    if bullseye is not None:
        # Tính tâm và bán kính pixel của hồng tâm
        bx1, by1, bx2, by2 = bullseye
        center_x = (bx1 + bx2) / 2
        center_y = (by1 + by2) / 2
        bullseye_radius_px = max(bx2 - bx1, by2 - by1) / 2
        
        # Lấy thông số chuẩn theo loại bia
        if target_type == "bia_nho":
            black_radius_mm = 15.25
            ring_gap_mm = 2.5 
        else:
            black_radius_mm = 29.75
            ring_gap_mm = 8.0 
            
        mm_per_pixel = black_radius_mm / bullseye_radius_px
        
        # Chấm điểm từng lỗ đạn bằng thuật toán ISSF
        for hx1, hy1, hx2, hy2 in holes:
            hole_cx = (hx1 + hx2) / 2
            hole_cy = (hy1 + hy2) / 2
            
            # 1. Tính khoảng cách d (mm) từ TÂM viên đạn đến TÂM bia
            distance_px = math.hypot(hole_cx - center_x, hole_cy - center_y)
            d = distance_px * mm_per_pixel
            
            # 2. Áp dụng công thức nội suy chuẩn ISSF
            if target_type == "bia_nho":
                # Khoảng cách giữa các vòng là 2.5mm
                raw_score = 11.0 - (d / 2.5)
            else:
                # Bia súng ngắn (khoảng cách vòng là 8.0mm)
                raw_score = 11.0 - (d / 8.0)
            
            # 3. Chốt điểm (tối đa 10.9, tối thiểu 0) và làm tròn 1 chữ số thập phân
            score = round(min(10.9, max(0.0, raw_score)), 1)
            scores.append(score)
            
    scores.sort(reverse=True)
    if len(scores) > shots_per_target:
        scores = scores[:shots_per_target]

    return {
        "status": "success",
        "hole_count": len(scores),
        "scores": scores,
        "total_score": round(sum(scores), 1)
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)