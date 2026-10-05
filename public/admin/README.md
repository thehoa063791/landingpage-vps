# Admin React Structure

`/admin` is now a React-rendered admin surface for CRM, Ads, and CMS.

## Entry

- `../admin.html`: main React entry.
- `react-shell.css` and `react-shell.js`: generated deployment assets. Do not edit them directly.
- `../../src/admin/app.js`: React pages, routing, existing API integration and common table.
- `../../src/admin/styles.css`: canonical styles; one selector definition per viewport context.
- `../../src/admin/ui.js`: Base UI Select/Dialog, feedback host, MoneyInput, SaveBar, Page and EmptyState.
- `../../src/admin/chart.js`: Recharts, ChartContainer, tooltip, accessible table view and separate Ads money/count charts.
- `fonts/`: bundled Inter variable font, including Vietnamese; no runtime CDN dependency.

## UI Layer

The admin uses an esbuild bundle served by the existing Express setup. Components follow the local Polaris/shadcn design rules in `design-system/CLAUDE.md` and `design-system/docs/ui.md`, with Base UI primitives and locally owned CSS instead of adding a Tailwind/Next runtime.

- Tokens follow common shadcn naming: `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--ring`.
- Page components fetch the existing Express APIs directly.
- Update the existing component/style definition instead of appending overrides. Preserve stored column keys, API payloads and role checks.

## Build and verification

```sh
npm ci
npm run build:admin
npx playwright install chromium
npm run test:admin
```

Deployment assets are committed, so serving `/admin` does not require a development server. Build again whenever source files change. The preview server on port 4173 serves static assets only; Playwright intercepts API calls with fixtures and never writes production data.

Design checks reject repeated selectors/declarations, text below 12px, native selects/dialogs and Chart.js/donut usage. Browser checks cover 18 menu screens in both themes, primary action count, lead detail deep links, filters, column dialog, money payloads, dirty form navigation, confirmations, errors and sale restrictions.

## React Modules

- Dashboard: overview, traffic, behavior, devices.
- CRM: leads, survey, campaign, duplicates, Zoom meetings, settings.
- Ads: fetches `/ads/api/*` directly from React.
- CMS: fetches `/admin/cms/*` directly from React.

## Old Backup

The previous static admin files are kept only as a backup while React reaches full feature parity. They are not used by the `/admin` runtime.

## Feature Parity

- `FEATURE_PARITY.md` is the migration source of truth.
- Before changing a React admin tab, check the matching section in `FEATURE_PARITY.md`.
- Do not remove or simplify a legacy-backed behavior unless the checklist says it is intentionally dropped.
- After implementing a feature, update the checklist from `[ ]` or `[~]` to `[x]`.

## Next Steps

1. Work through `FEATURE_PARITY.md` in migration order.
2. Expand each React page until every drawer, modal, and action from the old admin is covered.
3. Split data hooks by domain: CRM, Ads, CMS, settings.
4. Keep UI changes in `src/admin`, rebuild the generated assets and run `test:admin`.
5. Remove the old backup files only after `FEATURE_PARITY.md` is complete.

## Dữ liệu demo

Chọn **Dữ liệu demo** trên thanh đầu trang, **Xem dữ liệu demo** tại màn hình đăng nhập, hoặc mở `/admin/view/overview?demo=1`.

Demo có dashboard, 24 lead với tương tác, tag, trường tùy chỉnh và đơn hàng; cùng funnel, Zoom, khảo sát, Ads, thư viện media và dữ liệu cài đặt. `src/admin/demo.js` tạo dữ liệu giả trong trình duyệt, không gọi API hoặc ghi vào cơ sở dữ liệu. Các thay đổi được đặt lại khi tải lại trang. Chọn **Thoát demo** để quay về phiên đăng nhập thật. Chế độ demo được nhớ trong localStorage và có nhãn riêng trên mọi trang.

Các trang dashboard, báo cáo và danh sách dùng `Page width="full"`, chung lề 24px; Connector/Webinar dùng cùng `width="full"` với các tab Settings còn lại. Không thêm CSS ghi đè theo từng module. Demo truy cập có 30 ngày cho ba landing page, biểu đồ theo ngày/theo trang, lọc theo page và khoảng ngày; mở chế độ demo để xem số liệu minh họa.

Dashboard chỉ còn Tổng quan và Funnels. Chi tiết funnel có các tab Tổng quan, Traffic, Hành vi, Thiết bị & địa lý, Khảo sát; API nhận page của funnel và khoảng ngày chung. Tab và ngày được lưu trong URL để tải lại/chia sẻ. Khảo sát lọc theo page_id và submitted_at; interest lọc trên đăng ký cùng page và khoảng ngày.

Khảo sát chỉ hiển thị trong chi tiết lead. Các funnel còn bốn tab: Tổng quan, Traffic, Hành vi, Thiết bị & địa lý; liên kết cũ section=survey trở về Tổng quan.

Màu trạng thái: active/hoàn thành/thành công dùng success; tạm dừng dùng warning; đang học/thông tin dùng info; lỗi/xóa/thất bại dùng critical; lưu trữ dùng neutral. Dark theme có surface/text/fill riêng. Biểu đồ dùng token chart: chi tiêu cam nét đứt, doanh thu xanh ngọc nét liền; chú giải luôn hiển thị cùng Xem bảng. Không dùng màu trạng thái để tô KPI chỉ nhằm gây chú ý.
