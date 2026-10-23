# Lộ trình tổng

> Lập ngày 2026-10-22. Đây là bản tổng hợp, nối các kế hoạch chi tiết thành một thứ tự thống nhất.
> Chi tiết của từng phần nằm ở các file riêng:
> - [database-plan.md](database-plan.md): database, bước A–E;
> - [contact-model-plan.md](contact-model-plan.md): lớp khách hàng, bước 0–4, trang "Lead trùng";
> - [attribution-plan.md](attribution-plan.md): First Touch / Last Touch, bước T1–T4.
> - [zoom-event-plan.md](zoom-event-plan.md): sự kiện Zoom, bước Z1–Z4.
>
> Việc chuyển WordPress sang hệ thống này nằm ở mục 4 của file này.

## 1. Mục tiêu chung

**Mỗi khách hàng là một hồ sơ duy nhất.** Hồ sơ trả lời được:

- người này là ai;
- đến từ đâu lần đầu, nhờ đâu mà đăng ký;
- đã đăng ký những gì, học tới đâu, mua gì;
- ai đang chăm sóc.

Mọi kênh dùng chung một nguồn dữ liệu: admin, báo cáo, n8n, HubCRM, bot CSKH (API đối tác).

## 2. Mô hình dữ liệu đích

```
KHÁCH HÀNG (contacts) ── định danh (email, SĐT, Zalo, mã HubCRM)
   │  sale, tag, ghi chú, custom field, first_touch, last_touch
   │
   ├─ lượt đăng ký (registrations: mỗi lần gửi form, kèm nguồn của lần đó)
   ├─ học tập (theo từng khóa: ghi danh, tiến độ)
   ├─ Zoom (đăng ký, tham dự)
   ├─ đơn hàng (đơn, sản phẩm, thanh toán)
   └─ câu trả lời form / khảo sát

DANH MỤC: phễu, khóa học, sản phẩm, tag, redirect, webhook, khóa API
NHẬT KÝ (có thời hạn): event tracking (+ bảng tổng hợp ngày), webhook, truy cập API
```

## 3. Nguyên tắc dùng chung cho mọi kế hoạch

1. **Luật nhận diện duy nhất.** Luôn gộp theo email. Gộp theo SĐT chỉ khi tên khớp. Còn lại đưa vào "Có thể trùng". Áp dụng ở mọi chỗ: form, nhập dữ liệu, API đối tác, Zoom, link của bot.
2. **Không xóa, không ghi đè lịch sử.** Lượt đăng ký là bằng chứng. Gộp hay tách chỉ đổi `contact_id`.
3. **Thêm, không đổi.** Webhook và API chỉ thêm trường mới, không đổi trường cũ. n8n, HubCRM và bot được báo trước **một lần cho mỗi đợt thay đổi**.
4. **Dữ liệu cá nhân tối thiểu.** Không để trên URL, không chép sang nhật ký, nhật ký có thời hạn.
5. **An toàn khi triển khai.**
   - Sao lưu hằng ngày (đã chạy).
   - Chạy thử trên bản sao dữ liệu thật.
   - Mỗi bước deploy riêng, có cách quay lại.
   - Chỗ nào xóa dữ liệu thì người dùng duyệt trước.

## 4. Thứ tự triển khai

### Giai đoạn 0: nền móng và chặn rủi ro (đang làm)

| Việc | Trạng thái |
|---|---|
| Sao lưu database hằng ngày (giữ 14 bản) và kéo về máy hằng tuần | **Xong** 22/10 |
| Link tự đăng nhập của bot: server chuyển hướng, không lộ thông tin trên URL | **Xong** 22/10 |
| Đồng bộ 443 người form trading WordPress vào phễu trading | **Xong** 22/10 |
| Database bước A: ghi lại migration đã chạy, dọn bản sao lưu deploy (giữ 5), xóa `dong_tien_*`, thêm ràng buộc, `webhook_logs` không lưu thông tin khách, bỏ index thừa | Đã duyệt, sắp làm |
| **Chặn gộp lead nguy hiểm** ở trang "Lead trùng" (lead có tiến độ học, đơn hàng hoặc thuộc phễu khóa học) | Mới, nhỏ. Làm cùng bước A |

### Giai đoạn 1: thu dữ liệu đúng từ bây giờ (nhỏ, nên làm sớm)

Dữ liệu ghi sai hôm nay thì không sửa lại được về sau, nên làm trước các phần lớn.

| Việc | Nguồn |
|---|---|
| Server đặt cookie First Touch / Last Touch, sửa lỗi tracker trộn tham số, thu `wbraid`/`gbraid` | attribution T1 — **xong 22/10** |
| Lượt đăng ký lưu First/Last Touch; webhook thêm `ft_*`/`lt_*` | attribution T2 — **xong 22/10** |
| `/api/register`: cùng email + cùng phễu thì không tạo lead mới, không CAPI, **không webhook**; lưu vào lịch sử lead | contact bước 0 — **xong 22/10** |
| Báo n8n/HubCRM: nhận thêm `ft_*`/`lt_*` | thay đổi webhook của attribution T2 |

### Giai đoạn 2: chịu được dữ liệu lớn

| Việc | Nguồn |
|---|---|
| Các đường công khai (đăng ký, đăng nhập khóa học, Breakout, API đối tác, Zoom) tìm lead bằng SQL thay vì tải cả bảng | database bước B — **xong 23/10**. Báo cáo admin vẫn đọc danh sách đầy đủ có bộ nhớ đệm (22.771 dòng: 300 ms, +29 MB); làm lại khi chuyển màn hình sang khách hàng (3.2) |
| Nhập lead WordPress | **xong 23/10**: 17.666 lead mới (page `wordpress`, chưa giao sale), 673 lead có sẵn được thêm lịch sử + ghi chú, 359 người form trading đã đồng bộ trước đó. Lead WordPress đăng ký sau 22/10 10:15 sẽ nhập lại trước khi chuyển tên miền (script chạy lại an toàn) |

### Giai đoạn 3: lớp khách hàng

| Việc | Nguồn |
|---|---|
| Bảng `contacts` chạy song song, gắn mọi lượt đăng ký (kể cả lead WordPress), bản xem trước để duyệt | contact bước 1 — **xong 23/10**: 21.464 khách hàng cho 22.773 lead, 346 ca "Có thể trùng", lead mới gắn ngay khi tạo, đối soát mỗi đêm |
| Admin và báo cáo đọc theo khách hàng. "Lead trùng" thành "Có thể trùng", có lịch sử gộp và nút tách | contact bước 2. **3.2a xong trên máy 23/10, chưa deploy**, giao diện theo bản thiết kế đã duyệt: trang Khách hàng (tab xem có số đếm, tìm SĐT/email/tên trên server, lọc Phễu/Sale/Tag/Nguồn, sắp xếp, chọn nhiều để giao sale/gắn tag/xuất CSV, ghi chú ngay trên dòng, thẻ và thanh điều hướng dưới trên điện thoại) và chi tiết khách hàng (dòng thời gian, phễu, học tập, Zoom, đơn hàng, khảo sát, kỹ thuật); khung admin đổi màu theo design system; trang lead cũ đổi tên "Lượt đăng ký". **3.2b xong trên máy 23/10, chưa deploy**: chi tiết phễu theo bản thiết kế (chọn phễu, khoảng thời gian, tab Tổng quan với 5 chỉ số so kỳ trước, đăng ký theo ngày chia người mới/người đã có, nguồn Last/First Touch kèm chi phí/người mới khi khớp được chiến dịch; tab Khách hàng, Nguồn & thiết bị, Hành vi, Học viên, Bài giảng & CTA), cột Người mới ở danh sách phễu, thẻ "Lượt đăng ký theo người" ở Tổng quan; đếm bằng SQL (src/funnelPeople.js) |
| "Có thể trùng": so sánh hai hồ sơ, Gộp / Không phải cùng người / Để sau (phím G, K, S), chọn tên/email/SĐT giữ lại, lịch sử gộp kèm Tách lại, tách lượt đăng ký từ trang khách hàng; quyết định lưu theo cặp lượt đăng ký (migration 017) nên đồng bộ ban đêm không làm mất | 3.3 — **xong trên máy 23/10, chưa deploy** |
| Chặn trùng giữa các phễu và khi đăng ký bằng email khác; webhook thêm `contact_id`, `is_new_contact`, `is_new_funnel`; người đã có giữ sale cũ | 3.4 — **xong trên máy 23/10, chưa deploy** (FACEBOOK_CAPI_TRACKING_WEBHOOK.md §8.3) |
| First/Last Touch hiện trong admin, báo cáo chọn được mô hình; tính ở cấp khách hàng; API đối tác trả `attribution` | 3.5 (attribution T3–T4) — **xong trên máy 23/10, chưa deploy**: trang khách hàng, chi tiết lượt đăng ký (tab Tracking), bảng nguồn của phễu chuyển Last/First Touch, API đối tác `attribution` + `funnels[].last_registered_at`, mục "Thay đổi" trong PARTNER_API.md |
| Đăng nhập học viên, API đối tác, Zoom, các script nhập dùng khách hàng | contact bước 4 |
| Zoom: sự kiện gom buổi, đăng ký và tham dự nối qua khách hàng, /zoom dùng lại cho nhiều sự kiện | 3.6 — **Z1–Z4 xong trên máy 23/10, chưa deploy** ([zoom-event-plan.md](zoom-event-plan.md)) |

### Giai đoạn 4: chuyển tên miền phamthanhbien.com

Làm sau giai đoạn 2, để dữ liệu WordPress đã về hết trước khi tắt WordPress. Không cần chờ giai đoạn 3.

1. Gom 37 chỗ ghi cứng `event.phamthanhbien.com` thành một cấu hình. `event.` tự chuyển 301 sang tên miền chính, giữ nguyên đường dẫn.
2. Tải lại nội dung các trang WordPress mới nhất (`scripts/mirror-wp-pages.cjs`).
3. Nginx và SSL cho `phamthanhbien.com` và `www` (cần quyền root).
4. WordPress đổi địa chỉ sang `old.phamthanhbien.com`.
5. Đổi DNS trên Cloudflare: `@`/`www` → VPS. Giữ nguyên MX (email Google), `short` và `event`.
6. Kiểm tra trang, link rút gọn, form, email; cập nhật Meta, Search Console, n8n, tài liệu API.
7. Theo dõi 404 trong 1–2 tuần, bổ sung redirect còn thiếu, rồi tắt WordPress.

Cookie First/Last Touch ở giai đoạn 1 dùng tên miền `.phamthanhbien.com`, nên vẫn giữ nguyên qua lần chuyển này.

### Giai đoạn 5: mở rộng (khi có nhu cầu)

| Việc | Nguồn |
|---|---|
| Event tracking: một cột JSON, bảng tổng hợp ngày, thời hạn lưu 18 tháng | database bước D |
| Phễu, khóa học, sản phẩm vào database; đơn hàng nhiều gói + thanh toán; câu trả lời form chung | database bước E |
| Link của bot dùng mã ngẫu nhiên, không chứa thông tin khách (cả trong tin nhắn) | API đối tác |
| Các việc đã hoãn: Breakout A6 (trùng giữa phễu) và B6 (nhắc thanh toán qua n8n), tag lớp học HubCRM qua n8n, theo dõi lượt mở link `?email=` | ghi chú các phiên trước |

## 5. Vì sao theo thứ tự này

- **Giai đoạn 1 trước giai đoạn 2–3**, dù nhỏ hơn. Nguồn khách và lượt gửi lại bị ghi sai mỗi ngày, và dữ liệu đã sai thì không lấy lại được. Lớp khách hàng thì làm lúc nào cũng tính lại được từ lịch sử.
- **Giai đoạn 2 trước khi nhập lead WordPress.** Nhập xong, bảng lead lớn gấp 4,5 lần, trong khi 29 chỗ đang tải cả bảng.
- **Nhập lead WordPress trước giai đoạn 3.** Lớp khách hàng gắn lead WordPress như mọi lead khác. Bản xem trước trùng lặp ở bước 1 tính luôn dữ liệu này.
- **Chuyển tên miền tách riêng.** Không phụ thuộc lớp khách hàng, chỉ cần dữ liệu WordPress đã về.
- **Mỗi đợt đổi webhook gom lại một lần**, để người quản lý n8n/HubCRM chỉ phải sửa workflow một lần cho mỗi giai đoạn.

## 6. Những gì cần người khác làm

| Ai | Việc | Khi nào |
|---|---|---|
| Người quản lý n8n / HubCRM | Nhận thêm `ft_*`/`lt_*` (lượt gửi lại không còn được gửi) | Trước attribution T2 |
| Người làm bot CSKH | Sửa 14 lần gọi API bị lỗi 400; sau này đổi sang link mã ngẫu nhiên | Bất kỳ lúc nào / giai đoạn 5 |
| Người có quyền root VPS | Nginx + SSL cho tên miền chính. Tùy chọn: bỏ tham số khỏi log nginx | Giai đoạn 4 |
| Người quản lý Cloudflare | Đổi DNS | Giai đoạn 4 |
| Người quản lý WeGrow | Xác nhận các bảng `businesses`, `facebook_pages`… còn dùng không. Hiện giữ nguyên | Không gấp |
