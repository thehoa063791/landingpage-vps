# Kế hoạch tối ưu và mở rộng database

> Trạng thái: **bản đề xuất để xem trước, chưa sửa gì**. Lập ngày 2026-10-22.
> Số liệu lấy từ production bằng truy vấn chỉ đọc (số dòng, dung lượng, lượt đọc/ghi), không đọc nội dung lead.
> Liên quan: [contact-model-plan.md](contact-model-plan.md) (lớp khách hàng). Kế hoạch này bao gồm và sắp xếp lại các bước của kế hoạch đó.

## 1. Trả lời nhanh: bảng `006_dong_tien_learning` và `007_dong_tien_stages` dùng cho ai?

Hai migration này là **phiên bản cũ, chỉ dành cho Dòng Tiền**, gồm 4 bảng:

- `dong_tien_learners`
- `dong_tien_lessons`
- `dong_tien_progress`
- `dong_tien_stages`

**Migration `008_learning_courses` đã thay thế cả 4 bảng** bằng 4 bảng dùng chung cho mọi khóa học:

- `learning_lessons`
- `learning_stages`
- `learning_learners`
- `learning_progress`

Mỗi dòng có cột **`course`** cho biết thuộc khóa nào. Production hiện có:

| Bảng dùng chung | dong-tien | trading |
|---|---|---|
| learning_lessons | 23 bài | 17 bài |
| learning_learners | 529 học viên | 97 học viên |
| learning_progress | 1.144 dòng | 213 dòng |

Các bảng `dong_tien_*` cũ **không còn được code đọc hay ghi**: 0 tham chiếu, `dong_tien_progress` và `dong_tien_learners` đã trống. Chúng chỉ còn vì migration 008 sao chép dữ liệu từ đó sang. **Thêm khóa học mới không cần bảng mới**, chỉ cần khai báo trong `src/learningCourses.js`.

→ Đề xuất: sao lưu rồi xóa 4 bảng `dong_tien_*` (bước A).

## 2. Hiện trạng

**49 bảng, khoảng 190 MB.** Các bảng chính:

| Nhóm | Bảng | Dòng | Dung lượng | Ghi chú |
|---|---|---|---|---|
| Tracking | `events` | 69.535 | **138 MB** | Tăng 500–3.700 dòng/ngày. Mỗi dòng lưu cùng một thông tin hai lần (`data` khoảng 800 byte, `event_meta` khoảng 650 byte) |
| CRM | `registrations` (lead) | 5.090 | 15 MB | Cột `data` trung bình 1,4 KB/dòng (lịch sử form). Sắp thêm khoảng 18.000 lead WordPress |
| | `lead_tags`, `lead_notes`, `crm_custom_field_values` | 2.351 / 102 / 0 | | Không có khóa ngoại tới `registrations` |
| | `crm_tags`, `crm_tag_categories`, `crm_custom_fields`, `crm_profiles`, `auth_users`, `crm_settings` | nhỏ | | |
| Học tập | `learning_*` (4 bảng) | 1.340 tiến độ | 2 MB | Dùng chung mọi khóa |
| | `dong_tien_*` (4 bảng) | 23 bài, còn lại trống | | **Bỏ được** |
| Zoom | `zoom_meetings`, `lead_zoom_attendances`, `zoom_event_registrations` | 47 / 3.362 / 373 | 5,7 MB | Tham dự Zoom nối với lead **theo email** |
| Bán hàng | `funnel_sales` (thực chất là đơn hàng), `funnel_order_status_history` | 20 / 20 | | |
| | `payments` | **0** | | Không dùng (cổng thanh toán cũ) |
| Quảng cáo | `ad_accounts`, `campaigns`, `ad_sets`, `ads`, `creatives`, `daily_stats`, `breakdown_stats`, `sync_jobs` | | 19 MB | Đang dùng (Ads Performance) |
| | `businesses`, `business_members`, `facebook_pages`, `media_items`, `publish_jobs`, `notifications` | 2–194 | | **Không còn code nào dùng**. Sót lại từ Supabase, chỉ còn trong script khôi phục |
| Khác | `webhooks`, `webhook_logs`, `api_clients`, `api_access_log`, `redirects`, `blog_posts`, `surveys` | | | `webhook_logs` lưu **bản sao đầy đủ thông tin khách** của mọi lượt gửi |

## 3. Vấn đề, xếp theo mức ảnh hưởng

### 3.1. Đọc cả bảng lead vào bộ nhớ: phải sửa trước khi nhập lead WordPress

`getRegistrations()` tải **toàn bộ** bảng `registrations` vào Node, kể cả cột `data`, rồi giữ trong bộ nhớ đệm 45 giây. Có **29 chỗ** trong code gọi hàm này, gồm:

- đăng ký và đăng nhập khóa học (`learningService`);
- `/api/register`;
- kiểm tra email;
- API đối tác;
- Zoom;
- các báo cáo admin.

Mỗi lần đăng nhập khóa học, hệ thống tải hết 5.090 lead chỉ để tìm một email.

- **Hiện tại** khoảng 7 MB dữ liệu cho mỗi lần tải.
- **Sau khi nhập 18.000 lead WordPress**, con số này thành khoảng 23.000 dòng, 30–35 MB mỗi lần tải. PM2 tự khởi động lại app khi dùng quá **512 MB RAM** (`ecosystem.config.js`). Vài request chạy cùng lúc là có thể chạm ngưỡng.
- Bảng `events` đã được xử lý theo cách này trong đợt tối ưu tốc độ (`getEventsWhere`). Bảng lead chưa làm.

→ **Bước B**: tìm theo email, SĐT hoặc phễu bằng truy vấn SQL có index; phân trang danh sách lead phía server. Các index cho email và SĐT đã có nhưng **chưa bao giờ được dùng**, vì code không truy vấn bằng SQL.

### 3.2. Không biết migration nào đã chạy

`scripts/migrate.js` chạy lại **mọi file** `.sql` mỗi lần. Hiện vẫn an toàn vì các file đều viết kiểu `if not exists`. Nhưng migration nào chuyển dữ liệu (như 008) mà lỡ chạy lại sau khi dữ liệu đã đổi thì có thể ghi lại dữ liệu cũ.

→ **Bước A**:
- Thêm bảng `schema_migrations` ghi file nào đã chạy, chạy lúc nào. Mỗi file chỉ chạy một lần.
- Deploy chỉ chạy file mới.

### 3.3. Không có khóa ngoại giữa lead và dữ liệu đi kèm

`lead_notes`, `lead_tags`, `crm_custom_field_values`, `funnel_sales`, `learning_progress`, `lead_zoom_attendances` và `surveys` lưu `registration_id` dạng chữ, không ràng buộc với `registrations`. Hậu quả:

- **Xóa lead** để lại ghi chú, tag và tiến độ "mồ côi". `learning_learners` thì có ràng buộc.
- **Gộp lead** phải tự chuyển từng bảng. `mergeRegistrations` hiện **chưa chuyển** tiến độ học, đơn hàng, đăng ký Zoom và events.

→ **Bước A** thêm khóa ngoại, sau khi kiểm tra và dọn dữ liệu mồ côi. **Bước C** (lớp khách hàng) bỏ hẳn nhu cầu chuyển dữ liệu khi gộp.

### 3.4. Bảng `events` lớn nhanh và lưu trùng

- **Hiện tại:** 138 MB cho 6 tháng. Mỗi dòng có cả `data` lẫn `event_meta`, phần lớn trùng nhau. Không có chính sách xóa dữ liệu cũ.
- **Index thừa:** hai index `idx_events_created_at` và `idx_events_session` **chưa được dùng lần nào**. Các báo cáo lọc theo `event_timestamp`.
- **Ước tính:** khoảng 300 MB/năm, nhiều hơn khi chạy quảng cáo lớn. Báo cáo dài ngày sẽ chậm dần.

→ **Bước D**:
- Bỏ phần trùng, chỉ giữ một cột JSON.
- Thêm bảng **tổng hợp theo ngày** (lượt xem, lượt bấm, đăng ký theo phễu và nguồn) để báo cáo đọc nhanh.
- Chia bảng theo tháng (partition), hoặc chuyển event chi tiết cũ hơn 12–18 tháng ra file lưu trữ.

### 3.5. Lưu thông tin khách ở quá nhiều nơi

- **`webhook_logs`** lưu tên, SĐT, email, IP, fbp/fbc **và** toàn bộ payload của mọi lượt gửi webhook.
- **`registrations.data`** chép lại thông tin của từng lần gửi form.
- **`api_access_log`** thì đã làm đúng: không lưu email hay SĐT.

→ **Bước A**:
- `webhook_logs` chỉ giữ `lead_id`, mã trạng thái, thời gian và lỗi.
- Payload đầy đủ giữ 30 ngày để gỡ lỗi, sau đó tự xóa.

### 3.6. Bảng không còn dùng

| Bảng | Tình trạng | Đề xuất |
|---|---|---|
| `dong_tien_*` (4 bảng) | `learning_*` đã thay | Sao lưu rồi xóa |
| `businesses`, `business_members`, `facebook_pages`, `media_items`, `publish_jobs`, `notifications` | Không có dữ liệu mới từ 16/08/2026. Code của hệ thống này không dùng; chỉ có kết nối của chính app này vào database. Đây là dữ liệu đăng bài Facebook (trang, ảnh, lịch đăng), có thể do app **WeGrow Admin Panel** (`/opt/admin-panel`) tạo khi còn dùng chung Supabase. App đó vẫn chạy trên server, nhưng tài khoản deploy không đọc được cấu hình của nó | **Chuyển sang schema `archive`** thay vì xóa: không mất dữ liệu, cần lại thì chuyển về trong một lệnh. Hỏi người quản lý WeGrow trước khi xóa hẳn |
| `payments` | 0 dòng, `funnel_sales` đã thay | Gộp vào thiết kế đơn hàng ở bước E |

### 3.7. Một số bảng khó mở rộng

- **`surveys`** có 9 cột cố định (`q1_stage` … `q9_priority`), chỉ dùng cho khảo sát 30s. Câu trả lời khảo sát của khóa học lại nằm trong `learning_learners.data`. Mỗi loại khảo sát mới phải sửa bảng.
- **`funnel_sales`** thực chất là **đơn hàng**:
  - Mỗi dòng chỉ có một số tiền, không có danh sách sản phẩm.
  - Thông tin thanh toán chuyển khoản nằm chung trong bảng.
  - Bán khóa có phí, nhiều gói, hay hoàn tiền một phần đều khó làm.
- **`learning_*` và `zoom_event_registrations`** lưu mọi thứ trong một cột JSON `data`.
  - Ưu điểm: linh hoạt, thêm trường không cần migration.
  - Nhược điểm: không có ràng buộc, và mỗi kiểu truy vấn phải có index riêng trên JSON.
- **Phễu và khóa học** được khai báo trong code (`learningCourses.js`, thư mục `pages/`), không có trong database. Báo cáo chỉ biết phễu qua `page_id`.

## 4. Thiết kế đích

```
NGƯỜI
  contacts ─── contact_identities (email, SĐT, Zalo, mã HubCRM...)
     │           sale phụ trách, tag, ghi chú, custom field ở cấp này
     │
HOẠT ĐỘNG (mỗi bảng có contact_id + khóa ngoại)
  registrations (lượt đăng ký form, theo phễu)
  learning_enrollments (ghi danh khóa)  ── learning_progress
  zoom_attendances / zoom_event_registrations
  orders ── order_items ── payments (chuyển khoản, cổng thanh toán)
  form_responses (khảo sát, câu hỏi phụ: answers JSON theo từng form)
  events (tracking) ── events_daily (tổng hợp cho báo cáo)

DANH MỤC (cấu hình)
  funnels (page_id, tên, loại: landing/khóa học/có phí, trạng thái)
  courses ── lessons ── stages
  products (sản phẩm, giá)
  tags, tag_categories, custom_fields, redirects, webhooks, api_clients

NHẬT KÝ (có thời hạn lưu)
  webhook_deliveries (không lưu thông tin khách), api_access_log
```

**Nguyên tắc chung:**

1. **Mọi thứ về một người trỏ về `contacts`.** Mọi hoạt động có `contact_id` và khóa ngoại.
2. **Dữ liệu hay lọc hay nối bảng thì dùng cột thật. JSON chỉ cho phần mở rộng.** Ví dụ `learning_progress` có cột `lesson_id`, `watch_percent`, `completed_at`; ghi chú thêm thì để trong JSON.
3. **Danh mục nằm trong database:** `funnels`, `courses`, `products`. Admin quản lý được, báo cáo nối bảng được. File code chỉ còn giữ phần giao diện.
4. **Nhật ký có thời hạn và không chép thông tin khách.**
5. **Migration chạy một lần, có tên và thứ tự.** Mỗi bước có cách quay lại.

## 5. Các bước đề xuất

Mỗi bước deploy riêng, có sao lưu, có test, và chạy thử trên bản sao dữ liệu thật trong PGlite trước. Chỉ đụng tới production khi bạn đồng ý.

### Bước A: dọn dẹp, an toàn (nhỏ, khoảng 1 ngày)

1. **Bảng `schema_migrations`**, `scripts/migrate.js` chỉ chạy file mới. Đánh dấu 001–013 là đã chạy.
2. **Xóa bảng thừa** (sao lưu riêng từng bảng trước): `dong_tien_*`. Nhóm `businesses`/`facebook_pages`/… chỉ xóa khi bạn xác nhận.
3. **Khóa ngoại** cho `lead_notes`, `lead_tags`, `crm_custom_field_values`, `funnel_sales`, `learning_progress`, `surveys` → `registrations`. Trước đó báo cáo và dọn dữ liệu mồ côi.
4. **`webhook_logs`:** bỏ các cột thông tin khách, thay bằng `lead_id`. Payload giữ 30 ngày.
5. **Bỏ 2 index không dùng** của `events`.

### Bước B: thôi tải cả bảng lead (vừa, 2–3 ngày). **Làm trước khi nhập 18.000 lead WordPress**

1. Thêm các hàm truy vấn trong `storage.js`: `findRegistrationsByEmail`, `findByPhone`, `findInPage`, `countByPage`, `searchRegistrations` (lọc, phân trang).
2. **Chuyển 29 chỗ** đang gọi `getRegistrations()` sang các hàm trên, ưu tiên theo mức ảnh hưởng:
   - đăng nhập/đăng ký khóa học (`learningService`);
   - `/api/register` và kiểm tra email;
   - API đối tác, Zoom;
   - danh sách lead và báo cáo trong admin.
3. Danh sách lead trong admin lọc và phân trang **phía server**.
4. **Đo trước và sau:** thời gian phản hồi và RAM với 23.000 lead giả lập.

### Bước C: lớp khách hàng (lớn, theo [contact-model-plan.md](contact-model-plan.md))

- **Bước 0:** chặn gửi lại cùng phễu.
- **Bước 1:** tạo `contacts` chạy song song.
- **Bước 2:** màn hình đọc theo khách hàng.
- **Bước 3:** chặn trùng giữa các phễu.
- **Bước 4:** các nguồn còn lại.

Sau bước B, việc này dễ hơn nhiều, vì mọi chỗ tìm lead đã đi qua cùng một nhóm hàm.

### Bước D: tracking (vừa)

1. Gộp `data` và `event_meta` thành một cột. Chuyển dữ liệu cũ rồi bỏ cột thừa, dự kiến giảm khoảng 40% dung lượng.
2. Thêm bảng `events_daily`, cập nhật mỗi đêm. Báo cáo Tổng quan và Funnels đọc từ bảng này.
3. **Chính sách lưu trữ:** event chi tiết giữ 18 tháng, cũ hơn thì chuyển ra file nén. Cần bạn chốt thời hạn.

### Bước E: mở rộng nghiệp vụ (làm khi có nhu cầu)

1. **`funnels`, `courses`, `products`** vào database. Admin thêm phễu hoặc khóa mới mà không phải sửa code cấu hình.
2. **Đơn hàng:** `funnel_sales` thành `orders` + `order_items` + `payments`. Hỗ trợ nhiều gói, hoàn tiền, và gắn SePay hay cổng thanh toán sau này. Giữ view `funnel_sales` để code cũ chạy tiếp trong lúc chuyển.
3. **`form_responses`** (contact, form, câu trả lời dạng JSON) thay cho `surveys` và khảo sát trong `learning_learners`.
4. **`learning_progress`:** thêm cột thật (`registration_id`, `lesson_id`, `watch_percent`, `completed_at`) bên cạnh JSON, kèm khóa ngoại.

## 6. Thứ tự đề xuất

```
A (dọn dẹp) → B (thôi tải cả bảng) → nhập lead WordPress → C bước 0 → C bước 1–4 → D → E (khi cần)
```

**Vì sao B trước khi nhập lead WordPress:** nhập xong, bảng lead lớn gấp 4,5 lần. Mọi chỗ đang tải cả bảng sẽ chậm và tốn RAM ngay. Bước 0 của lớp khách hàng thì độc lập, làm song song được, miễn n8n đã lọc `is_repeat`.

## 7. Thời hạn lưu và sao lưu: lý do

**Event chi tiết: 18 tháng**
- Báo cáo so cùng kỳ năm trước (Tết, mùa khai giảng) cần ít nhất 13 tháng; thêm vài tháng dự phòng.
- Quảng cáo Meta chỉ ghi nhận chuyển đổi trong 7–28 ngày, nên event chi tiết cũ hơn chỉ còn dùng cho xu hướng. Xu hướng đã có bảng tổng hợp theo ngày, giữ mãi.
- Event chứa IP và phiên truy cập. Nghị định 13/2023 về bảo vệ dữ liệu cá nhân yêu cầu chỉ giữ trong thời gian cần thiết.

**Payload webhook: 30 ngày**
- Payload chỉ dùng để gỡ lỗi lượt gửi thất bại hoặc gửi lại. Lỗi thường được phát hiện trong vài ngày.
- n8n và HubCRM đã giữ dữ liệu này. Bản ở đây chỉ là bản sao thông tin khách, càng giữ lâu càng tăng rủi ro lộ.
- Dòng tóm tắt (lead, thời gian, mã trạng thái, lỗi) thì giữ 12 tháng để đối soát.

**Sao lưu hằng ngày: ưu và nhược**
- Bản `pg_dump` hiện nặng khoảng 16 MB. Giữ 14 ngày tốn khoảng 220 MB, sẽ tăng dần theo dữ liệu.
- Thư mục sao lưu lúc deploy đã chiếm **5,4 GB** (63 bản, phần lớn là bản build Next cũ), trong khi ổ đĩa đã đầy 85%. Nên kèm việc dọn: chỉ giữ 10 bản deploy gần nhất.
- Bản lưu ra ngoài server phải mã hóa, và dùng tài khoản chỉ có quyền ghi vào đúng một thư mục.

## 8. Cần bạn chốt

1. **Nhóm bảng `businesses`, `facebook_pages`, `media_items`, `publish_jobs`, `notifications`:** có còn công cụ nào ngoài hệ thống này dùng không? Nếu không thì sao lưu rồi xóa.
2. **Thời hạn lưu:** event chi tiết bao lâu (đề xuất 18 tháng)? Payload webhook bao lâu (đề xuất 30 ngày)?
3. **Thứ tự** ở mục 6 có ổn không, đặc biệt là làm bước B trước khi nhập lead WordPress?
4. **Sao lưu tự động:** hiện chỉ có bản `pg_dump` lúc deploy. Bạn muốn thêm sao lưu hằng ngày, giữ 14 ngày, kèm một bản ra ngoài server (ví dụ Google Drive) không?
