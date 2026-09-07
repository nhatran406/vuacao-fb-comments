# Facebook Post & Comments Scraper Extension 🚀

Tiện ích mở rộng Chrome (Manifest V3) chuyên dụng để tự động cào toàn bộ nội dung bài viết và bình luận (kể cả các phản hồi/sub-comments lồng nhau) từ đường dẫn Facebook bất kỳ. Hỗ trợ xuất dữ liệu ra file Excel CSV (chuẩn UTF-8 không lỗi font tiếng Việt) và JSON.

---

## 🌟 Tính Năng Nổi Bật

1. **Trang Quản Lý Nhiều Bài Viết Đồng Thời (Multi-Job Dashboard)**:
   - Dán 1 hoặc hàng loạt link bài viết (mỗi dòng 1 link) để tạo các job cào chạy song song trong nền.
   - Bảng thống kê theo dõi tiến độ thời gian thực (Live Progress): Tác giả, số bình luận cha, số phản hồi con, trạng thái.
   - Hỗ trợ xuất file riêng từng job hoặc **Xuất Tất Cả Gộp (Merged CSV)** vào 1 file Excel duy nhất.
   - Nút thao tác nhanh: Xem tab, Dừng, Cào lại, Xóa job.
2. **Tự động chuyển bộ lọc sang "Tất cả bình luận" (All Comments)**:
   - Facebook thường mặc định chỉ hiển thị "Bình luận phù hợp nhất" (Most relevant). Tiện ích tự động nhận diện và chọn chuẩn xác "Tất cả bình luận" (loại trừ mục "Mới nhất").
3. **Tự động mở rộng bình luận & phản hồi đa cấp (Nested Sub-comments)**:
   - Thuật toán nhận diện đa cơ chế (phân cấp DOM + aria-labels + độ thụt lề pixel `rect.left > parentLeft + 15px`).
   - Tự động click các nút: `"Xem thêm bình luận"`, `"Xem các bình luận trước"`, `"Xem thêm X phản hồi"`, `"X phản hồi khác"`.
   - Tự động click `"Xem thêm"` trên các bình luận dài để lấy đầy đủ văn bản.
4. **Widget nổi trực tiếp trên trang (In-Page Floating HUD)**:
   - Bảng điều khiển kéo thả ngay trên bài viết Facebook đang xem.
   - Theo dõi số lượng bình luận và phản hồi tăng theo thời gian thực (Live Count).
5. **Xuất dữ liệu chuẩn Excel UTF-8 BOM**:
   - File CSV luôn có tiền tố BOM `\uFEFF`, mở trực tiếp trên Microsoft Excel và Google Sheets hoàn toàn không bị lỗi font tiếng Việt.
   - Phân cấp rõ ràng: `COMMENT` (Level 1) và `REPLY` (Level 2), có `Parent_ID`, `Parent_Author`, `Post_URL`.

---

## 📂 Cấu Trúc Thư Mục

```
fb-extension/
├── manifest.json                  # Manifest V3 cấu hình Extension
├── background.js                  # Service worker điều phối mở tab & crawl URL
├── icons/                         # Bộ icon 16px, 48px, 128px
├── content/
│   ├── dom-selectors.js           # Bóc tách DOM Facebook, nhận diện tiếng Việt & tiếng Anh
│   ├── crawler-engine.js          # Bộ máy điều khiển tự động mở rộng, cuộn trang & chống trùng lặp
│   ├── hud-widget.js              # Widget điều khiển nổi trên trang Facebook
│   ├── hud-widget.css             # Giao diện Widget nổi hiện đại
│   └── content.js                 # Content script kết nối các thành phần
├── popup/
│   ├── popup.html                 # Giao diện Popup mở từ thanh tiện ích
│   ├── popup.css                  # Giao diện đẹp, hiện đại
│   └── popup.js                   # Xử lý sự kiện trên Popup
├── utils/
│   └── exporter.js                # Module xuất file JSON, CSV UTF-8 BOM, Clipboard
└── README.md                      # Hướng dẫn sử dụng
```

---

## 🛠 Hướng Dẫn Cài Đặt Vào Chrome / Cốc Cốc / Edge / Brave

1. Mở trình duyệt Chrome (hoặc bất kỳ trình duyệt Chromium nào).
2. Truy cập vào địa chỉ: `chrome://extensions/`
3. Bật công tắc **"Chế độ dành cho nhà phát triển" (Developer mode)** ở góc trên bên phải màn hình.
4. Bấm vào nút **"Tải tiện ích đã giải nén" (Load unpacked)** ở góc trên bên trái.
5. Chọn thư mục dự án:
   ```
   /Users/nhatd/workspaces/projects/fb-extension
   ```
6. Tiện ích **"FB Post & Comments Scraper"** sẽ xuất hiện ngay trên thanh công cụ duyệt web. Ghim (Pin) tiện ích lên thanh trình duyệt để thao tác nhanh.

---

## 📖 Hướng Dẫn Sử Dụng Chi Tiết

### Cách 1: Sử dụng Bảng Quản Lý Nhiều Bài Viết (Dashboard - Khuyên dùng) 🌟
1. Bấm vào icon tiện ích trên thanh trình duyệt -> Nhấn nút **"Mở Dashboard ↗"** (hoặc click chuột phải vào icon tiện ích -> chọn **Tùy chọn tiện ích (Options)**).
2. Dán 1 hoặc danh sách nhiều link bài viết Facebook vào ô nhập liệu lớn (mỗi link 1 dòng).
3. Tùy chỉnh các tùy chọn (Tự chọn tất cả bình luận, mở sub-comments, tốc độ cào).
4. Bấm nút **"🚀 Tạo Jobs & Bắt Đầu Cào Ngay"**.
5. Tiện ích sẽ tự động mở từng bài viết trong các tab ngầm ở chế độ nền và cào song song:
   - Bạn có thể làm việc khác bình thường trong khi các job đang chạy.
   - Bảng hiển thị số bình luận cha, phản hồi con và trạng thái theo thời gian thực.
6. Sau khi hoàn tất:
   - Bấm **"📊 CSV"** hoặc **"📄 JSON"** trên từng dòng để tải dữ liệu của riêng bài đó.
   - Bấm **"📊 Xuất Tất Cả Gộp (CSV)"** ở góc trên để gộp toàn bộ bình luận của tất cả các bài viết vào một file Excel duy nhất.

### Cách 2: Cào trực tiếp từ Popup Extension
1. Bấm vào icon của tiện ích trên thanh công cụ trình duyệt.
2. Dán đường link bài viết Facebook của bạn vào ô:
   ```
   https://www.facebook.com/.../posts/...
   ```
3. Bấm nút **"Mở & Cào"**.
4. Tiện ích sẽ mở bài viết trong tab mới, tự động kết nối và bắt đầu cào bài viết cùng các bình luận.
5. Khi hoàn tất (hoặc khi bạn bấm Dừng), bấm **"Xuất CSV"** hoặc **"Xuất JSON"** để tải file về máy.

### Cách 3: Cào trên tab Facebook đang mở sẵn
1. Mở bất kỳ bài viết Facebook nào trên trình duyệt.
2. Bạn sẽ thấy một nút tròn nổi **"FB Scraper"** ở góc phải màn hình, hoặc bấm icon tiện ích trên thanh công cụ.
3. Bấm **"▶ Bắt Đầu Cào"**.
4. Extension sẽ tự động:
   - Chuyển bộ lọc sang "Tất cả bình luận".
   - Liên tục mở rộng các bình luận ẩn và phản hồi.
   - Thống kê trực tiếp số lượng bình luận đã lấy được.
5. Nhấn **"Xuất CSV"** hoặc **"Xuất JSON"** để tải kết quả.

---

## ⚙️ Tùy Chỉnh Nâng Cao
Trong phần **Cấu hình & Tùy chọn nâng cao**:
- **Tự chọn "Tất cả bình luận"**: Bật/tắt tự động đổi bộ lọc bình luận.
- **Tự mở rộng phản hồi (sub-comments)**: Cho phép quét sâu vào các tầng trả lời bên trong mỗi comment.
- **Giới hạn số bình luận**: Đặt số lượng tối đa muốn lấy (ví dụ 100, 500, hoặc để 0 để cào hết sạch).
- **Độ trễ mỗi lần click**: Có 3 mức *Nhanh (800ms)*, *Chuẩn (1200ms)*, *An toàn (2000ms)* để phù hợp với tốc độ mạng và hạn chế bị Facebook tạm ngắt kết nối.
