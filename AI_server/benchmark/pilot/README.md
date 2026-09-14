# Pilot lặp lại Ground Truth — 20 ảnh

Pilot đo độ lặp lại của cùng một người chấm giữa Lượt A và Lượt B; đây **không** phải benchmark độ chính xác AI, không tạo consensus và không phải điểm thi đấu chính thức.

## Tập ảnh và thứ tự

Manifest `repeatability_pilot_20.csv` chọn đúng 20 JPG từ 550 JPG: sắp xếp theo `source_id`, chia thành 20 strata chỉ theo chỉ số nguồn, rồi lấy điểm giữa mỗi strata. Không dùng AI, điểm, vị trí lỗ hay đánh giá độ khó. Lượt A theo `pass_a_order` 1–20. Lượt B là cùng tập ảnh theo `pass_b_order`, hoán vị quyết định với seed `20260914` (thứ tự pilot index: 8, 10, 7, 6, 2, 3, 17, 20, 13, 4, 9, 5, 11, 19, 16, 18, 1, 12, 15, 14).

Dùng cùng `labeler_id` cho hai lượt (ví dụ `LABELER_0001`). Hoàn tất toàn bộ Lượt A trước khi bắt đầu Lượt B; nên nghỉ ngắn giữa hai phiên. Lượt B bắt đầu từ ảnh gốc, không xem điểm, tâm bia, tâm lỗ, điểm hiệu chuẩn hay ghi chú của Lượt A.

## Cách chấm

Mỗi ảnh: Mở ảnh → chọn 5–8 điểm phân bố quanh mép ngoài vùng đen / vòng 4 (đường kính chuẩn 30,5 mm; ưu tiên 6–8 nếu thấy rõ) → Khớp elip → kiểm tra overlay → Xác nhận hiệu chuẩn → phóng lớn → chọn tâm hình học nhìn thấy của lỗ đạn, không chọn mép → Tính điểm tạm tính → chọn phối cảnh/chất lượng → ghi chú nếu cần → Lưu lượt chấm.

Không chỉnh theo điểm “đáng lẽ phải có”, không dùng gợi ý AI. Lỗ rách/khó xác định: chọn `ambiguous` hoặc `poor` và ghi chú.

- `circular`: gần tròn / ít méo phối cảnh; `elliptical_moderate`: elip vừa, chấp nhận được; `extreme_needs_review`: méo mạnh, cần xem lại; `excluded`: loại.
- `good`, `usable`, `ambiguous`, `poor` lần lượt là tốt, có thể sử dụng, không rõ, kém. Lưu ban đầu luôn là `unreviewed`.

## Lưu và sao lưu

Pilot thật sẽ ghi lazily vào `AI_server/benchmark/annotations/ground_truth_annotations.csv`; file chưa được tạo trong giai đoạn chuẩn bị này. Sau mỗi phiên/checkpoint, sao chép file ra ngoài vị trí hoạt động với tên không trùng, ví dụ `ground_truth_annotations_backup_YYYYMMDD_HHMMSS.csv`; không ghi đè backup cũ.

## Phân tích sau pilot (chưa thực hiện)

So sánh A/B từng ảnh: lệch tâm bia px, lệch tâm lỗ px, chênh khoảng cách mm và chênh điểm tenths. Tổng hợp median/p95 cho ba đại lượng đầu; tỷ lệ trùng điểm chính xác, trong ±0,1 và ±0,2. Mục tiêu quy trình cần review (không phải chuẩn chính thức): median/p95 tâm bia ≤2/5 px, tâm lỗ ≤3/8 px, trùng điểm ≥85%, trong ±0,1 ≥95%; chênh quá ±0,2 bắt buộc review. Chỉ consensus sau khi phân tích/review.
