# API đối tác: kế hoạch

Đối tác đầu tiên là một giải pháp AI chăm sóc khách hàng qua tin nhắn (Messenger, Zalo...). Bot cần biết người đang nhắn là ai và học đến đâu. Sau này có thể cần thêm dữ liệu khác.

## Nguyên tắc thiết kế

- **Đối tượng trung tâm là `contact`**, tức một người thật. Các lead cùng email hoặc SĐT ở nhiều phễu được gộp thành một contact.
- **Dữ liệu chia theo "mảng" (facet)**, mỗi mảng có quyền riêng. Hiện chỉ có `learning`. Các mảng sau như `zoom`, `orders`, `tags`, `surveys` chỉ cần thêm một file trong `src/partner/facets/` và một scope. Endpoint không đổi.
- **v1 chỉ thêm trường, không đổi hay xóa trường cũ.** Đối tác bỏ qua những trường lạ. Thay đổi phá vỡ tương thích thì làm `/v2`.
- **Khóa API riêng cho từng đối tác.** Chỉ lưu bản băm. Quyền tính theo mảng và theo khóa học. Có rate limit và nhật ký truy cập. Không dùng `LEAD_API_KEY`.
- **Chỉ trả dữ liệu cần thiết.** SĐT chỉ trả khi khóa có scope `contact:phone`. Không trả khảo sát, IP, UTM. Email chỉ được gửi trong body (POST), không đặt trên URL.

## Giai đoạn 1: bot tra cứu tiến trình (đã làm)

- `src/learningProgress.js`: một cách tính tiến độ duy nhất, dùng chung cho admin, trang học, mốc Meta và API.
- Migration `010_partner_api.sql`: `api_clients`, `api_access_log`, index `learning_progress(updated_at)`.
- `/api/partner/v1`:
  - `GET /capabilities`
  - `POST /contacts/lookup` (email/SĐT)
  - `GET /contacts/:contact_id`
  - `GET /changes`
- Mảng `learning`:
  - trạng thái, số bài đã hoàn thành, % theo bài và theo thời lượng;
  - bài đang học, bài nên học tiếp, lần học gần nhất, số ngày chưa học;
  - link học tiếp.
- Script `scripts/partner-key.cjs` để tạo, liệt kê và thu hồi khóa.
- Tài liệu cho đối tác: `docs/PARTNER_API.md`.
- Test: `scripts/test-partner-api.cjs`.

## Giai đoạn 2: bot chủ động chăm sóc

- **Hàng đợi `partner_event_outbox`** và bộ gửi webhook:
  - ký HMAC-SHA256 kèm timestamp;
  - có `event_id` để lọc trùng;
  - gửi lại theo thời gian giãn dần;
  - có `/events/replay`.
- **Sự kiện:**
  - `learning.started`;
  - `learning.milestone`: 25, 50 hoặc 75% khóa;
  - `learning.lesson_completed`;
  - `learning.course_completed`;
  - `learning.inactive`: N ngày không học, chạy theo lịch, mỗi đợt im lặng chỉ báo một lần.
- **Bảng `contact_identities`** và `POST /contacts/:id/identities`: gắn PSID Messenger hoặc ID Zalo. Sau đó `lookup` tra được bằng ID chat.
- **Cần từ đối tác:** URL webhook, cách họ kiểm tra chữ ký, định dạng ID chat.

## Giai đoạn 3: mở rộng dữ liệu và quản lý trong admin

- **Mảng mới:**
  - `zoom`: đăng ký, link, đã bấm vào học;
  - `orders`: đơn hàng đã thanh toán;
  - `tags`: tag CRM, gồm cả tag lớp Zoom;
  - `surveys`: chỉ bật khi được đồng ý.
- **Tab "Đối tác API" trong admin:**
  - quản lý khóa, quyền theo mảng và khóa học;
  - cấu hình webhook và loại sự kiện;
  - số ngày cho sự kiện `inactive`.
- **Màn hình giám sát:** lượt gọi, lỗi, webhook gửi thành công hay thất bại, gửi lại thủ công, nhật ký truy cập.
- **Tùy chọn:** gắn tag tiến độ sang HubCRM.

## Pháp lý

Chuyển dữ liệu cá nhân cho bên xử lý thứ ba thuộc Nghị định 13/2023/NĐ-CP. Nên:

- thêm thông báo ở form đăng ký và chính sách bảo mật;
- có thỏa thuận xử lý dữ liệu với đối tác.
