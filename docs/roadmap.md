# Lộ trình tổng

> Lập ngày 2026-10-22. Đây là bản tổng hợp, nối các kế hoạch chi tiết thành một thứ tự thống nhất.
> Chi tiết của từng phần nằm ở các file riêng:
> - [database-plan.md](database-plan.md): database, bước A–E;
> - [contact-model-plan.md](contact-model-plan.md): lớp khách hàng, bước 0–4, trang "Lead trùng";
> - [attribution-plan.md](attribution-plan.md): First Touch / Last Touch, bước T1–T4.
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
| Server đặt cookie First Touch / Last Touch, sửa lỗi tracker trộn tham số, thu `wbraid`/`gbraid` | attribution T1 |
| Lượt đăng ký lưu First/Last Touch | attribution T2 |
| `/api/register`: cùng email + cùng phễu thì không tạo lead mới, không CAPI, **không webhook**; lưu vào lịch sử lead | contact bước 0 — **xong 22/10** |
| Báo n8n/HubCRM: nhận thêm `ft_*`/`lt_*` | thay đổi webhook của attribution T2 |

### Giai đoạn 2: chịu được dữ liệu lớn

| Việc | Nguồn |
|---|---|
| Thôi tải cả bảng lead (29 chỗ), tìm bằng SQL, danh sách lead phân trang phía server | database bước B |
| Nhập khoảng 18.000 lead WordPress (script đã sẵn, có chạy thử) | WordPress |

### Giai đoạn 3: lớp khách hàng

| Việc | Nguồn |
|---|---|
| Bảng `contacts` chạy song song, gắn mọi lượt đăng ký (kể cả lead WordPress), bản xem trước để duyệt | contact bước 1 |
| Admin và báo cáo đọc theo khách hàng. "Lead trùng" thành "Có thể trùng", có lịch sử gộp và nút tách | contact bước 2 |
| Chặn trùng giữa các phễu và khi đăng ký bằng email khác | contact bước 3 |
| First/Last Touch hiện trong admin, báo cáo chọn được mô hình; tính ở cấp khách hàng | attribution T3–T4 |
| Đăng nhập học viên, API đối tác, Zoom, các script nhập dùng khách hàng | contact bước 4 |

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
