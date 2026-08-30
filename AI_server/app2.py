import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form
import uvicorn
import math
from pathlib import Path
from ultralytics import YOLO

app = FastAPI()
@app.get("/ping")
async def ping():
    return {"status": "cham_diem_ai"}

# Tải mô hình AI bạn vừa huấn luyện (Load 1 lần khi khởi động)
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "best.pt"
model = YOLO(str(MODEL_PATH))

# =====================================================================
# THÊM MỚI 1: HÀM NẮN PHẲNG ẢNH (BIRD'S EYE VIEW) ĐỂ TRỊ GÓC CHỤP XÉO
# =====================================================================
def order_points(pts):
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect

def warp_target_image(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 50, 150)

    contours, _ = cv2.findContours(edged.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return image 

    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
    paper_contour = None

    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4:
            paper_contour = approx
            break

    if paper_contour is None:
        return image 

    pts = paper_contour.reshape(4, 2)
    rect = order_points(pts)
    (tl, tr, br, bl) = rect

    widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    maxWidth = max(int(widthA), int(widthB))

    heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    maxHeight = max(int(heightA), int(heightB))

    max_side = max(maxWidth, maxHeight)
    
    dst = np.array([
        [0, 0],
        [max_side - 1, 0],
        [max_side - 1, max_side - 1],
        [0, max_side - 1]], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (max_side, max_side))
    
    return warped

# =====================================================================
# CẬP NHẬT: TÍCH HỢP NẮN ẢNH VÀO LUỒNG XỬ LÝ YOLO
# =====================================================================
def _process_target_yolo(contents):
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # KÉO PHẲNG ẢNH TRƯỚC KHI YÓLO NHÌN THẤY
    img = warp_target_image(img)
    
    results = model(img)
    
    bullseye_box = None
    raw_holes = []
    
    # 1. Thu thập dữ liệu từ YOLO
    for box in results[0].boxes:
        cls_id = int(box.cls[0])
        cls_name = model.names[cls_id].lower()
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        
        if 'bull' in cls_name:
            bullseye_box = (int(x1), int(y1), int(x2), int(y2))
        elif 'hole' in cls_name:
            raw_holes.append((int(x1), int(y1), int(x2), int(y2), float(box.conf[0])))
            
    refined_holes = []
    center_x, center_y = 0, 0
    bullseye_radius_px = 1
    
    if bullseye_box:
        bx1, by1, bx2, by2 = bullseye_box
        
        # BƯỚC ĐỘT PHÁ 1: Tìm tâm hình học chuẩn xác của Hồng Tâm
        bull_roi = img[by1:by2, bx1:bx2]
        gray_bull = cv2.cvtColor(bull_roi, cv2.COLOR_BGR2GRAY)
        _, thresh_bull = cv2.threshold(gray_bull, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        contours_bull, _ = cv2.findContours(thresh_bull, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if contours_bull:
            c_bull = max(contours_bull, key=cv2.contourArea)
            (cx, cy), radius = cv2.minEnclosingCircle(c_bull)
            center_x = bx1 + cx
            center_y = by1 + cy
            bullseye_radius_px = radius
        else:
            center_x = (bx1 + bx2) / 2
            center_y = (by1 + by2) / 2
            bullseye_radius_px = max(bx2 - bx1, by2 - by1) / 2

        # BƯỚC ĐỘT PHÁ 2: Tìm Trọng tâm (Centroid) của từng lỗ đạn
        for hx1, hy1, hx2, hy2, confidence in raw_holes:
            hole_roi = img[hy1:hy2, hx1:hx2]
            if hole_roi.size == 0: continue 
            
            gray_hole = cv2.cvtColor(hole_roi, cv2.COLOR_BGR2GRAY)
            _, thresh_hole = cv2.threshold(gray_hole, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            contours_hole, _ = cv2.findContours(thresh_hole, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if contours_hole:
                c_hole = max(contours_hole, key=cv2.contourArea)
                M = cv2.moments(c_hole)
                if M["m00"] != 0:
                    hole_cx = hx1 + int(M["m10"] / M["m00"])
                    hole_cy = hy1 + int(M["m01"] / M["m00"])
                    refined_holes.append((hole_cx, hole_cy, confidence))
                else:
                    refined_holes.append(((hx1 + hx2) / 2, (hy1 + hy2) / 2, confidence))
            else:
                refined_holes.append(((hx1 + hx2) / 2, (hy1 + hy2) / 2, confidence))

    bullseye_data = None
    if bullseye_box is not None:
        bullseye_data = (center_x, center_y, bullseye_radius_px)

    return img, bullseye_data, refined_holes

@app.post("/check-align")
async def check_align(file: UploadFile = File(...)):
    contents = await file.read()
    _, bullseye_box, _ = _process_target_yolo(contents)
    return {"aligned": bullseye_box is not None}

# =====================================================================
# CẬP NHẬT 2: API CHẤM ĐIỂM CHẴN (INTEGER) CHO BUỔI DEMO
# =====================================================================
@app.post("/analyze-target")
async def analyze_target(
    file: UploadFile = File(...), 
    shots_per_target: int = Form(5),
    target_type: str = Form("bia_nho") 
):
    contents = await file.read()
    img, bullseye_data, holes = _process_target_yolo(contents)
    
    scores = []
    if bullseye_data is not None and bullseye_data[2] > 0:
        center_x, center_y, bullseye_radius_px = bullseye_data
        
        if target_type == "bia_nho":
            black_radius_mm = 15.25
            ring_gap_mm = 2.5 
        else:
            black_radius_mm = 29.75
            ring_gap_mm = 8.0 
            
        mm_per_pixel = black_radius_mm / bullseye_radius_px

        if len(holes) > shots_per_target:
            holes.sort(key=lambda hole: hole[2], reverse=True)
            holes = holes[:shots_per_target]
        
        for hole_cx, hole_cy, _ in holes:
            distance_px = math.hypot(hole_cx - center_x, hole_cy - center_y)
            d = distance_px * mm_per_pixel
            
            if target_type == "bia_nho":
                raw_score = 11.0 - (d / 2.5)
            else:
                raw_score = 11.0 - (d / 8.0)
            
            # CHỐT ĐIỂM SỐ NGUYÊN (Ví dụ: 10.8 -> 10, 9.2 -> 9)
            score = int(max(0, min(10, math.floor(raw_score))))
            scores.append(score)
            
    return {
        "status": "success",
        "hole_count": len(scores),
        "scores": scores,
        # ÉP TỔNG ĐIỂM VỀ SỐ NGUYÊN (Ví dụ: 30.0 -> 30)
        "total_score": int(sum(scores))
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
