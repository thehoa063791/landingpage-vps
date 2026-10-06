# Rà soát Dòng Tiền — 06/10/2026

## Đã xóa 7 file không còn sử dụng

- `public/utm-tracker.js`, `src/components/common/UTMTracker.tsx`: thay bằng tracking chung của project.
- `src/pages/api/academic-survey/lesson-text.ts`: không có client gọi; thư mục document mà API đọc không tồn tại.
- `src/components/learning/LessonContent.tsx`, `ProgressBar.tsx`: không được import từ trang/component nào.
- `src/features/dong-tien/components/Hero.tsx`: `/v1` dùng Hero2; `/` và `/v2` có giao diện riêng.
- `src/lib/utils.ts`: không có nơi gọi. Bỏ dependency trực tiếp `clsx`, `tailwind-merge`, `lenis`.

## Tài nguyên cần kiểm tra trước khi xóa

[unused-assets.json](unused-assets.json) liệt kê 53 tài nguyên không được mã Dòng Tiền tham chiếu. Đã đối chiếu toàn bộ TS/TSX/CSS, giữ lại thumbnail có đường dẫn sinh động. Chưa tự xóa ảnh gốc vì chúng có thể nằm trong nội dung nhập từ admin hoặc URL được chia sẻ ngoài mã nguồn. Cần kiểm tra các nội dung/URL đó trước khi xóa.

## File cần giữ

- `/v1`, `/v2`, `/learn`, `/learn/[sessionId]`: route đang hoạt động.
- `course-catalog.json`, `vimeo-catalog.json`: dữ liệu nguồn phục vụ nhập Vimeo, không phải database chạy hiện tại.
- Dockerfile, Compose, PM2 và cấu hình Next/Tailwind/TypeScript: dùng build/triển khai.
- `public/fonts` cùng giấy phép OFL; thumbnail trong `public/images/dong-tien/thumb` đang được Story dùng qua đường dẫn động.
- `.env.local`: kết nối admin nội bộ khi chạy local.

## Cache có thể dọn

Sau khi dừng dev server, `.next`, `tsconfig.tsbuildinfo` được tạo lại khi build. `.npm-cache` là cache npm trong workspace. `node_modules` có thể tạo lại bằng `npm ci`, cần cài lại trước khi chạy. Không xóa `storage/dong-tien-thumbnails`, database hoặc dữ liệu chương/tiến độ học.

## Cấu hình tracking chung

Mọi trang Dòng Tiền tải trực tiếp `public/js/funnel-tracker.js` và `public/js/meta-pixel.js` từ project gốc qua proxy cùng origin. Không có bản sao runtime trong child. `src/trackingConfig.js` ở root cung cấp cấu hình public; child chỉ cần `ADMIN_API_URL`, `LEAD_API_KEY`, `NEXT_TELEMETRY_DISABLED`.

- `META_DATASET_ID`/`FB_PIXEL_ID`, `META_BROWSER_PIXEL_ENABLED`: chỉ điều khiển Pixel trình duyệt. Chưa cập nhật/bật CAPI cho Dòng Tiền; CAPI hiện hữu của các funnel khác giữ nguyên.
- `GTM_CONTAINER_ID`: container chung. Khi chưa khai báo dùng container hiện có của project `GTM-KBK3JQ3`. Đặt rỗng để không dùng GTM.
- `GOOGLE_TAG_ENABLED=false`: tắt Google Tag.
- `GA_MEASUREMENT_ID`: dùng gtag trực tiếp khi `GTM_CONTAINER_ID` rỗng; khi dùng GTM, quản lý GA bên trong container để tránh đếm đôi.

Page view theo route phát một lần; đổi query mở popup không tạo page view. GTM nhận `virtual_page_view` cho chuyển trang SPA và `generate_lead` khi đăng ký mới thành công, có `event_id`, `page_id`, UTM. Container cần trigger tương ứng và tránh phát thêm Pixel event mà runtime đã quản lý.

Đăng ký, đăng nhập, tiến độ, khảo sát dùng cùng `registration_id` trong CRM/database root. Chỉ đăng ký mới có CompleteRegistration qua browser Pixel, dùng ID bản ghi để tránh phát lại. API Dòng Tiền không gửi CAPI hoặc webhook. Sự kiện page/form/CTA/scroll/thời gian/xem bài vào bảng events với `page_id=dong-tien`. Tiến độ học và câu trả lời khảo sát chi tiết tiếp tục lưu nội bộ.

Pixel dùng đủ mốc thời gian 10/30/60/90/120/180/300 giây và cuộn 25/50/75/100%, đặt lại khi đổi route. Các mốc này chỉ gửi browser Pixel. Session, UTM/click ID và cookie theo quy tắc của `FACEBOOK_CAPI_TRACKING_WEBHOOK.md`, tương thích `core.js`.

Vimeo giữ `dnt=1`. Tracking quảng cáo được bật theo xác nhận mới của người dùng; không khôi phục backend/database/webhook cũ. Docker không còn các biến cấu hình backend/Pixel cũ.

## Kiểm tra

TypeScript; tests learning/admin/Vimeo; browser với tracking bật/tắt, đăng ký/đăng nhập, UTM, ID chuyển đổi, chuyển trang SPA, cập nhật chương và link bài học cũ. Tests dùng CRM giả lập, không tạo lead thật hoặc gửi dữ liệu quảng cáo thật.
