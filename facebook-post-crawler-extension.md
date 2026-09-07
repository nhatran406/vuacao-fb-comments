# Facebook Post & Comments Crawler Extension

## Goal
Xây dựng Chrome Extension (Manifest V3) cho phép cào toàn bộ nội dung bài post Facebook (tác giả, thời gian, nội dung, media, tương tác) và toàn bộ các bình luận / phản hồi (kể cả lồng nhau), tự động mở rộng ("Xem thêm", "Tất cả bình luận"), hiển thị tiến trình trực tiếp và xuất dữ liệu sang JSON / CSV (hỗ trợ tiếng Việt UTF-8).

## Tasks
- [x] Task 1: Khởi tạo cấu trúc Manifest V3, icon, permissions và metadata extension → Verify: File `manifest.json` hợp lệ cho MV3.
- [x] Task 2: Xây dựng core Facebook DOM Extractor & Automation Engine (xử lý chọn "Tất cả bình luận", auto click "Xem thêm", giải mã cấu trúc bài viết và comment lồng nhau đa ngôn ngữ VN/EN) → Verify: Các hàm bóc tách text, author, timestamp, media và đệ quy comment hoạt động chính xác.
- [x] Task 3: Phát triển In-page Floating HUD Controller (widget nổi trực tiếp trên trang Facebook để điều khiển cào dữ liệu, tạm dừng, dừng, đếm live không bị tắt khi click ra ngoài) → Verify: Widget hiển thị trực quan trên giao diện Facebook.
- [x] Task 4: Phát triển giao diện Extension Popup (hỗ trợ nhập link trực tiếp để tự mở tab Facebook hoặc cào ngay trên tab hiện tại, cấu hình tốc độ/giới hạn, xem trước dữ liệu bảng) → Verify: Mở popup hiển thị đầy đủ options và preview.
- [x] Task 5: Xây dựng Module Export Data (JSON định dạng chuẩn, CSV có UTF-8 BOM chuẩn tiếng Việt cho Excel) → Verify: Tải file JSON và CSV kiểm tra định dạng và dữ liệu.
- [x] Task 6: Tích hợp Background Service Worker & kiểm thử toàn bộ luồng cào bài viết → Verify: Cài đặt unpacked extension vào Chrome/Chromium và kiểm tra hoạt động trơn tru không lỗi.

## Done When
- [x] Cài đặt được extension vào Chrome/Edge qua `chrome://extensions` mà không báo lỗi.
- [x] Cào được nội dung bài post (tác giả, thời gian, text, link ảnh/video, số reaction).
- [x] Tự động chuyển bộ lọc sang "Tất cả bình luận", tự động click "Xem thêm bình luận" và "Xem phản hồi".
- [x] Cào được toàn bộ comments/sub-comments với đầy đủ tên người cmt, avatar, text, media, thời gian.
- [x] Xuất được dữ liệu ra JSON và CSV chuẩn UTF-8 không lỗi font tiếng Việt.
