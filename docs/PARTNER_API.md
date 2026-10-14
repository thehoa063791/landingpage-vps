# API đối tác v1

API chỉ đọc, dùng giữa hai máy chủ (server to server). Đối tác dùng nó để lấy thông tin khách hàng và tiến trình học của khách ở các khóa video (Dòng Tiền, Trading...).

- Base URL: `https://event.phamthanhbien.com/api/partner/v1`
- Dữ liệu: JSON UTF-8. Thời gian theo ISO 8601 UTC, ví dụ `2026-10-14T03:15:00.000Z`.

## Xác thực

Mọi request cần header:

```
Authorization: Bearer ptb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- Khóa chỉ dùng ở máy chủ của đối tác. Không đặt khóa trong ứng dụng hay trình duyệt.
- Mỗi khóa có:
  - **scopes**: loại dữ liệu được đọc;
  - **khóa học** được xem;
  - **giới hạn số lượt gọi mỗi phút**.
- `GET /capabilities` cho biết khóa đang dùng có những quyền gì.

| Scope | Cho phép |
|---|---|
| `contact:basic` | `contact_id`, tên, email, các phễu đã đăng ký. Bắt buộc cho mọi endpoint contact |
| `contact:phone` | Thêm số điện thoại trong `identities.phones` |
| `learning:read` | Mảng `learning`: tiến trình học |

## Khung phản hồi

Thành công:

```json
{ "data": { ... }, "meta": { "api_version": "1.0", "request_id": "…", "generated_at": "…" } }
```

Lỗi:

```json
{ "error": { "code": "contact_not_found", "message": "Không tìm thấy khách hàng." }, "meta": { ... } }
```

| HTTP | `error.code` | Ý nghĩa |
|---|---|---|
| 400 | `invalid_request`, `invalid_include`, `invalid_cursor`, `invalid_json` | Tham số sai. `error.details` cho biết trường nào sai |
| 401 | `unauthorized`, `invalid_api_key` | Thiếu khóa, khóa sai hoặc khóa đã bị thu hồi |
| 403 | `scope_denied`, `ip_not_allowed` | Khóa chưa được cấp quyền, hoặc IP gọi không nằm trong danh sách cho phép |
| 404 | `contact_not_found`, `not_found` | Không có khách hàng, hoặc endpoint không tồn tại |
| 429 | `rate_limited` | Vượt giới hạn số lượt gọi. Chờ số giây trong header `Retry-After` |
| 5xx | `internal_error`, `not_configured` | Lỗi phía hệ thống. Thử lại sau, giãn dần thời gian giữa các lần |

Mỗi phản hồi có các header:

- `X-Request-Id`: gửi kèm mã này khi báo lỗi;
- `X-RateLimit-Limit` và `X-RateLimit-Remaining`: giới hạn và số lượt còn lại.

## Cam kết tương thích

- **Trong v1:** chỉ **thêm** trường hoặc giá trị mới, không xóa, không đổi tên, không đổi ý nghĩa trường cũ.
- **Đối tác cần bỏ qua những trường lạ**, và xử lý được các giá trị `status` mới, ví dụ coi chúng như `in_progress`.
- **Thay đổi không tương thích** sẽ làm ở `/api/partner/v2`, và được báo trước.

## Endpoint

### `GET /capabilities`

Trả về những gì khóa đang dùng được phép làm: scopes, các mảng dữ liệu, các khóa học và giới hạn số lượt gọi.

### `POST /contacts/lookup`

Tìm khách hàng theo email hoặc số điện thoại. Hai thông tin này được gửi trong body, nên không lọt vào log của máy chủ.

```json
{ "phone": "0912345678", "include": ["learning"] }
```

- **Truyền `email`, `phone` hoặc cả hai.** Nếu cả hai trỏ tới hai người khác nhau thì email được ưu tiên.
- **Số điện thoại** nhận được các dạng `0912…`, `84912…`, `+84 912 …`.
- **`include` (không bắt buộc):** chọn mảng dữ liệu cần lấy.
  - Không truyền thì trả mọi mảng mà khóa có quyền.
  - Phần chi tiết như `learning.lessons` chỉ trả khi được yêu cầu.

### `GET /contacts/{contact_id}?include=learning,learning.lessons`

Lấy lại thông tin khách hàng khi đã có `contact_id`.

### `GET /changes?facet=learning&cursor=…&limit=100`

Danh sách các contact có dữ liệu thay đổi, sắp xếp từ cũ đến mới. Dùng để đồng bộ định kỳ.

- **Lần đầu:** không truyền `cursor` để lấy từ đầu, hoặc truyền `since=2026-10-01T00:00:00Z`.
- **Các lần sau:** lưu `meta.next_cursor` và truyền lại ở lần gọi kế tiếp.
- **Phân trang:** khi `meta.has_more = true` thì gọi tiếp ngay.
- **`limit`:** từ 1 đến 500, mặc định 100.

```json
{ "data": [ { "contact_id": "ct_…", "facet": "learning", "course": "trading", "changed_at": "…" } ],
  "meta": { "next_cursor": "eyJm…", "has_more": false, ... } }
```

Mỗi phần tử chỉ báo là có thay đổi. Gọi `GET /contacts/{contact_id}` để lấy dữ liệu mới.

## Dữ liệu contact

```json
{
  "contact_id": "ct_Q2x0c3lD2m3hV9aB1cDe4F",
  "name": "Nguyễn Văn A",
  "identities": { "emails": ["a@gmail.com"], "phones": ["0912345678"] },
  "funnels": [ { "page_id": "trading", "registered_at": "…" }, { "page_id": "dong-tien", "registered_at": "…" } ],
  "first_registered_at": "…",
  "learning": { "courses": [ { …xem dưới… } ] }
}
```

- **Một contact là một người.** Các lần đăng ký ở nhiều phễu có cùng email hoặc cùng số điện thoại được gộp lại thành một contact.
- **`contact_id` ổn định**, có thể lưu lại để dùng lâu dài.
  - Khi hai hồ sơ được gộp, `contact_id` cũ vẫn tra được. Phản hồi sẽ trả `contact_id` mới, và đối tác nên cập nhật theo.
- **`phones`** chỉ có khi khóa có scope `contact:phone`.

### Mảng `learning`: một phần tử cho mỗi khóa học khách đã đăng ký

| Trường | Ý nghĩa |
|---|---|
| `course`, `title` | Mã và tên khóa học |
| `registered_at` | Thời điểm đăng ký khóa |
| `status` | `not_started` (chưa xem bài nào), `in_progress`, `completed` (hoàn thành mọi bài) |
| `completed_lessons`, `total_lessons`, `completion_percent` | Tiến độ theo số bài. Một bài tính là hoàn thành khi đã xem ≥95% |
| `watched_seconds`, `total_seconds`, `watch_percent` | Tiến độ theo thời lượng thực sự đã xem. Tua qua không được tính |
| `started_at`, `last_activity_at` | Lần xem đầu tiên và lần gần nhất |
| `days_since_last_activity` | Số ngày kể từ lần xem gần nhất. `null` nếu chưa xem bài nào |
| `last_login_at` | Lần đăng nhập trang học gần nhất |
| `completed_at` | Thời điểm hoàn thành cả khóa. `null` nếu chưa xong |
| `current_lesson` | Bài xem gần nhất: `{ id, title, stage, watch_percent, completed }` |
| `next_lesson` | Bài nên học tiếp, kèm `remaining_seconds`. `null` khi đã xong khóa |
| `resume_url` | Link vào học tiếp, để gửi cho khách. Link không chứa thông tin đăng nhập: khách nhập email nếu trình duyệt chưa đăng nhập |
| `lessons` | Chỉ có khi `include=learning.lessons`. Từng bài gồm: `position`, `duration_seconds`, `watched_seconds`, `last_position`, `completed_at`, `updated_at` |

Ví dụ:

```json
{
  "course": "trading", "title": "Phương pháp Trading hiệu quả", "status": "in_progress",
  "completed_lessons": 3, "total_lessons": 8, "completion_percent": 37.5,
  "watched_seconds": 4210, "total_seconds": 12000, "watch_percent": 35.1,
  "days_since_last_activity": 2,
  "current_lesson": { "id": 4, "title": "Quản lý vốn", "stage": "Chương 2", "watch_percent": 40, "completed": false },
  "next_lesson": { "id": 4, "title": "Quản lý vốn", "stage": "Chương 2", "watch_percent": 40, "completed": false, "remaining_seconds": 720 },
  "resume_url": "https://event.phamthanhbien.com/trading/learn/4"
}
```

## Ví dụ

```bash
curl -s https://event.phamthanhbien.com/api/partner/v1/contacts/lookup \
  -H "Authorization: Bearer $PTB_API_KEY" -H "Content-Type: application/json" \
  -d '{"phone":"0912345678"}'
```

## Dữ liệu cá nhân

- **Chỉ dùng dữ liệu để chăm sóc chính khách hàng đó.** Không lưu lâu hơn mức cần thiết, không chia sẻ cho bên khác.
- **Mọi lượt đọc đều được ghi nhật ký** gồm khóa, contact và thời điểm. Nhật ký không ghi email hay số điện thoại.
- **Nghi ngờ khóa bị lộ** thì báo ngay để thu hồi và cấp khóa mới.
