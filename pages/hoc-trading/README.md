# Học nghề Trading

- `/hoc-trading` và `/p/hoc-trading/`: `home.html`.
- `/thank-you-hoc-trading` và `/hoc-trading/thank-you`: `register-sucess.html`.
- Asset dùng đường dẫn tuyệt đối `/p/hoc-trading/` để hoạt động trên cả URL có và không có dấu `/` cuối.
- `boot.js` nạp React 18.3.1 từ `vendor/`, rồi khởi động runtime `support.js`. Không phụ thuộc CDN để render trang. Giấy phép React được giữ trong `vendor/`.
- Preview qua `file://` hoặc `/pages/hoc-trading/home.html` tự chuyển đường dẫn asset về thư mục HTML; không gửi tracking/đăng ký thật. Gửi form trên route `/hoc-trading` của ứng dụng.
- Binding động dùng `sc-camel-style`, `sc-camel-on-click`, `sc-camel-on-mouse-enter`… theo cơ chế `CAMEL_ATTR` có sẵn trong runtime. Không đặt `{{ ... }}` vào `style` hoặc thuộc tính sự kiện HTML thuần vì VS Code sẽ phân tích chúng như CSS/JavaScript. Không tắt validation của IDE.

## Đăng ký và tracking

`registration.js` gửi họ tên, điện thoại, email, `page_id: hoc-trading`, session, UTM, click IDs và cookies qua `/api/register`. API hiện có lưu lead/CRM, gắn tag, ghi conversion, gọi webhook và Meta CAPI. Chỉ chuyển trang khi API xác nhận thành công. Chặn gửi liên tiếp, hiển thị lỗi và xử lý timeout.

`tracking.js` theo cùng cơ chế Richlife: PageView, mở form, gửi form, CTA, mốc cuộn 25/50/75/100%. Pixel dùng `/api/meta-config`; CompleteRegistration dùng event ID của bản ghi trên server để dedup CAPI. Không gửi thêm server conversion từ frontend. Retry Pixel ở trang cảm ơn, không bắn lại khi refresh. Giữ GTM `GTM-KBK3JQ3` từ trang cũ; cấu hình tag trong GTM cần tránh tự bắn thêm các Pixel event do mã trang đã quản lý.

Thông tin xác nhận được giữ trong sessionStorage của tab tối đa 24 giờ để hiển thị trên trang cảm ơn, không đưa PII lên URL. Bản ghi chính nằm ở backend; sessionStorage không phải xác nhận thanh toán. Giá trị conversion là 0 VND cho đăng ký, không phát Purchase.

## Nội dung cần hoàn thiện trước khi công khai

Trang cảm ơn đã bỏ biên nhận/mã đơn/trạng thái thanh toán, dùng hotline và Zalo 0862421919. Bản HTML còn placeholder lịch khai giảng và một số FAQ/chính sách. Không tích hợp thanh toán/cấp quyền học tự động.

## Kiểm tra

```sh
node scripts/test-hoc-trading-tracking.cjs
node scripts/test-hoc-trading-registration.cjs
# Cần jsdom@26.1.0 trong HOC_TEST_NODE_MODULES hoặc thư mục tạm hoc-trading-runtime-check/node_modules.
node scripts/test-hoc-trading-runtime.cjs
```

Các kiểm tra dùng mock để không ghi lead giả hoặc gửi event thật tới Meta/webhook. Cần kiểm tra tiếp trên trình duyệt và Meta Test Events khi triển khai với cấu hình thực tế.
