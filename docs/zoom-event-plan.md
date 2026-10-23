# Kế hoạch dữ liệu Zoom: sự kiện, buổi, đăng ký, tham dự

> Lập ngày 2026-10-23. Đã chốt các câu hỏi ở mục 8 cùng ngày. Đề xuất làm thành bước **3.6** của [roadmap.md](roadmap.md), sau 3.2.
> Giao diện sẽ thiết kế lại sau khi phần dữ liệu này được duyệt.

## 1. Hiện trạng

Có 2 phần Zoom chạy riêng, không biết gì về nhau.

| Phần | Bảng | Ghi gì | Nối với khách bằng |
|---|---|---|---|
| Tab **Zoom** trong admin (đồng bộ từ Zoom report API) | `zoom_meetings`: mỗi **buổi** đã họp (`zoom_meeting_uuid`)<br>`lead_zoom_attendances`: mỗi lần một người vào buổi | Ai đã vào, vào lúc nào, ở lại bao lâu | `registration_id` (lead đầu tiên cùng email, tìm lúc đồng bộ) |
| Trang **/zoom** | `crm_settings.zoom_event_settings`: **một** sự kiện đang mở<br>`zoom_event_registrations`: khóa `meeting:<zoom id>\|email` | Ai đăng ký, link Zoom riêng, số lần bấm link | `registration_id` trong JSON |

Số liệu production ngày 23/10 (chỉ đếm):

- 47 buổi trên 13 ID Zoom, 1 host. Một ID được dùng lại nhiều lần: 5 ID chỉ 1 buổi, 1 ID có 15 buổi (phòng họp cá nhân / meeting định kỳ).
- 3.362 lượt tham dự của 682 email. 2.228 lượt (66%) khớp được lead, ứng với 339 lead.
- 14 buổi có 1–5 người: phần lớn là họp nội bộ hoặc buổi tập dượt.
- /zoom đã dùng 3 ID → 374 lượt đăng ký, 196 người (52%) có vào Zoom. Con số này hiện **không hiện ở đâu cả**, vì 2 phần không nối nhau.

Vấn đề:

1. **Không có khái niệm "sự kiện".** Admin chỉ thấy từng buổi Zoom. Một webinar dùng lại ID cho lần 2 thì đăng ký lần 1 và lần 2 lẫn vào nhau (khóa theo ID Zoom).
2. **/zoom chỉ mở được một sự kiện một lúc.** Đổi sự kiện là ghi đè cài đặt, mất nội dung trang cũ.
3. **Không đo được đăng ký → tham dự.**
4. **Khớp khách theo lead, không theo khách hàng.** Người dùng 2 email chỉ khớp được 1. Từ 3.1 đã có `contacts` nhưng Zoom chưa dùng.
5. **Không lọc được buổi họp nội bộ** khỏi báo cáo.

## 2. Khái niệm

```
PHÒNG ZOOM (một Meeting/Webinar ID; có thể dùng lại nhiều lần)
   └─ BUỔI (một lần họp thật, zoom_meetings)
         └─ LƯỢT THAM DỰ (một lần vào phòng, lead_zoom_attendances) ──► KHÁCH HÀNG

SỰ KIỆN (thứ mình mời khách tham gia: tên, giờ, phòng Zoom, trang đăng ký nếu có)
   ├─ gồm 1 hoặc nhiều BUỔI
   └─ LƯỢT ĐĂNG KÝ (zoom_event_registrations) ──────────────────────► KHÁCH HÀNG
```

- **Sự kiện** là đơn vị để báo cáo. Webinar "Xu hướng 2026 lần 1" và "lần 2" là 2 sự kiện, dù dùng chung một ID Zoom.
- Sự kiện **không bắt buộc có trang đăng ký**, ví dụ Q&A học viên hằng tuần: link nằm trong bài học, nhưng vẫn cần biết ai đã vào.
- Buổi không thuộc sự kiện nào (họp nội bộ, gọi đối tác) vẫn được lưu, chỉ không vào báo cáo.

## 3. Bảng

### 3.1 `zoom_events` (mới)

| Cột | Ghi chú |
|---|---|
| `id uuid` | khóa chính |
| `title text` | tên trong admin và trong webhook |
| `zoom_kind text`, `zoom_id text` | `meeting` / `webinar` và ID phòng |
| `starts_at timestamptz`, `duration_minutes int` | giờ dự kiến |
| `status text` | `draft` / `open` (đang nhận đăng ký) / `closed` |
| `has_page boolean` | sự kiện có dùng trang /zoom không. `false` = không có trang (ví dụ Q&A học viên, link nằm trong bài học) |
| `page jsonb` | nội dung trang: banner, tiêu đề, ảnh chia sẻ… (chính là phần nội dung của `zoom_event_settings` hiện nay) |
| `closed_at`, `created_at`, `updated_at` | |

Ràng buộc: **chỉ một sự kiện có trang được `open` tại một thời điểm** (unique index có điều kiện `has_page and status = 'open'`). /zoom luôn hiện sự kiện đó. Nhờ vậy /zoom dùng lại được cho nhiều sự kiện nối tiếp nhau, và sự kiện cũ vẫn giữ nguyên nội dung trang để xem lại hoặc nhân bản.

### 3.2 `zoom_event_sessions` (mới): buổi nào thuộc sự kiện nào

| Cột | Ghi chú |
|---|---|
| `zoom_meeting_uuid text` | khóa chính, tham chiếu `zoom_meetings`. Mỗi buổi thuộc tối đa một sự kiện |
| `event_id uuid` | tham chiếu `zoom_events` |
| `source text` | `auto` (gán theo luật) / `manual` (admin gán) |
| `excluded boolean` | admin bỏ buổi này khỏi sự kiện (tập dượt). Lần gán tự động sau vẫn giữ quyết định này |

### 3.3 `zoom_meetings` (thêm cột)

- `hidden boolean`, `hidden_by text` (`auto` / `manual`): ẩn khỏi danh sách và báo cáo.

### 3.4 `zoom_event_registrations` (thêm cột, giữ `data`)

Đưa các trường hay lọc ra thành cột: `event_id`, `email`, `registration_id`, `contact_id`, `created_at`.

- Index duy nhất `(event_id, email)`: mỗi người đăng ký một lần cho mỗi sự kiện, như hiện nay.
- Dòng mới dùng khóa `<event_id>|email`. Dòng cũ giữ khóa cũ, nên link `/zoom/vao-hoc/<key>` đã gửi khách vẫn chạy.

### 3.5 `lead_zoom_attendances` (thêm cột)

- `contact_id uuid`: khách hàng của lượt tham dự.
- `match_source text`: `email` (tự khớp) / `manual` (admin gán) / `created` (admin tạo hồ sơ mới từ người tham dự).
- Giữ `registration_id` để màn hình cũ vẫn chạy cho đến khi chuyển hẳn sang khách hàng.

### 3.6 Không thêm bảng tổng hợp

"Người của sự kiện" (đã đăng ký? có link? bấm link? vào mấy buổi? ở lại bao lâu?) tính bằng một truy vấn khi mở trang. Dữ liệu nhỏ (3.362 lượt tham dự, 374 lượt đăng ký), chưa cần bảng tính sẵn.

## 4. Mối liên hệ

```
contacts ◄──── contact_id ────┬──── zoom_event_registrations ──── event_id ───► zoom_events
   ▲                          │                                                   ▲
   │                          │                                                   │ event_id
   │                          └──── lead_zoom_attendances ──► zoom_meetings ◄── zoom_event_sessions
   │                                   (zoom_meeting_uuid)
registrations (lead, contact_id) ◄──── registration_id (giữ để tương thích)
```

Người đăng ký và người tham dự gặp nhau ở **khách hàng**, không phải ở email. Ví dụ: khách đăng ký bằng email cá nhân nhưng vào Zoom bằng email công ty, hai email này đã thuộc cùng một khách theo luật nhận diện 3.1, nên vẫn tính là "đã đăng ký và tham dự".

## 5. Luật

1. **Gán buổi vào sự kiện (tự động, mỗi lần đồng bộ).** Buổi có cùng loại và ID phòng với sự kiện, bắt đầu trong khoảng từ 12 giờ trước `starts_at` của sự kiện đến 12 giờ trước sự kiện kế tiếp dùng cùng ID (hoặc đến `closed_at` cộng 1 ngày). Cách này tách được "lần 1" và "lần 2" của cùng một ID.
2. **Phòng họp cá nhân** (Zoom type 4) không bao giờ tự gán, vì dùng cho đủ loại việc. Admin gán tay nếu cần.
3. **Buổi chưa thuộc sự kiện nào** hiện trong mục "Buổi chưa gán". Admin có thể gán vào một sự kiện, hoặc tạo sự kiện mới từ buổi đó (không có trang đăng ký).
4. **Tự ẩn buổi nội bộ**: buổi có tối đa 5 người và không ai khớp được khách hàng. Ẩn tay hay bỏ ẩn tay đều được giữ, đồng bộ sau không ghi đè.
5. **Khớp người tham dự với khách hàng** (lúc đồng bộ, và mỗi đêm cho dữ liệu cũ):
   - Email Zoom trùng một định danh email của khách (`contact_identities`) → khớp.
   - Không có email, hoặc email lạ → vào mục "Tham dự chưa khớp", có gợi ý theo tên hiển thị. Admin gán vào khách có sẵn hoặc tạo hồ sơ mới. **Không tự gộp theo tên**, đúng luật 4 của 3.1.
6. **Trạng thái của một người trong sự kiện:**
   - đã đăng ký: có lượt đăng ký;
   - có link: Zoom đã cấp link riêng;
   - bấm link: `join_clicks > 0`;
   - tham dự: có lượt tham dự trong một buổi không bị bỏ ra;
   - ở lại đến cuối: thời gian có mặt ≥ 2/3 thời lượng buổi (cách đo ở luật 9);
   - tham dự nhưng không đăng ký: vào bằng link chung, được tính riêng.
7. **Link riêng của sự kiện đã đóng** (`/zoom/vao-hoc/<key>`) chuyển sang sự kiện đang mở trên /zoom, như hiện nay. Không có sự kiện nào đang mở thì báo "chưa mở đăng ký".
8. **Webhook n8n chỉ thêm trường**: `zoom.event_id`; giữ nguyên các trường cũ (nguyên tắc 3 của roadmap). Khi nào làm tag lớp học HubCRM (đã hoãn) thì mã lớp gắn vào sự kiện.

9. **Đo thời gian có mặt.** Zoom trả mỗi lần vào/ra phòng thành một dòng. Một người có thể vào lại nhiều lần, hoặc mở cùng lúc trên điện thoại và máy tính.
   - Gom mọi dòng của cùng một khách trong một buổi. Lấy **hợp các khoảng** vào → ra, không cộng thẳng, để 2 thiết bị mở cùng lúc không bị tính gấp đôi.
   - Chỉ tính phần nằm trong giờ buổi diễn ra (từ lúc buổi bắt đầu đến lúc kết thúc theo Zoom). Vào sớm chờ host không được tính.
   - **Thời lượng buổi** = thời lượng thực tế Zoom ghi nhận. Nếu Zoom không có số này thì dùng thời lượng dự kiến của sự kiện. Dùng thời lượng thực tế để buổi kết thúc sớm hay kéo dài đều không làm sai tỷ lệ.
   - Sự kiện nhiều buổi thì cộng thời gian có mặt và thời lượng của các buổi không bị bỏ ra.
   - **Ở lại đến cuối** khi thời gian có mặt ≥ 2/3 thời lượng buổi. Ví dụ: buổi 90 phút, có mặt từ 60 phút trở lên.

## 6. Chuyển dữ liệu cũ

Migration 017 tạo bảng và cột, sau đó một script có chế độ chạy thử (in số dòng, không ghi gì):

1. Mỗi `event_key` trong `zoom_event_registrations` (hiện có 3) thành một sự kiện. Sự kiện đang cấu hình trong `zoom_event_settings` → `open`, có trang, nội dung trang lấy từ cài đặt. Hai sự kiện còn lại → `closed`, có trang, tên lấy từ chủ đề buổi Zoom.
2. Điền `event_id`, `email`, `registration_id`, `contact_id`, `created_at` cho 374 lượt đăng ký.
3. Gán buổi theo luật 1 cho 47 buổi, ẩn buổi nội bộ theo luật 4.
4. Điền `contact_id` cho lượt tham dự: 2.228 lượt có sẵn lead; số còn lại thử khớp lại theo email.

`zoom_event_settings` được giữ nguyên làm bản dự phòng cho đến khi bước Z2 chạy ổn.

## 7. Các bước

| Bước | Việc | Ảnh hưởng tới khách |
|---|---|---|
| **Z1** | Migration 017 + script chuyển dữ liệu; đồng bộ Zoom ghi `contact_id` và gán buổi | Không |
| **Z2** | /zoom đọc sự kiện đang mở từ `zoom_events`; đăng ký mới ghi `event_id`, `contact_id` | Không đổi giao diện; kiểm tra link cũ còn chạy |
| **Z3** | Admin: danh sách sự kiện, chi tiết sự kiện, buổi chưa gán, tham dự chưa khớp. Giao diện thiết kế sau khi duyệt bản này | Chỉ admin |
| **Z4** | Tab Zoom và dòng thời gian trong chi tiết khách hàng (cần 3.2) | Chỉ admin |

Z1–Z2 làm được ngay sau 3.2. Chỉ có một trang /zoom; nếu sau này cần nhiều trang cùng lúc thì thêm cột đường dẫn vào `zoom_events` là đủ, không phải đổi gì khác.

## 8. Đã chốt (23/10)

1. **Chỉ một trang /zoom**, dùng lần lượt cho từng sự kiện.
2. **Tự ẩn buổi nội bộ** khi buổi có tối đa 5 người và không ai là khách: đồng ý.
3. **Ở lại đến cuối** khi thời gian có mặt ≥ 2/3 thời lượng buổi, đo theo luật 9.
4. **Chỉ một tài khoản Zoom** cần đồng bộ.
