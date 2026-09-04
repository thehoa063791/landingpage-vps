# Brief Tinh Nang Trang Admin Vinmoc

Cap nhat ngay: 2026-07-27

## 1. Muc Tieu San Pham

Trang admin la dashboard noi bo de doi ngu Vinmoc theo doi hieu qua landing page, quan ly lead, cham soc CRM, dong bo Zoom/webinar, kiem tra campaign, quan ly noi dung va cau hinh cac automation lien quan den sales/marketing.

He thong can phuc vu 2 nhom nguoi dung chinh:

- `admin`: quan ly toan bo module, cau hinh he thong, phan quyen, xoa/merge lead, quan ly tag/custom field/scoring/webhook/CMS/Ads.
- `sale`: tap trung xem va cham soc lead duoc phan cong; cac module quan tri nhay cam bi khoa.

## 2. Tong Quan Dieu Huong

Admin chay tai `/admin` theo dang React SPA, co sidebar, topbar, bo loc ngay/page, refresh, dark/light theme, modal/drawer chi tiet va deep link theo tung module.

Nhom menu hien co:

- Dashboard: Tong quan, Traffic, Hanh vi, Thiet bi & dia ly, Khao sat.
- CRM: Danh sach lead, Lead trung, Zoom, Campaign 14 ngay, Hanh trinh thinh vuong.
- Growth: Ads Performance, CMS Content.
- Settings: Connector, Phan quyen, Quan ly tag, Custom fields, Scoring, Webinar, Webhook.

## 3. Dashboard Analytics

### 3.1. Tong Quan

Man hinh Tong quan giup admin nam nhanh suc khoe funnel cua cac landing page.

Tinh nang chinh:

- Loc theo khoang ngay va `page_id`.
- KPI cards: pageviews, CTA clicks, form opens, conversions, conversion rate, form conversion rate, exit intent.
- Bieu do leads theo ngay.
- Phan bo traffic channel.
- Conversion funnel: pageview -> CTA click -> form open -> conversion.
- Tong ket scroll depth va time on page.
- Xuat CSV cac chi so tong quan.

### 3.2. Traffic

Man hinh Traffic phan tich chat luong nguon truy cap.

Tinh nang chinh:

- Breakdown theo source, medium, channel.
- Bang hieu suat theo visitors, leads, conversion rate.
- Phan bo lead theo khu vuc.
- Dung chung bo loc ngay va page.

### 3.3. Hanh Vi

Man hinh Hanh vi tap trung vao engagement tren landing page.

Tinh nang chinh:

- Scroll depth theo moc 25%, 50%, 75%, 90%.
- Time on page theo cac moc 30s, 1 phut, 2 phut.
- CTA engagement theo vi tri.
- Quality summary: doc content, doc sau, o lai lau, bounce thap.

### 3.4. Thiet Bi & Dia Ly

Man hinh nay giup doc boi canh ky thuat va dia ly cua traffic.

Tinh nang chinh:

- Phan bo device type, browser, operating system.
- Bang country, city, ISP.
- Lead theo region va attendance.
- Dung chung bo loc ngay/page.

### 3.5. Khao Sat

Man hinh Khao sat tong hop cau tra loi survey cua nguoi dang ky.

Tinh nang chinh:

- Tong so phan hoi va so cau da tra loi.
- Breakdown cac cau hoi Q1-Q9.
- Bieu do cho mot so cau hoi dang lua chon.
- Danh sach cau tra loi tu do cho Q8/Q9.
- Insight cards o muc co ban.

## 4. CRM Lead

Lead la doi tuong trung tam cua admin.

### 4.1. Danh Sach Lead

Tinh nang chinh:

- Bang lead phan trang.
- Tim theo email/so dien thoai.
- Loc theo sale phu trach, tag, ngay dang ky, page.
- Advanced filters cho field mac dinh, tag va custom field.
- Tao lead thu cong.
- Xuat CSV theo bo loc hien tai.
- Click vao row de mo popup chi tiet lead.
- Admin co the xoa lead; sale chi thao tac trong pham vi duoc phep.

Cot du lieu chinh:

- Ho ten, SDT, email, page, channel, source/medium, sale phu trach, thoi gian dang ky, tuong tac gan nhat.

### 4.2. Chi Tiet Lead

Popup chi tiet lead gom nhieu tab de cham soc va doi chieu du lieu.

Tab hien co:

- Tong quan: thong tin lien he, page, khu vuc, hinh thuc, channel/source/medium, thiet bi, dia ly.
- CRM: sale phu trach, notes, score, metadata cham soc.
- Forms: du lieu form va cac gia tri bo sung.
- Campaign: thong tin lien quan campaign email.
- Thinh vuong: tien do hoc trong chuoi video.
- Tags: gan/bo tag thu cong.
- Survey: cau tra loi survey cua lead.
- Zoom: lich su tham gia Zoom/webinar.
- Tracking: referrer, click IDs, `_fbc`, `_fbp`, IP, user agent, session.

Hanh dong chinh:

- Gan/doi sale phu trach.
- Sale nhan lead khi duoc phep.
- Them note cham soc.
- Cap nhat custom fields.
- Gan/bo tag.
- Xem checklist tracking/CAPI readiness.
- Mo lead lien quan tu Zoom, Campaign hoac Hanh trinh thinh vuong.

## 5. Lead Trung

Module Lead trung danh cho admin xu ly du lieu bi trung lap.

Tinh nang chinh:

- Quet va liet ke nhom lead trung theo email/phone.
- Tim kiem nhom trung va loc theo loai trung.
- Xem chi tiet cac lead trong mot nhom.
- Chon 2 lead de merge.
- Xem truoc merge, doi lead giu lai, chinh mot so truong ket qua.
- Chuyen du lieu CRM cua lead bi merge sang lead giu lai: notes, tags, custom fields, Zoom attendance.
- Xoa lead trung khi can.
- Mo nhanh chi tiet lead tu bang duplicate.

## 6. Zoom

Module Zoom dung de doi chieu nguoi tham gia webinar voi CRM lead.

Tinh nang chinh:

- Danh sach Zoom meetings/webinars.
- Loc/tim meeting.
- Popup chi tiet meeting.
- Thong ke participants, matched leads, total duration.
- Bang participant voi join time, leave time, duration.
- Hien thi lead da match va sale phu trach.
- Tao/link lead tu participant chua khop.
- Mo chi tiet lead da link.

Phan cau hinh dong bo Zoom nam trong Settings > Connector:

- Kiem tra trang thai ket noi Zoom.
- Lay OAuth URL de connect Zoom.
- Trigger sync.
- Theo doi sync progress/log o muc co ban.

## 7. Campaign 14 Ngay

Module Campaign 14 ngay theo doi hieu qua email automation theo tung stage.

Tinh nang chinh:

- KPI tong: delivery, users, open, click, bounce, open rate, click rate.
- Bang stage gom delivery, open, click, bounce, user count.
- Click user count de mo popup danh sach user trong stage.
- Loc sale trong popup stage.
- Hien thi CRM status va sale phu trach.
- Mo lead CRM neu user da lien ket.
- Xem popup raw detail neu user chua khop CRM.
- Co endpoint lay chi tiet email theo email user.

## 8. Hanh Trinh Thinh Vuong

Module nay theo doi tien do hoc chuoi 7 video va lien ket ve CRM.

Tinh nang chinh:

- KPI tong: hoc vien, phien xem, bai hoc, ti le hoan thanh du chuoi, cau tra loi khao sat.
- Bang tung bai hoc/video voi so nguoi xem va ty le hoan thanh.
- Click bai hoc de xem danh sach hoc vien.
- Popup hoc vien hien thi ten, email, SDT, khu vuc, sale ho tro, tien do xem, trang thai hoan thanh.
- Mo lead CRM neu hoc vien da duoc lien ket.
- Xem chi tiet hoc vien neu chua co lead CRM.

## 9. Ads Performance

Module Ads Performance danh cho admin doc hieu qua quang cao.

Tinh nang chinh:

- Loc theo khoang ngay.
- KPI: spend, results, campaigns, clicks, CPC.
- Top ads/top campaigns.
- Bang campaign voi results va CPR.
- Drill-down campaign de xem ad detail, spend, result, CPR, CTR.
- API ads rieng yeu cau quyen admin.

Ghi chu: Du an con co app `ads-report` rieng cho dashboard Meta Ads chuyen sau; admin hien co entry/session handoff de mo dashboard nay.

## 10. CMS Content

Module CMS Content danh cho admin quan ly noi dung va media.

Tinh nang chinh:

- Media library: xem file, folder, duong dan, type, size.
- Upload media.
- Tao/xoa folder.
- Xoa media.
- Quan ly blog posts.
- Tao/sua/xoa bai blog.
- Truong blog: title, slug, status draft/published, author, cover image, tags, excerpt, content.

## 11. Settings

### 11.1. Connector

Tinh nang chinh:

- Hien thi trang thai ket noi Zoom.
- Connect Zoom qua auth URL.
- Trigger Zoom sync.
- Theo doi sync status/progress va sync logs co ban.

### 11.2. Phan Quyen

Tinh nang chinh:

- Danh sach user CRM.
- Sua ten hien thi.
- Doi role `admin`/`sale`.
- Bat/tat active.
- Cau hinh trong so chia lead cho sale.
- Xem assigned count, target share, actual share.
- Luu cau hinh chia lead.

### 11.3. Quan Ly Tag

Tinh nang chinh:

- Xem danh sach tag category.
- Tao/sua/xoa category.
- Xem danh sach tag, category, so luong lead dang gan.
- Tao/sua/xoa tag.
- Xem people count theo tag.
- Cau hinh page tag mapping.
- Backfill page tags cho lead da co.

### 11.4. Custom Fields

Tinh nang chinh:

- Xem danh sach custom field.
- Tao/sua/xoa custom field.
- Cau hinh label, key, type, group, required, default value, options.
- Ho tro cac kieu text, dropdown, multiselect, boolean, date, currency.
- Custom field duoc dung trong advanced filter va popup lead detail.

### 11.5. Scoring

Tinh nang chinh:

- Xem bang scoring rules.
- Them/sua/xoa rule.
- Cau hinh field, operator, value, points.
- Luu rule vao CRM settings.
- Hien thi score matches trong chi tiet lead.

### 11.6. Webinar

Tinh nang chinh:

- Cau hinh EverWebinar de tao link vao hoc sau khi dang ky.
- Bat/tat tinh nang webinar.
- Cau hinh API key, webinar ID, schedule ID, timezone, timezone ID, date, phone country code.
- Chon link tra ve tu EverWebinar.
- Luu cau hinh vao CRM.

### 11.7. Webhook

Tinh nang chinh:

- Danh sach webhook nhan lead.
- Them/sua webhook.
- Bat/tat active.
- Xoa webhook.
- Xem last status va last error.
- Test webhook thu cong.

## 12. Phan Quyen Va Bao Ve Du Lieu

Nguyen tac hien tai:

- Moi API admin yeu cau dang nhap Supabase/admin session.
- Cac module nhay cam dung `requireRole('admin')`: Lead trung, Ads, CMS/Growth theo UI, Settings, Zoom connector, quan ly user/tag/custom field/scoring/webhook.
- Sale co the xem/cham soc lead trong pham vi duoc gan.
- Xoa lead va merge lead chi danh cho admin.
- Admin cookie handoff duoc dung cho CMS/Ads Report.

Trang thai UI can duoc the hien ro:

- Loading.
- Empty state.
- Error state.
- Forbidden/khong co quyen.
- Confirm delete/merge.
- Toast thanh cong/that bai.
- Drawer/modal co backdrop, nut dong va scroll noi dung.

## 13. API Chinh Dang Duoc Admin Su Dung

Nhom auth:

- `GET /admin/auth/config`
- `POST /admin/auth/login`
- `GET /admin/auth/me`

Nhom analytics:

- `GET /admin/api/:view`
- `GET /admin/survey`

Nhom CRM lead:

- `GET /admin/leads`
- `POST /admin/leads`
- `GET /admin/leads/:id`
- `DELETE /admin/leads/:id`
- `GET /admin/leads/:id/summary`
- `GET /admin/leads/:id/sections/:section`
- `PUT /admin/leads/:id/assignee`
- `POST /admin/leads/:id/notes`
- `PUT /admin/leads/:id/custom-fields`
- `PUT /admin/leads/:id/tags`
- `GET /admin/leads/duplicates`
- `POST /admin/leads/merge`

Nhom campaign/prosperity:

- `GET /admin/campaign/14-days`
- `GET /admin/campaign/14-days/stage/:stage`
- `GET /admin/campaign/email-detail`
- `GET /admin/campaign/lead-summary`
- `GET /admin/prosperity-journey`
- `GET /admin/prosperity-journey/lesson/:lessonId`
- `GET /admin/prosperity-journey/lead-summary`

Nhom Zoom:

- `GET /admin/zoom/auth-url`
- `GET /admin/zoom/status`
- `GET /admin/zoom/sync-status`
- `POST /admin/zoom/sync`
- `GET /admin/zoom/meetings`
- `GET /admin/zoom/meeting-detail`
- `POST /admin/zoom/participants/:attendanceId/create-lead`

Nhom CRM settings:

- `GET /admin/crm/users`
- `PUT /admin/crm/users/:userId`
- `GET /admin/crm/settings`
- `GET /admin/crm/tags`
- `GET /admin/crm/tags/:id/people-count`
- `POST /admin/crm/tags`
- `PUT /admin/crm/tags/:id`
- `DELETE /admin/crm/tags/:id`
- `POST /admin/crm/tag-categories`
- `PUT /admin/crm/tag-categories/:id`
- `DELETE /admin/crm/tag-categories/:id`
- `GET /admin/crm/custom-fields`
- `POST /admin/crm/custom-fields`
- `PUT /admin/crm/custom-fields/:id`
- `DELETE /admin/crm/custom-fields/:id`
- `GET /admin/crm/page-tags`
- `PUT /admin/crm/page-tags/:pageId`
- `POST /admin/crm/page-tags/backfill`
- `PUT /admin/crm/lead-assignment`
- `GET /admin/crm/scoring-rules`
- `PUT /admin/crm/scoring-rules`
- `GET /admin/crm/webinar-settings`
- `PUT /admin/crm/webinar-settings`

Nhom CMS/Webhook/Ads:

- `GET /admin/cms/media`
- `POST /admin/cms/media/upload`
- `POST /admin/cms/media/folder`
- `DELETE /admin/cms/media/folder`
- `DELETE /admin/cms/media`
- `GET /admin/cms/blog`
- `GET /admin/cms/blog/:id`
- `POST /admin/cms/blog`
- `PUT /admin/cms/blog/:id`
- `DELETE /admin/cms/blog/:id`
- `GET /admin/webhooks`
- `POST /admin/webhooks`
- `PUT /admin/webhooks/:id`
- `DELETE /admin/webhooks/:id`
- `POST /admin/webhooks/:id/test`
- `GET /ads/api/kpis`
- `GET /ads/api/top5`
- `GET /ads/api/campaigns`
- `GET /ads/api/campaign/:id/detail`
- `GET /ads/api/demographics`
- `GET /ads/api/daily`

## 14. Uu Tien Cai Tien De Xuat

- Chuan hoa toast va confirm modal cho delete/merge/test webhook.
- Bo sung permission state than thien cho sale khi gap module admin-only.
- Dong bo UI table/filter giua cac module CRM, Campaign, Zoom va Settings.
- Hoan thien preview email campaign va status badge sent/opened/clicked/bounced.
- Cai thien accessibility cua modal: ESC close, focus trap, keyboard navigation.
- Bo sung huong dan reconnect khi Ads Report hoac Zoom connector loi.

## 15. Nguon Tham Chieu

Tai lieu nay duoc tong hop tu:

- `public/admin/react-shell.js`
- `public/admin/FEATURE_PARITY.md`
- `docs/admin-ui-spec.md`
- `src/routes/admin.js`
- `src/routes/cms.js`
- `src/routes/adminWebhooks.js`
- `src/routes/ads.js`
