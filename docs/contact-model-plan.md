# Một người là một lead: kế hoạch lớp khách hàng (contacts)

> Trạng thái: **đã chốt hướng, chưa làm**. Lập ngày 2026-10-21, cập nhật 2026-10-22: thêm số liệu mới, bước 0, và nhập lead WordPress.
> Hướng đã chọn là thêm một lớp khách hàng. Phương án "gộp dòng lead" đã bị loại (lý do ở mục 3).

## 1. Vấn đề

Mỗi lần gửi form tạo ra một dòng trong `registrations`, và mỗi dòng là một lead trong admin. Hai nhóm phễu xử lý khác nhau:

- **trading, dong-tien** (phễu có khóa học): cùng email gửi lại thì không tạo lead mới. Landing báo "Email này đã được đăng ký" và có nút đăng nhập. Nhưng nếu người đó đăng ký lại bằng **email khác** thì vẫn tạo lead mới.
- **Breakout** (phễu thu phí): cùng email gửi lại thì không tạo lead mới, không gửi webhook (từ 22/10).
- **Các landing khác** (richlife các bản, richlife-bni, richlife-live, zoom-event, `/api/register` trong `src/routes/api.js`): không kiểm tra gì, lần gửi nào cũng tạo lead mới.

Mỗi lead trùng gây ra bốn hậu quả:

1. Hệ thống chia sale lại theo vòng, nên cùng một người có thể bị 2–3 sale gọi.
2. Meta CAPI nhận thêm một chuyển đổi, làm sai số liệu tối ưu quảng cáo.
3. Webhook bắn `new_registration` lại, nên n8n và HubCRM nhận cùng một người nhiều lần.
4. Báo cáo đếm số lượt gửi form chứ không đếm số người.

Ngoài ra, SĐT đang lưu lẫn hai dạng `+84…` và `0…`.

### Số liệu production ngày 2026-10-22 (truy vấn chỉ đọc)

**Lead trong CRM**

| | Số lượng |
|---|---|
| Dòng lead | 4.666 |
| Người, tính theo email (hoặc SĐT nếu không có email) | 4.103 (dư khoảng 560 dòng) |
| trading: trùng email trong phễu | 0 |
| trading: cùng SĐT và tên, khác email | 1 người |
| dong-tien: cùng SĐT và tên, khác email | 2 người |
| Người có lead ở phễu khác nữa | trading 24 người, dong-tien 195 người |

**Webhook `new_registration`** (bảng `webhook_logs`, từ 04/08 đến 22/10/2026)

| | Số lượng |
|---|---|
| Lượt gửi | 1.038 |
| Cùng một người, cùng phễu, nhận từ 2 lần trở lên | 76 người, **144 lượt thừa** |
| Phân bố lượt thừa | richlife-v2 62, richlife-live 43, richlife-short 15, richlife-medium 11, richlife-bni 8, richlife 5. Khoảng 1/3 gửi lại trong vòng 1 giờ |
| trading | 97 lượt cho 97 lead. Không lượt nào bắn lại cho cùng một lead |
| Một lượt đăng ký gửi tới 2 webhook | 278 lượt, trong khoảng 17/09–05/10, khi cả webhook `n8n` (automation.vinmoc.com) lẫn `n8n hubcrm` (n8n.hubcrm.vn) cùng bật. Từ 05/10 chỉ còn `n8n hubcrm` |

**Kết luận:** n8n nhận cùng một người nhiều lần vì ba lý do:

1. **Gửi lại form ở các landing richlife.** Đây là nguyên nhân chính, và `/api/register` không chặn.
2. **Một người đăng ký nhiều phễu**, ví dụ trading và dong-tien hoặc richlife. Mỗi phễu bắn một `new_registration` riêng.
3. **Hai webhook cùng bật** trong khoảng 17/09–05/10. Hiện đã hết.

Trong phễu trading, các lượt n8n thấy "trùng" là người đăng ký phễu khác nữa, hoặc đăng ký lại bằng email khác.

## 2. Quyết định đã chốt với người dùng

- **Mỗi người chỉ có một lead, dù đăng ký bao nhiêu phễu.**
- **Gửi lại form ở cùng phễu:** ban đầu chốt bắn webhook kèm `is_repeat`; ngày 22/10 đổi thành **không gửi webhook**, chỉ lưu lịch sử (xem dưới).
- **Lead đã trùng sẵn:** gộp hàng loạt. Phải chạy thử để người dùng xem trước, và sao lưu trước khi chạy thật.
- **Lead từ WordPress cũ** (18.698 người sau khi lọc): nhập với page `wordpress` và tag "Nhập từ WordPress", không chia sale. Script nhập đã đối chiếu với CRM theo cùng luật nhận diện bên dưới (`scripts/wp-leads.cjs`).

**Chốt thêm ngày 2026-10-22:**

1. **Lượt gửi lại ở cùng phễu:** tạm thời **không gửi webhook**, chỉ lưu vào lịch sử form của lead. Không cần sửa workflow n8n. Breakout cũng bỏ webhook `is_repeat`. Sau này muốn báo sale "khách quan tâm lại" thì bật lại kèm cờ `is_repeat`.
2. **Người đã có lead đăng ký phễu mới:** giữ sale cũ.
3. **Đăng ký trading hoặc dong-tien lại bằng email khác** (cùng SĐT và tên): cho đăng ký bằng email mới, gắn chung một khách hàng. Tiến độ học tách theo email.

**Đã làm ngày 2026-10-22:** 443 người đăng ký form `trading-free` trên phamthanhbien.com/trading (25/09–16/10/2026) được đồng bộ vào phễu trading (`scripts/wp-leads.cjs sync-funnel`), để họ đăng nhập được thay vì phải đăng ký lại.
- 424 lead mới, giữ ngày đăng ký gốc. 111 lead lấy sale của lead ở phễu khác, 313 lead chưa giao.
- 19 người đã đăng ký lại: thêm lịch sử và ghi chú.
- Không bắn webhook hay CAPI.

## 3. Thiết kế: tách "người" khỏi "lượt đăng ký"

```
KHÁCH HÀNG (contacts)               1 người = 1 dòng; sale, tag, ghi chú, custom field nằm ở đây
  ├─ ĐỊNH DANH (contact_identities)    email · SĐT chuẩn hóa · Zalo/Messenger ID · mã HubCRM · mã Ebila
  └─ HOẠT ĐỘNG (dữ liệu hiện có, gắn thêm contact_id)
       ├─ lượt đăng ký form (registrations: theo phễu, theo từng lần)
       ├─ tham dự Zoom, tiến độ học, đơn hàng, sự kiện tracking
       └─ hội thoại bot (sau này)
```

- **`registrations` giữ nguyên, đóng vai lịch sử "lượt đăng ký"**, chỉ thêm cột `contact_id`.
  - Không xóa, không ghi đè dòng nào.
  - Gộp nhầm thì tách lại được, chỉ cần đổi `contact_id`.
  - Tiến độ học, Zoom, đơn hàng, events vẫn trỏ vào lượt đăng ký như cũ, không phải chuyển bảng.
- **Phương án "gộp dòng" bị loại** vì ba lý do:
  - Phải xóa hoặc ghi đè khoảng 560 dòng.
  - Phải chuyển dữ liệu của từng bảng sang dòng giữ lại. `mergeRegistrations` hiện có chưa chuyển `learning_progress`, `learning_learners`, đơn hàng, `zoom_event_registrations` và `registration_id` trong events.
  - Mỗi khi có nguồn mới lại phát sinh trùng.
- **Luật nhận diện dùng lại của API đối tác** (`src/partner/contacts.js`), giống `scripts/wp-leads.cjs`: luôn gộp theo email; gộp theo SĐT chỉ khi tên khớp.

| Độ chắc chắn | Ví dụ | Xử lý |
|---|---|---|
| Chắc chắn | Trùng email (không phân biệt hoa thường, dấu cách) | Tự gộp |
| Gần chắc | Trùng SĐT sau chuẩn hóa và tên khớp | Tự gộp |
| Chưa chắc | Trùng SĐT nhưng tên khác (vợ chồng dùng chung số, đăng ký hộ) | Không gộp. Đưa vào danh sách "Có thể trùng" để sale duyệt. Nâng cấp trang "Lead trùng" hiện có cho việc này |

### Hành vi sau khi làm xong

**Gửi form:** hệ thống tìm khách hàng theo luật ở trên.

| Trường hợp | Lead / lượt đăng ký | Sale | CAPI | Webhook |
|---|---|---|---|---|
| Người mới | Tạo khách hàng và lượt đăng ký | Chia theo vòng | Gửi | `new_registration` |
| Đã có, phễu mới với người đó | Thêm lượt đăng ký, tag phễu | Giữ sale cũ (chờ chốt) | Gửi một lần cho phễu này | `new_registration` kèm `is_new_funnel=true`, `contact_id` |
| Đã có, cùng phễu | Chỉ lưu thêm lượt đăng ký vào lịch sử | Giữ | **Không gửi** | **Không gửi** (chỉ lưu lịch sử) |

**Các màn hình và module khác:**

- **Danh sách lead:** mỗi người một dòng. Cột Page hiện mọi phễu người đó tham gia. Bộ lọc Page lọc theo các phễu ấy.
- **Chi tiết lead:** một dòng thời gian chung gồm form, Zoom, tiến độ học, đơn hàng và ghi chú.
- **Báo cáo Funnels và Tổng quan:** đếm số khách hàng khác nhau trong mỗi phễu. Vẫn giữ được số lượt đăng ký nếu cần.
- **Trading, dong-tien:** đăng nhập theo khách hàng, kiểm tra người đó đã đăng ký phễu này chưa. Tiến độ học vẫn tách theo từng khóa.
- **API đối tác:** `contact_id` lấy từ bảng khách hàng. Mã bot đang dùng phải tiếp tục chạy (cơ chế alias đã có). `PARTNER_ID_SECRET` không đổi.
- **SĐT:** chuẩn hóa thành `0…` khi lưu.

## 4. Các bước triển khai

Mỗi bước deploy riêng, có test và sao lưu. Chỉ đụng tới production khi người dùng đồng ý.

### Bước 0: chặn gửi lại cùng phễu ở `/api/register` (nhỏ, làm được ngay)

Sửa đúng nguyên nhân của 144 lượt webhook thừa, chưa cần bảng mới. Cách làm giống Breakout:

- **Cùng email và cùng `page_id` đã có lead:**
  - Không tạo lead mới. Thêm lần gửi vào lịch sử form của lead cũ (`appendRegistrationForm`, không ghi đè thông tin).
  - Không chia sale lại, không gửi CAPI.
  - Webhook: **không gửi** (quyết định 22/10). Lượt gửi lại chỉ nằm trong lịch sử form của lead.
  - Trang thank-you hiện như bình thường.
- **Email khác, hoặc phễu khác:** giữ như hiện nay. Phần này để bước 3 xử lý.
- **Trạng thái:** đã làm ngày 22/10 (`findRegistrationInPage` + `appendRegistrationForm` trong `/api/register`). Không cần sửa n8n.
- **Test:** form website gửi 2 lần cùng email → 1 lead, 1 CAPI, 1 webhook, lần sau vào lịch sử (`scripts/test-website-pages.cjs`); Breakout lặp lại không bắn webhook (`scripts/test-breakout.cjs`).

### Bước 1: chạy song song, chưa đổi giao diện hay báo cáo

- Thêm migration cho `contacts`, `contact_identities` và cột `registrations.contact_id`.
- Chạy nhận diện cho toàn bộ dữ liệu cũ, dự kiến khoảng 4.100 khách hàng; thêm khoảng 18.700 nếu đã nhập lead WordPress.
- Gắn khách hàng cho mọi lượt đăng ký mới (`/api/register`, `learningService.register`, Zoom, import).
- Gửi người dùng bản xem trước để duyệt: số người được gộp, các trường hợp "chưa chắc", vài ví dụ đã ẩn email. Chạy trên bản sao dữ liệu thật trong PGlite trước, chỉ đọc.

### Bước 2: chuyển màn hình sang lớp mới

- Danh sách lead, chi tiết lead, Funnels và Tổng quan đọc theo khách hàng.
- Sale, tag, ghi chú, custom field chuyển lên cấp khách hàng:
  - tag lấy hợp của các lượt;
  - ghi chú lấy hết;
  - sale lấy của lượt đăng ký sớm nhất. Trường hợp xung đột lập danh sách để người dùng quyết định.

### Bước 3: chặn trùng theo khách hàng khi gửi form

- Mở rộng bước 0 sang khác phễu và khác email (SĐT + tên), theo bảng "Hành vi" ở trên.
- Cập nhật `/api/register` và `learningService.register`. CAPI, webhook và chia sale chạy theo luật mới.

### Bước 4: các nguồn còn lại tìm theo khách hàng

Đăng nhập học viên, API đối tác, Zoom (`lead_zoom_attendances`, `zoom_event_registrations`), `scripts/import-ebila-learners.js`, `scripts/wp-leads.cjs`, link tự đăng nhập của bot.

### Thứ tự với việc nhập lead WordPress

Script nhập đã tự đối chiếu với CRM, nên không tạo thêm lead trùng. Có thể nhập **trước** bước 1; khi đó bước 1 tự gắn các lead này vào khách hàng như mọi dòng khác. Nhập trước còn có lợi: bản xem trước ở bước 1 tính luôn cả dữ liệu WordPress.

## 5. Trang "Lead trùng" hiện có: giữ, nhưng đổi vai trò

### Trang đang làm gì

Code ở `DuplicatesPage` (`src/admin/app.js`), `buildDuplicateLeadGroups` (`src/routes/admin.js`), `mergeRegistrations` (`src/storage.js`).

- **Gom nhóm:** trùng email **hoặc** trùng SĐT. Không xét tên.
- **Gộp:** mỗi lần 2 lead.
  - Gợi ý lead giữ lại theo điểm: có sale +10, rồi cộng số ghi chú, tag, custom field, lượt dự Zoom.
  - Cho chọn từng trường (tên, SĐT, email, page, nguồn) của lead nào được giữ.
- **Kết quả gộp:**
  - Chuyển ghi chú, tag, custom field, lượt dự Zoom, khảo sát sang lead giữ lại.
  - Thêm ghi chú "Đã merge…".
  - Rồi **xóa hẳn** lead kia.
- **Lịch sử:** từ trước đến nay có 13 lần gộp, đều trong tháng 7/2026 (30s, zoom, dongtien-ver2, trading-mastery-workshop). Chưa lần nào đụng tới trading hay dong-tien hiện nay.

### Rủi ro hiện tại (nên chặn ngay, trước khi có lớp khách hàng)

Gộp một lead **trading hoặc dong-tien** vào lead của phễu khác:

- **Mất tiến độ học.** Lead bị xóa kéo theo `learning_learners` (ràng buộc xóa dây chuyền), còn tiến độ học thành mồ côi.
- **Không đăng nhập được khóa học.** Trường `page_id` có thể bị ghi đè bằng phễu của lead kia.
- **Mồ côi đơn hàng và đăng ký Zoom:** đơn hàng (`funnel_sales`), đăng ký sự kiện Zoom và `registration_id` trong events đều không được chuyển sang.

**Cách chặn tạm:** server từ chối gộp khi một trong hai lead có tiến độ học, có đơn hàng, hoặc thuộc phễu khóa học. Màn hình gộp ghi rõ lý do.

### Học được gì cho lớp khách hàng

| Từ trang "Lead trùng" | Dùng lại trong kế hoạch |
|---|---|
| Điểm chọn lead giữ lại (sale, ghi chú, tag, Zoom) | Chọn **sale và thông tin chính** của khách hàng khi gộp hai khách hàng |
| Chọn từng trường của bên nào | Màn hình duyệt "Có thể trùng" và sửa thông tin chính của khách hàng (tên, email, SĐT chính) |
| Ghi chú "Đã merge" | Bảng `contact_merges` lưu ai gộp, khi nào, gộp gì, để **tách lại được** |
| Gom theo SĐT mà không xét tên → gộp nhầm người nhà | Luật nhận diện: SĐT chỉ tự gộp khi tên khớp; khác tên thì đưa vào hàng chờ duyệt |
| Gộp bằng cách xóa dòng và chuyển từng bảng | Không xóa gì. Chỉ gắn `contact_id`. Tách lại = đổi `contact_id` |
| Đọc toàn bộ bảng lead để tìm trùng | Truy vấn SQL theo `contact_identities` (database-plan bước B) |

### Sau khi có lớp khách hàng

- **Trùng chắc chắn** (cùng email; cùng SĐT và tên khớp): hệ thống tự gộp vào một khách hàng. **Không còn xuất hiện** trong trang này.
- Trang đổi thành **"Có thể trùng"**, chỉ chứa các trường hợp chưa chắc:
  - cùng SĐT nhưng khác tên;
  - email gần giống (`gmail.con`);
  - tên giống và cùng tỉnh…

  Thao tác:
  - **Gộp:** chọn trường như hiện nay, nhưng không xóa gì.
  - **Không phải cùng người:** ghi nhớ, không hỏi lại.
- Thêm **Lịch sử gộp** và nút **Tách**.

## 6. Rủi ro cần kiểm soát

- **Số liệu báo cáo cũ sẽ thay đổi**, vì chuyển từ đếm lượt sang đếm người. Cần báo trước cho người xem báo cáo.
- **n8n và HubCRM** nhận cờ mới (`is_repeat`, `is_new_funnel`, `contact_id`). Workflow chưa xử lý cờ thì vẫn chạy như cũ, chỉ không biết đó là lượt lặp. Cần thống nhất trước.
- **`contact_id` của API đối tác** phải giữ ổn định. Test kỹ alias.
- **Sale đang chăm sóc nhiều lượt của cùng một người** sẽ chỉ còn một chủ khi lên cấp khách hàng. Cần danh sách các trường hợp xung đột để người dùng quyết định.
- **Bước 1 nên chạy với dữ liệu thật ở chế độ chỉ đọc trước**, như các lần đối chiếu trước đây trên PGlite.
