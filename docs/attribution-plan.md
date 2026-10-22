# Nguồn khách: First Touch và Last Touch cho mỗi contact

> Trạng thái: **đề xuất, chưa làm**. Lập ngày 2026-10-22, dựa trên bài "Mô hình First và Last Touch" (Gemini) và đối chiếu với code hiện tại.
> Liên quan: [contact-model-plan.md](contact-model-plan.md) (lớp khách hàng), [database-plan.md](database-plan.md).

## 1. Hai khái niệm

- **First Touch (FT):** nguồn đưa khách tới **lần đầu tiên**. Dùng để biết kênh nào tìm ra khách mới, ví dụ video quảng cáo, SEO, Zalo.
- **Last Touch (LT):** nguồn **gần nhất trước khi khách đăng ký**. Dùng để biết kênh nào chốt chuyển đổi, ví dụ retargeting, email, bot.

Khoảng cách giữa hai mốc cho thấy hành trình nuôi dưỡng khách. Nên lưu **song song cả hai**, không chọn một. Điểm này bài Gemini nói đúng.

## 2. Hệ thống đang làm thế nào

Mọi trang (landing Express, app khóa học trading/dong-tien, các trang WordPress đã clone) dùng chung `public/js/funnel-tracker.js`:

- **UTM và click ID** được lưu trong `sessionStorage`, tức là **theo từng tab, mất khi đóng tab**.
- **Cookie** chỉ có `_fbc`/`_fbp` (Meta, 90 ngày, đặt bằng JavaScript).
- **Khi đăng ký**, form gửi bộ UTM đang có trong tab. Server lưu vào cột `utm_*` của lượt đăng ký, và lịch sử từng lần gửi form nằm trong `registrations.data.registration_forms`.

**Hệ quả:**

| Vấn đề | Ví dụ |
|---|---|
| **Không có First Touch thật** | Khách bấm quảng cáo Facebook, đóng tab, 3 ngày sau quay lại qua Google rồi đăng ký. Hệ thống chỉ ghi `google`; Facebook mất dấu. |
| **Mất nguồn khi khách quay lại trực tiếp** | Khách bấm quảng cáo, đóng tab, hôm sau gõ thẳng địa chỉ rồi đăng ký. Lead ghi nguồn trống (direct), dù thực tế đến từ quảng cáo. Có thể đây là một phần lý do 11.960/18.698 lead WordPress không có nguồn. |
| **Trộn tham số của hai chiến dịch** | `funnel-tracker` lấy từng tham số riêng lẻ: tham số nào link mới không có thì giữ giá trị cũ. Link mới chỉ có `utm_source=zalo` thì vẫn mang theo `utm_campaign` của quảng cáo trước, tạo ra một bộ nguồn không có thật. Riêng landing richlife có xử lý đúng (`newCampaign`), còn tracker dùng chung thì không. |
| **Thiếu click ID** | Chưa thu `wbraid`/`gbraid` (Google Ads trên iOS). |
| **Cấp contact chưa có nguồn đầu/cuối** | Mỗi lượt đăng ký có nguồn riêng. Chưa có "khách này đến lần đầu từ đâu, chốt nhờ kênh nào". |

## 3. Những chỗ cần điều chỉnh so với bài Gemini

Gemini đưa ra nguyên tắc chung. Áp dụng vào hệ thống này cần sửa 5 điểm:

1. **Vào thẳng trang không được ghi đè Last Touch.** Gemini viết "mỗi lần vào lại thì ghi đè". Nhưng nếu khách vào thẳng (không có UTM, không từ trang ngoài) mà cũng ghi đè, Last Touch sẽ thành "direct" và mất nguồn quảng cáo. Chuẩn chung (Google Analytics cũng làm vậy) là **"last non-direct touch"**: chỉ ghi đè khi lượt vào có UTM, click ID, hoặc đến từ một trang ngoài.
2. **Ghi đè cả bộ, không trộn từng tham số.** Có nguồn mới thì thay **toàn bộ** bộ UTM và click ID, để không xảy ra lỗi trộn chiến dịch ở mục 2.
3. **Cookie đặt bằng JavaScript bị Safari và iPhone giới hạn còn 7 ngày.** Gemini đề xuất cookie First Touch sống 6–12 tháng. Nhưng Safari (cả trình duyệt trong app trên iPhone) xóa cookie do JavaScript đặt sau 7 ngày, và sau 24 giờ nếu link có `fbclid`/`gclid`. **Cookie phải do server đặt** (header `Set-Cookie` từ chính `phamthanhbien.com`). Cách này giống cách vừa làm cho link tự đăng nhập.
4. **Không cần ô ẩn (hidden field) trong form.** Gemini đề xuất thêm các ô `ft_utm_source`, `lt_utm_source`… vào form. Ở đây mọi form gửi về server của mình, nên **server đọc thẳng cookie** khi nhận đăng ký. Không phải sửa từng form, và form mới tự có.
5. **Còn một cấp ở contact.** Cookie chỉ biết trên **một thiết bị**. Khách xem quảng cáo trên điện thoại nhưng đăng ký trên máy tính thì cookie không biết. Lớp khách hàng (contacts) gộp các lượt đăng ký của cùng một người trên nhiều thiết bị. **First Touch của contact = nguồn sớm nhất trong mọi lượt đăng ký của người đó.**

## 4. Thiết kế đề xuất

### 4.1. Một "lượt chạm" (touch) gồm

```json
{
  "source": "facebook", "medium": "cpc", "campaign": "k80", "content": "video2", "term": "",
  "click_ids": { "fbclid": "…", "gclid": "", "wbraid": "", "gbraid": "", "ttclid": "", "msclkid": "", "twclid": "" },
  "landing_path": "/trading",
  "referrer_host": "m.facebook.com",
  "at": "2026-10-22T03:15:00.000Z"
}
```

- **`landing_path` chỉ lưu đường dẫn**, không lưu cả URL. URL có thể chứa email hay SĐT, như link của bot.
- **`referrer_host` chỉ lưu tên miền**, không lưu toàn bộ địa chỉ trang trước đó.
- **Vào thẳng không có UTM** thì không tạo touch mới.

### 4.2. Trên trình duyệt: 2 cookie, do server đặt

| Cookie | Ghi khi nào | Thời hạn |
|---|---|---|
| `ptb_ft` | **Một lần duy nhất**: lượt chạm đầu tiên có nguồn. Đã có thì không bao giờ ghi đè | 12 tháng |
| `ptb_lt` | Mỗi lượt vào có UTM, click ID, hoặc đến từ trang ngoài. **Ghi đè cả bộ** | 90 ngày (bằng thời gian sống của `_fbc` hiện nay) |

- **Tên miền cookie:** `.phamthanhbien.com`, để dùng chung cho `event.` và tên miền chính sau khi chuyển.
- **Server đặt cookie ngay lúc trả trang:** Express (`sendFunnelPage`) cho landing và trang website; Next middleware cho trading và dong-tien.
- **`funnel-tracker.js`** chỉ đọc cookie để gửi kèm event. Thêm `wbraid`/`gbraid` vào danh sách click ID. Sửa lỗi trộn tham số: tracker dùng bộ của `ptb_lt` thay vì ghép từng tham số.
- **Cookie không chứa thông tin cá nhân.**

### 4.3. Trên server: lượt đăng ký

Khi nhận đăng ký (`/api/register`, đăng ký khóa học, form website), server đọc `ptb_ft` và `ptb_lt` từ cookie của request:

- `registrations.first_touch` (JSON): FT trên thiết bị đó.
- `registrations.last_touch` (JSON): LT lúc đăng ký. Không có cookie thì lấy UTM gửi kèm form, như hiện nay.
- **Các cột `utm_*` hiện có vẫn giữ nguyên ý nghĩa** (= Last Touch). Báo cáo, webhook và CAPI đang dùng chúng không bị ảnh hưởng.

### 4.4. Trên server: contact (khi có lớp khách hàng)

| Trường của contact | Cách tính |
|---|---|
| `first_touch` | Touch có `at` **sớm nhất** trong mọi lượt đăng ký của người đó, trên mọi thiết bị. Chỉ đổi khi tìm được touch sớm hơn, ví dụ lúc gộp hai hồ sơ hoặc nhập lead WordPress cũ |
| `first_touch_at` | Thời điểm của touch đó |
| `last_touch` | Touch của **lượt đăng ký gần nhất** |
| `last_touch_at` | Thời điểm của lượt đăng ký đó |
| Lịch sử | Từng lượt đăng ký giữ nguồn riêng (đã có trong `registration_forms`) |

Lead nhập từ WordPress: First Touch lấy theo lần đăng ký đầu tiên trên WordPress. Script nhập đã chọn đúng như vậy.

### 4.5. Gửi ra ngoài

- **Webhook (n8n, HubCRM):** giữ nguyên `utm_*` như hiện nay (= Last Touch). **Thêm** `ft_source`, `ft_medium`, `ft_campaign`, `ft_at`, `lt_source`… để n8n và HubCRM ghi vào hồ sơ. Không đổi trường nào cũ, nên workflow hiện tại vẫn chạy.
- **API đối tác:** thêm `attribution: { first_touch, last_touch }` vào dữ liệu contact. Đây là trường thêm mới, không phá vỡ tương thích.
- **Meta CAPI:** không đổi. Meta tự ghi nhận theo `fbc`/`fbp`.

### 4.6. Báo cáo admin

- **Funnels và Tổng quan:** thêm nút chọn mô hình **Last Touch** (mặc định, như hiện nay) hoặc **First Touch**.
- **Chi tiết lead:** hiện hai dòng "Đến lần đầu từ: Facebook / k80 (12/09)" và "Đăng ký nhờ: Zalo / bot (20/10)".

## 5. Các bước

| Bước | Việc | Phụ thuộc |
|---|---|---|
| T1 | Server đặt cookie `ptb_ft`/`ptb_lt` (Express + Next middleware); `funnel-tracker` đọc cookie, thêm `wbraid`/`gbraid`, sửa lỗi trộn tham số | Không. Làm được ngay |
| T2 | Lượt đăng ký lưu `first_touch`/`last_touch` (migration thêm 2 cột JSON); webhook thêm `ft_*`/`lt_*` | T1. Báo trước cho người quản lý n8n/HubCRM về trường mới |
| T3 | Chi tiết lead hiện FT/LT; báo cáo có nút chọn mô hình | T2 |
| T4 | Tính FT/LT ở cấp contact; API đối tác trả `attribution` | Lớp khách hàng (contact-model-plan bước 1) |

**Lưu ý:** dữ liệu cũ không có First Touch thật. Với lead cũ, FT tạm lấy bằng nguồn của lượt đăng ký sớm nhất. Báo cáo theo First Touch chỉ chính xác dần, kể từ ngày T1 lên production.

## 6. Cần chốt

1. **Thời hạn cookie:** First Touch 12 tháng và Last Touch 90 ngày có hợp với chu kỳ bán hàng không? Khóa có phí thường cần lâu hơn khóa miễn phí.
2. **Webhook:** đồng ý thêm `ft_*`/`lt_*` vào payload gửi n8n và HubCRM không? Người quản lý workflow cần biết để map trường.
3. **Thứ tự:** làm T1–T2 sau bước A, và trước bước B của database-plan được không? T1–T2 nhỏ, và làm càng sớm thì dữ liệu First Touch càng đầy đủ.
