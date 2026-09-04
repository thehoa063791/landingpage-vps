# Vinmoc Admin UI Spec

Tai lieu nay tong hop cac man hinh, thong so hien thi, filter, action va quan he du lieu cua trang admin hien tai de gui cho doi thiet ke giao dien.

## Nguon Doc

- `public/admin/react-shell.js`: giao dien admin React hien tai.
- `src/routes/admin.js`: API admin CRM, dashboard, Zoom, campaign, settings.
- `src/routes/cms.js`: API CMS media va blog.
- `data/crm_supabase_migration.sql`: schema CRM, tags, custom fields, Zoom.

## 1. Tong Quan Shell Admin

Admin la SPA React tai `/admin`, co dang dashboard noi bo gom sidebar, topbar, noi dung chinh va cac drawer/modal.

### Nhom Menu

Dashboard:
- Tong quan
- Traffic
- Hanh vi
- Thiet bi & dia ly
- Khao sat

CRM:
- Danh sach lead
- Lead trung
- Zoom
- Campaign 14 days

Growth:
- Ads Performance
- Ads Report App
- CMS Content

Settings:
- Connector
- Phan quyen
- Quan ly tag
- Custom fields
- Scoring
- Webhook

### Quyen Truy Cap

- `admin`: thay va thao tac tat ca module.
- `sale`: bi khoa cac module admin-only nhu Lead trung, Ads, CMS, Settings.
- Sale chi duoc thao tac tren lead duoc phan cong.
- Note cua lead chi sale phu trach moi duoc ghi.
- Xoa lead, quan ly user, tag, custom field, scoring, webhook can quyen admin.

### Trang Thai UI Can Co

- Loading
- Empty state
- Error state
- Forbidden / khong co quyen
- Confirm delete / confirm merge
- Toast thanh cong / that bai
- Drawer co nut dong va backdrop
- Dark/light theme

## 2. Dashboard

Ap dung cho cac view: Tong quan, Traffic, Hanh vi, Thiet bi & dia ly.

### Bo Loc Chung

- Tu ngay: `dateFrom`
- Den ngay: `dateTo`
- Page ID: `page_id`
- Xoa loc
- Refresh

### KPI Tong Quan

- Pageviews
- CTA clicks
- Form opens
- Conversions
- Conversion rate
- Form conversion rate
- Exit intent

### Tong Quan

Bieu do / block:
- Leads 14 ngay gan nhat
- Kenh truy cap
- Leads 14 ngay
- Traffic channel
- CTA by position
- Scroll depth
- Conversion funnel
- Time on page

Funnel:
- Pageviews
- CTA clicks
- Form opens
- Conversions
- Ti le mat o tung buoc

Scroll depth:
- 25%
- 50%
- 75%
- 90%

### Traffic

Thong so:
- Traffic source
- Traffic medium
- Traffic channel
- Leads by region

Bang hieu suat:
- Theo channel
- Theo source
- Theo medium

Cot bang hieu suat:
- Ten
- Visitors
- Leads
- Conversion rate

### Hanh Vi

Thong so:
- Scroll depth chart
- Time on page chart
- Scroll depth sessions
- Time on page
- CTA by position

Quality summary:
- Bounce thap: scroll >=25%
- Doc content: scroll >=75%
- Doc sau: scroll >=90%
- O lai >=30s
- O lai >=1p
- O lai >=2p

### Thiet Bi & Dia Ly

Thong so:
- Device type
- Browser
- Operating system
- Country
- City
- ISP
- Leads by region
- Attendance

## 3. CRM Lead

Lead la doi tuong trung tam cua admin.

### Truong Lead Chinh

- `id`
- `name`
- `phone`
- `email`
- `page_id`
- `region`
- `attendance`
- `interest`
- `registered_at`
- `last_interaction_at`
- `assigned_to`
- `assigned_at`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `referrer`
- `fbclid`
- `gclid`
- `ttclid`
- `msclkid`
- `twclid`
- `fbc`
- `fbp`
- `ga`
- `ip`
- `user_agent`
- `session_id`
- `geo.country`
- `geo.city`
- `geo.region`
- `geo.isp`
- `device.device_type`
- `device.os`
- `device.browser`

### Lead List

Bo loc:
- Search email / so dien thoai
- Sale phu trach
- Tag
- Tu ngay
- Den ngay
- Page ID
- Bo loc nang cao

Cot bang:
- Ho ten
- SDT
- Email
- Page
- Channel
- Source / Medium
- Sale
- Tuong tac gan nhat
- Thoi gian dang ky
- Action: Xoa

Action:
- Click row mo lead detail
- Refresh
- Export CSV
- Them lead thu cong
- Xoa lead
- Phan trang: Truoc / Sau, 20 lead moi trang

CSV export gom:
- Name
- Phone
- Email
- Page
- Channel
- Source
- Medium
- Sale
- Registered at
- Last interaction

### Them Lead Thu Cong

Form field:
- Ho ten
- So dien thoai
- Email
- Page ID, mac dinh `manual`
- Hinh thuc
- Quan tam

Sau khi tao thanh cong, mo lead detail cua lead vua tao.

## 4. Lead Detail Drawer

Drawer gom header, tab, body scroll va action dong/xoa.

Header:
- Ten lead
- Phone / email
- Xoa lead
- Dong

Tabs:
- Tong quan
- CRM
- Forms
- Campaign
- Tags
- Survey
- Zoom
- Tracking

### Tab Tong Quan

Thong tin:
- Lead ID
- Lead score
- So scoring rule match
- Page
- Khu vuc
- Hinh thuc
- Dang ky luc
- Channel
- Source / Medium
- Thanh pho
- Thiet bi / OS / Browser

### Tab CRM

Sale phu trach:
- Select sale
- Hien tai: ten/email sale

Notes:
- Textarea them ghi chu
- Nut luu note
- Danh sach note

Note item:
- Noi dung
- Tac gia
- Thoi gian
- Interaction type: call, message, meeting, email, note

### Tab Forms

Custom fields:
- Hien thi theo field da cau hinh.
- Co nut luu custom fields.

Loai input:
- text
- textarea
- number
- currency
- date
- boolean
- dropdown
- multiselect

Registration forms:
- Lich su cac lan form submit duoc luu trong `registration_forms`.

### Tab Campaign

Thong so:
- Delivery
- Open
- Click
- Bounce

Email campaign detail:
- Stage
- Event/status
- Subject
- Time
- Neu khong co format chuan thi fallback JSON preview.

Dieu kien:
- Match campaign theo email lead.
- Lead khong co email thi hien empty state.

### Tab Tags

Control:
- Multi-select tags
- Nut luu tags

Tag label nen hien:
- Category / Tag name
- Mau tag

### Tab Survey

Thong tin:
- Interest
- Cac cau tra loi survey theo key/value

### Tab Zoom

Cot bang:
- Join time
- Zoom name
- Meeting ID
- Duration

### Tab Tracking

CAPI readiness checklist:
- Event ID
- `_fbc` hoac `fbclid`
- `_fbp`
- IP address
- User agent
- Source URL

Tracking fields:
- Referrer
- fbclid
- gclid
- `_fbc`
- `_fbp`
- IP
- User Agent
- UTM source, medium, campaign, content, term
- ttclid, msclkid, twclid
- ga

## 5. Bo Loc Nang Cao Lead

Bo loc ket hop AND, ho tro field chuan, tag va custom field.

### Field Chuan

- Ho ten
- SDT
- Email
- Khu vuc
- Hinh thuc
- Source
- Medium
- Channel
- Sale phu trach
- Tag
- Ngay dang ky
- Tuong tac gan nhat
- Thanh pho
- Quoc gia
- Thiet bi

Channel options:
- Paid Search
- Organic Search
- Social
- Email
- Referral
- Display
- Direct
- SMS
- Other Campaign

Device options:
- Mobile
- Desktop
- Tablet
- Unknown

### Custom Field Trong Filter

Format label:
- `[Custom] Nhom / Label`

Loai:
- text
- number
- currency
- date
- boolean
- dropdown
- multiselect

### Operator

Text:
- Chua
- La
- Khong la
- Khong chua
- Trong
- Khong trong

Number / currency:
- =
- !=
- >
- <
- >=
- <=
- Trong khoang
- Trong
- Khong trong

Date / timestamp:
- La ngay
- Truoc
- Sau
- Trong khoang
- X ngay qua
- Trong
- Khong trong

Dropdown:
- La mot trong
- Khong phai
- Trong
- Khong trong

Boolean:
- True
- False

Multiselect / tag:
- Co bat ky
- Co tat ca
- Khong co
- Trong
- Khong trong

## 6. Lead Trung

### KPI

- Nhom trung
- Lead trung
- Da quet

### Filter

- Search key trung
- Loai: tat ca, email, phone
- Quet lai

### Cach Phat Hien Trung

- Email: lowercase va trim.
- Phone: bo ky tu khong phai so, chuan hoa dau so Viet Nam.

### Danh Sach Nhom Trung

Moi group gom:
- `id`
- `type`: email hoac phone
- `key`
- `count`
- `first_seen`
- `last_seen`
- `page_ids`
- `assignees`
- `leads`

### Bang Chi Tiet Group

Cot:
- Checkbox
- Ho ten
- Phone
- Email
- Page
- Sale
- Du lieu CRM
- Dang ky
- Chi tiet

Du lieu CRM gom:
- So note
- So tag
- So custom field co value
- So Zoom attendance

Action:
- Chon dung 2 lead de merge
- Xoa cac lead da chon
- Mo lead detail

Quy tac merge hien tai:
- Tu chon primary theo score: co sale + notes + tags + custom fields + zoom attendances.
- Merge duplicate vao primary.
- Gop notes, tags, custom field values, Zoom attendances, survey, registration forms.

## 7. Zoom

### Meeting List

Filter:
- Search meeting
- Chi meeting co lead
- Xoa loc

Cot:
- Meeting topic
- Meeting ID
- Bat dau
- Participants
- Matched leads
- Chi tiet

### Meeting Detail Drawer

KPI:
- Participants
- Matched leads
- Total duration

Bang participant:
- Participant / Zoom display name
- Email
- Phone
- Join
- Leave
- Duration
- Lead
- Sale

Action:
- Neu participant da match lead: nut mo lead.
- Neu chua match: nut Them lead.

### Quan He Zoom

- `zoom_meetings.zoom_meeting_uuid` la khoa chinh.
- `lead_zoom_attendances.zoom_meeting_uuid` lien ket toi meeting.
- `lead_zoom_attendances.registration_id` lien ket toi lead neu da match.
- `lead_zoom_attendances.lead_email` dung de match theo email.

## 8. Campaign 14 Days

Campaign lay tu API ngoai va match voi CRM bang email.

### KPI

- Delivery
- Users
- Open
- Open rate
- Click
- Click rate
- Bounce

### Bang Stage

Cot:
- Stage
- Delivery
- Open
- Click
- Bounce
- Users

Action:
- Click Users de mo popup danh sach user cua stage.

### Stage Popup

Filter:
- Loc theo sale

Cot:
- Ho ten
- SDT
- Email
- CRM: Linked / Chua khop
- Sale
- Stage
- Ngay tao

Action:
- Linked: mo lead detail.
- Chua khop: mo detail raw campaign user.

### Campaign User

Field:
- `id`
- `name`
- `email`
- `phone`
- `stage`
- `stockInvestment`
- `createdAt`
- `lastSentAt`
- `linkedLead`

## 9. Survey

### KPI

- Tong phan hoi
- Da tra loi
- Q8 tu do
- Q9 tu do

### Cau Hoi / Du Lieu

- Q1: stage
- Q2: problem
- Q3: error
- Q4: goal
- Q5: learning
- Q6: time
- Q7: concern
- Q8: expectation, text list
- Q9: priority, text list
- Interest breakdown

### Quan He

- `surveys.registration_id` lien ket `registrations.id` neu co.
- `surveys.page_id` lien ket page.
- Interest lay tu registration data.

## 10. Ads Performance

### Bo Loc

- Tu ngay
- Den ngay

### KPI

- Spend
- Results
- Campaigns
- Clicks
- CPC

### Bieu Do / Bang

- Daily results
- Daily spend
- Age results
- Gender results
- Top 5 CPR thap nhat
- Campaigns

Top 5 CPR cot:
- Ad
- Results
- CPR

Campaigns cot:
- Campaign
- Results
- CPR
- Detail

### Campaign Detail Drawer

Bang ads:
- Ad name
- Spend
- Results
- CPR
- CTR

Breakdown:
- Age
- Gender
- Placement

## 11. CMS Content

### KPI

- Media files
- Folders
- Blog posts

### Media Library

Control:
- Upload
- Search media
- Folder path
- Create folder

Folder table:
- Folder
- Path
- Open
- Xoa

File table:
- File link
- Type / mimetype
- Size KB
- Xoa

### Blog Posts

Control:
- Search blog
- New post

Bang:
- Title
- Status
- Cap nhat
- Edit
- Xoa

Blog editor:
- Title
- Slug
- Status: draft / published
- Author
- Cover image
- Tags
- Excerpt
- Content

## 12. Settings

## 12.1 Connector

Zoom connector:
- Connect Zoom
- Start sync
- Status JSON
- Sync status JSON

Designer nen bien JSON thanh status card neu co du lieu:
- connected / disconnected
- account / user
- token status
- last sync
- job progress
- error

## 12.2 Phan Quyen

User table:
- Ten
- Email
- Role
- Active

Role:
- sale
- admin

Lead assignment weights:
- Sale
- Weight
- Assigned
- Target %
- Actual %

Action:
- Sua ten user
- Doi role
- Bat/tat active
- Luu weights

## 12.3 Quan Ly Tag

Create category:
- Category name
- Color

Create tag:
- Tag name
- Category
- Color
- Description
- Active

Tag table:
- Tag
- Category
- People count
- Active
- Xoa

Category table:
- Category
- Color
- Xoa

Page tag mapping:
- Page
- Tag
- Updated

Action:
- Backfill page tags
- Map page -> tag

## 12.4 Custom Fields

Create custom field:
- Label
- Key
- Type
- Group
- Default
- Options comma separated
- Required

Type options:
- text
- textarea
- number
- currency
- date
- boolean
- dropdown
- multiselect

Custom field table:
- Label
- Key
- Type
- Group
- Required
- Options
- Xoa

Delete custom field:
- Can nhap dung `key` de confirm.

## 12.5 Scoring

Rule field:
- Field
- Operator
- Value
- Points
- Xoa

Operator:
- contains
- not_contains
- equals
- not_equals
- exists
- empty
- gt
- gte
- lt
- lte

Action:
- Them rule
- Luu rules

Nguon field co the dung:
- Field cua lead
- `channel`
- `country`
- `city`
- `tags`
- `activity`
- `email_open`
- `email_click`
- `custom:<field_id>`
- `custom_key:<field_key>`

## 12.6 Webhook

Add webhook:
- Name
- URL
- Active

Webhook table:
- Webhook name
- URL
- Active
- Last status
- Last error
- Test
- Xoa

Can thiet ke them neu lam moi:
- Payload preview
- Webhook logs
- Retry history
- Status badge thanh cong/loi

## 13. Quan He Du Lieu Chinh

`registrations` la bang lead trung tam.

Quan he:
- `crm_profiles.user_id` -> `registrations.assigned_to`
- `lead_notes.registration_id` -> `registrations.id`
- `crm_custom_field_values.registration_id` -> `registrations.id`
- `crm_custom_field_values.field_id` -> `crm_custom_fields.id`
- `lead_tags.registration_id` -> `registrations.id`
- `lead_tags.tag_id` -> `crm_tags.id`
- `crm_tags.category_id` -> `crm_tag_categories.id`
- `lead_zoom_attendances.registration_id` -> `registrations.id`
- `lead_zoom_attendances.zoom_meeting_uuid` -> `zoom_meetings.zoom_meeting_uuid`
- `surveys.registration_id` -> `registrations.id`
- Campaign 14 days match voi CRM bang email, khong phai bang foreign key noi bo.
- Ads lay tu `/ads/api/*`, tach theo campaign, ad, demographic va placement.
- CMS media nam trong Supabase Storage bucket `cms-media`.
- CMS blog nam trong bang `blog_posts`.

## 14. Bang Schema CRM Chinh

### registrations

Cot bo sung cho CRM:
- `assigned_to`
- `assigned_at`
- `last_interaction_at`

Lead con co cac field tracking, geo, device va registration data nhu phan CRM Lead.

### crm_profiles

- `user_id`
- `email`
- `full_name`
- `role`: admin / sale
- `active`
- `created_at`
- `updated_at`

### lead_notes

- `id`
- `registration_id`
- `interaction_type`: call / message / meeting / email / note
- `body`
- `author_id`
- `author_email`
- `author_name`
- `created_at`

### crm_settings

- `key`
- `value`
- `created_at`
- `updated_at`

Dung de luu:
- Lead assignment config
- Lead scoring rules
- Page tag config

### crm_custom_fields

- `id`
- `user_id`
- `label`
- `key`
- `type`
- `required`
- `default_value`
- `group_name`
- `sort_order`
- `options`
- `active`
- `created_at`
- `updated_at`

### crm_custom_field_values

- `registration_id`
- `field_id`
- `value`
- `updated_at`
- `updated_by`
- `updated_by_email`
- `updated_by_name`

### crm_tag_categories

- `id`
- `name`
- `color`
- `created_at`
- `updated_at`

### crm_tags

- `id`
- `category_id`
- `name`
- `slug`
- `color`
- `description`
- `active`
- `created_at`
- `updated_at`

### lead_tags

- `registration_id`
- `tag_id`
- `assigned_by`
- `assigned_by_email`
- `assigned_by_name`
- `assigned_at`

### zoom_meetings

- `zoom_meeting_uuid`
- `zoom_meeting_id`
- `topic`
- `start_time`
- `duration`
- `host_email`
- `host_id`
- `raw`
- `created_at`
- `updated_at`

### lead_zoom_attendances

- `id`
- `registration_id`
- `lead_email`
- `zoom_meeting_uuid`
- `zoom_meeting_id`
- `zoom_display_name`
- `join_time`
- `leave_time`
- `duration`
- `raw`
- `created_at`
- `updated_at`

## 15. Component De Xuat Cho Designer

Nen thiet ke thanh design system module hoa:

- Admin shell: sidebar, topbar, account card, theme toggle.
- Nav item co state active, disabled, admin-only.
- Toolbar filter: search, date range, select, reset, refresh.
- Stat card.
- Chart card.
- Data table co sticky header, sortable neu can, horizontal scroll.
- Pagination.
- Drawer detail size normal va wide.
- Tabs trong drawer.
- Confirm modal.
- Toast notification.
- Empty/loading/error/forbidden state.
- Form modal.
- Multi-select tag.
- Color swatch.
- Status badge.
- JSON preview / raw detail fallback.

Badge / state nen co:
- Admin only
- Active / Off
- Linked / Chua khop
- OK / MISS
- Sent / Opened / Clicked / Bounced
- Syncing / Connected / Error

## 16. Uu Tien Khi Thiet Ke Lai

1. Lead list va lead detail drawer la man hinh quan trong nhat.
2. Bo loc nang cao can de doc, de them dieu kien, khong qua nang.
3. Drawer nen xu ly duoc bang rong va noi dung dai.
4. Settings nen chia thanh cac card gon, uu tien thao tac lap lai nhanh.
5. Dashboard nen uu tien so lieu scan nhanh hon trang tri.
6. Confirm/delete/merge phai ro rang de tranh mat du lieu.
7. Permission state can hien thi than thien, khong chi bao loi ky thuat.

