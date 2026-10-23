# API đối tác v1

API chỉ đọc, dùng giữa hai máy chủ (server to server). Đối tác dùng nó để lấy thông tin khách hàng và tiến trình học của khách ở các khóa video (Dòng Tiền, Trading...).

- Base URL: `https://event.phamthanhbien.com/api/partner/v1`
- Dữ liệu: JSON UTF-8. Thời gian theo ISO 8601 UTC, ví dụ `2026-10-14T03:15:00.000Z`.

## Bắt đầu nhanh

Tra cứu khách theo số điện thoại. Kết quả gồm tên khách và tiến trình từng khóa học khách đã đăng ký.

```bash
curl -X POST https://event.phamthanhbien.com/api/partner/v1/contacts/lookup \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"phone":"0912345678"}'
```

- `<KEY>` là khóa API được cấp riêng cho đối tác.
- Có thể tra bằng email thay cho số điện thoại: `-d '{"email":"nguyenvana@gmail.com"}'`.

**Tìm thấy khách (HTTP 200):**

```json
{
  "data": {
    "contact_id": "ct_jf9VsV7G-F9QR3qh4JTiXT",
    "name": "Nguyễn Văn A",
    "identities": { "email": "nguyenvana@gmail.com", "emails": ["nguyenvana@gmail.com"] },
    "funnels": [ { "page_id": "trading", "registered_at": "2026-10-10T13:02:11.000Z" } ],
    "first_registered_at": "2026-10-10T13:02:11.000Z",
    "learning": {
      "courses": [
        {
          "course": "trading",
          "title": "Phương pháp Trading hiệu quả",
          "registered_at": "2026-10-10T13:02:11.000Z",
          "status": "in_progress",
          "completed_lessons": 2,
          "total_lessons": 4,
          "completion_percent": 50,
          "watched_seconds": 2160,
          "total_seconds": 3600,
          "watch_percent": 60,
          "started_at": "2026-10-10T13:05:40.000Z",
          "last_activity_at": "2026-10-12T14:20:05.000Z",
          "last_login_at": "2026-10-12T14:18:30.000Z",
          "days_since_last_activity": 2,
          "completed_at": null,
          "current_lesson": { "id": 3, "title": "Quản lý vốn", "stage": null, "watch_percent": 40, "completed": false },
          "next_lesson": { "id": 3, "title": "Quản lý vốn", "stage": null, "watch_percent": 40, "completed": false, "remaining_seconds": 540 },
          "resume_url": "https://event.phamthanhbien.com/trading/learn/3"
        }
      ]
    }
  },
  "meta": { "api_version": "1.0", "request_id": "828d055b-8381-48b4-b3dc-a833b62bd054", "generated_at": "2026-10-14T04:28:00.227Z", "match": { "by": "phone", "other_contacts": 0 } }
}
```

**Không tìm thấy khách (HTTP 404):** khách chưa đăng ký phễu nào, hoặc số điện thoại/email không khớp.

```json
{
  "error": { "code": "contact_not_found", "message": "Không tìm thấy khách hàng." },
  "meta": { "api_version": "1.0", "request_id": "c1fa7d2c-f3c4-4ca4-8d63-c4a824abb1ed", "generated_at": "2026-10-14T04:28:00.244Z" }
}
```

Các trường bot hay dùng, trong `learning.courses[]`:

- `status`: `not_started`, `in_progress` hoặc `completed`;
- `completion_percent`: % số bài đã hoàn thành;
- `days_since_last_activity`: số ngày chưa quay lại học;
- `next_lesson.title`: bài nên học tiếp; `remaining_seconds` là số giây còn lại của bài đó;
- `resume_url`: link gửi khách để học tiếp.

Khách chưa đăng ký khóa video nào thì `learning.courses` là mảng rỗng.

Nếu `meta.match.other_contacts` lớn hơn 0, số điện thoại này còn thuộc người khác, ví dụ người nhà dùng chung số. API trả người đăng ký bằng số đó gần nhất. Bot nên hỏi lại email đăng ký và tra bằng email cho chắc.

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
| `contact:phone` | Thêm số điện thoại trong `identities.phone` / `identities.phones` |
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

## Thay đổi

Mới nhất ở trên. Mọi thay đổi trong v1 đều là **thêm**: bot đang chạy không phải sửa gì.

| Ngày | Thay đổi | Phía đối tác cần làm gì |
| --- | --- | --- |
| 2026-10-23 | Contact có thêm `attribution` (nguồn đầu / nguồn cuối) và `funnels[].last_registered_at`. | Không bắt buộc. Có thể dùng `attribution` để biết khách đến từ quảng cáo, Zalo hay bot. |
| 2026-10-22 | Link tự đăng nhập: không cần `khuvuc`; tên, email và SĐT là đủ để đăng ký. | Không. |
| 2026-10-20 | Link tự đăng nhập cho khách (Trading, Dòng Tiền). | Không bắt buộc. Xem mục "Link tự đăng nhập cho khách". |
| 2026-10-14 | Gộp theo SĐT chỉ khi tên khớp; mặc định trả một email/SĐT, thêm `include=identities.all` để lấy hết. | Nếu cần mọi email/SĐT, thêm `include=identities.all`. |
| 2026-10-14 | Ra mắt v1: tra cứu contact, tiến trình học, luồng thay đổi. | — |

**Khi hai hồ sơ được gộp:** `contact_id` cũ vẫn tra được và phản hồi trả về `contact_id` của hồ sơ giữ lại. Đối tác nên thay mã đã lưu bằng mã trong phản hồi.

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
  - `identities.all`: trả mọi email (và SĐT) của contact, thay vì chỉ một.

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
  "identities": { "email": "a@gmail.com", "emails": ["a@gmail.com"], "phone": "0912345678", "phones": ["0912345678"] },
  "funnels": [ { "page_id": "trading", "registered_at": "…", "last_registered_at": "…" }, { "page_id": "dong-tien", "registered_at": "…", "last_registered_at": "…" } ],
  "first_registered_at": "…",
  "attribution": {
    "first_touch": { "source": "facebook", "medium": "cpc", "campaign": "k80", "landing_path": "/trading", "at": "2026-10-01T02:10:00.000Z" },
    "last_touch": { "source": "zalo", "medium": "bot-cskh", "at": "2026-10-20T07:05:00.000Z" }
  },
  "learning": { "courses": [ { …xem dưới… } ] }
}
```

- **Một contact là một người.** Các lần đăng ký ở nhiều phễu được gộp lại thành một contact khi:
  - trùng email (luôn gộp);
  - hoặc trùng số điện thoại **và tên khớp**, không phân biệt dấu và hoa thường. Tên ngắn nằm trong tên dài cũng tính là khớp: "Hòa" khớp "Đinh Thế Hòa".
- **Trùng số điện thoại nhưng khác tên** (người nhà dùng chung số, gõ nhầm số) thì là các contact riêng. Tra bằng số đó sẽ trả người đăng ký gần nhất, kèm `meta.match.other_contacts`.
- **`identities`:** mặc định chỉ có một email: email đã tra, hoặc email đăng ký gần nhất khi tra bằng SĐT hay `contact_id`. `emails` là mảng chứa đúng email đó. Muốn lấy mọi email thì thêm `include=identities.all`.
- **`contact_id` ổn định**, có thể lưu lại để dùng lâu dài.
  - Khi hai hồ sơ được gộp, `contact_id` cũ vẫn tra được. Phản hồi sẽ trả `contact_id` mới, và đối tác nên cập nhật theo.
- **`phone` / `phones`** chỉ có khi khóa có scope `contact:phone`, theo cùng cách như email.
- **`funnels[].registered_at`** là lần đăng ký đầu tiên ở phễu đó, **`last_registered_at`** là lần gần nhất (bằng nhau nếu khách chỉ đăng ký một lần).
- **`attribution`** cho biết khách đến từ đâu, cùng số liệu với trang khách hàng trong admin:
  - `first_touch`: nguồn đưa khách tới **lần đầu tiên** (ghi một lần, giữ 12 tháng trên trình duyệt);
  - `last_touch`: nguồn **gần nhất trước lần đăng ký mới nhất** (không tính lượt vào trực tiếp);
  - mỗi mốc có thể có `source`, `medium`, `campaign`, `content`, `term`, `landing_path` (trang vào đầu tiên), `referrer_host` (trang trước đó) và `at`. Trường trống thì không có trong JSON;
  - khách đăng ký trước ngày 2026-10-22 thường chỉ có nguồn theo UTM gửi kèm form; không có gì thì mốc đó là `null`.

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

## Link tự đăng nhập cho khách

Khi đã thu đủ thông tin của khách, bot gửi link vào phễu. Link này không cần khóa API. Khách bấm vào thì được đưa thẳng vào bài học.

```
https://event.phamthanhbien.com/trading?email=…&name=…&phone=…&khuvuc=…
https://event.phamthanhbien.com/dong-tien?email=…&name=…&phone=…&khuvuc=…
```

- **Mã hóa URL mọi giá trị**, ví dụ `Nguy%E1%BB%85n%20V%C4%83n%20A`. Có thể dùng `sdt` thay cho `phone`, và `region` thay cho `khuvuc`.
- **Số điện thoại** có 9–11 chữ số. Chấp nhận dạng `+84`, `84` và có dấu cách.
- **Khu vực** (không bắt buộc, có thể bỏ `khuvuc`): "Hà Nội", "HN" quy về Hà Nội. "HCM", "TP.HCM", "Sài Gòn" quy về Hồ Chí Minh. Giá trị khác quy về "Khu vực khác".
- **Email chưa đăng ký phễu**: tạo đăng ký mới giống khách tự điền form, rồi mở bài học. Nguồn ghi là `utm_source=ai-cskh`. Muốn tách theo chiến dịch thì thêm `&utm_campaign=…`.
- **Email đã đăng ký**: đăng nhập vào bài học. Thông tin cũ của khách giữ nguyên.
- **Thiếu hoặc sai một trường**: không tự đăng ký. Khách thấy form đã điền sẵn, kèm lời nhắc trường cần sửa.
- Trang xóa các thông tin này khỏi thanh địa chỉ ngay khi mở, trước khi công cụ đo lường chạy.

## Dữ liệu cá nhân

- **Chỉ dùng dữ liệu để chăm sóc chính khách hàng đó.** Không lưu lâu hơn mức cần thiết, không chia sẻ cho bên khác.
- **Mọi lượt đọc đều được ghi nhật ký** gồm khóa, contact và thời điểm. Nhật ký không ghi email hay số điện thoại.
- **Nghi ngờ khóa bị lộ** thì báo ngay để thu hồi và cấp khóa mới.
