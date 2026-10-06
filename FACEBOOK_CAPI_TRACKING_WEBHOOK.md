# Tai lieu Facebook CAPI, tracking cookie lead va webhook

Tai lieu nay mo ta cach project hien tai thu thap tracking cookie, tao lead, gui su kien ve Meta Facebook Conversions API (CAPI) va day payload lead sang webhook.

## Phạm vi cập nhật ngày 06/10/2026

Đợt cập nhật Dòng Tiền chỉ áp dụng Meta Pixel trình duyệt, Google Tag Manager và UTM tracking chung. API `/api/dong-tien/register` và `/api/dong-tien/track` lưu vào CRM/database nội bộ, không gọi CAPI hoặc webhook. CAPI của các funnel đã có giữ nguyên; các phần CAPI bên dưới mô tả hệ thống hiện hữu, không phải tính năng mới bật cho Dòng Tiền.

Pixel trình duyệt dùng `META_BROWSER_PIXEL_ENABLED` và `META_DATASET_ID`/`FB_PIXEL_ID`, độc lập với `META_CAPI_ENABLED`. GTM dùng `GTM_CONTAINER_ID` và `GOOGLE_TAG_ENABLED`. Cấu hình public được trả từ `src/trackingConfig.js`; khóa bí mật tiếp tục chỉ nằm ở server.

Dòng Tiền tải cùng `public/js/funnel-tracker.js` và `public/js/meta-pixel.js` với project gốc. UTM/click ID được giữ khi chuyển trang, đọc/ghi các khóa sessionStorage tương thích `core.js` và dùng `_sid_<page_id>`. Cookie `_fbc`, `_fbp` theo quy tắc 90 ngày bên dưới; `_ga` chỉ đọc. Form đăng ký tự lấy đầy đủ attribution từ runtime chung, bao gồm cả `ttclid`, `msclkid`, `twclid`, `ga`. `eventID` đăng ký mới dùng ID bản ghi CRM để tránh phát lại khi đăng nhập/đăng ký lại; hiện chỉ phát CompleteRegistration qua Pixel trình duyệt.

Với route SPA, mỗi navigation đặt lại các mốc thời gian/cuộn theo bảng dưới. GTM nhận `virtual_page_view` và `generate_lead` cùng `event_id`, `page_id`, UTM. ViewContent đo lần đầu focus vào form; sự kiện xem bài và tiến độ/khảo sát vẫn lưu nội bộ.

## 1. Cac file lien quan

- `public/js/core.js`: script chinh tren landing page. Tao session, doc UTM/click ID, tao `_fbc`, `_fbp`, gui event tracking va submit form dang ky.
- `public/js/meta-pixel.js`: nap Meta Pixel tren browser va fire `PageView` voi `eventID`.
- `src/routes/api.js`: nhan `/api/track`, `/api/register`, validate lead, luu lead/event, goi Meta CAPI va webhook.
- `src/metaCapi.js`: build payload va gui event server-side sang Meta Graph API.
- `src/webhooks.js`: build payload lead va POST sang cac webhook dang active.
- `src/storage.js`: luu lead, event, webhook log vao Supabase hoac file fallback.

## Quy tắc sự kiện Facebook Pixel trình duyệt (áp dụng toàn bộ `pages/`)

Mọi HTML được phục vụ qua `src/routes/pages.js` đều nạp `/js/meta-pixel.js`, kể cả landing page thêm mới và URL `/p/:slug/*.html`. Không chèn lần hai nếu trang đã nạp script. Chỉ gửi khi `/api/meta-config` bật Pixel và có `pixel_id`.

| Sự kiện | Điều kiện | Lệnh Pixel |
| --- | --- | --- |
| `PageView` | Khi tải trang; giữ event ID dùng chung với tracking server | `track` |
| `ViewContent` | Lần đầu người dùng focus vào form; giữ event ID `form_open` để dedup CAPI | `track` |
| `TimeOnPage_10_seconds`, `TimeOnPage_30_seconds`, `TimeOnPage_60_seconds`, `TimeOnPage_90_seconds`, `TimeOnPage_120_seconds`, `TimeOnPage_180_seconds`, `TimeOnPage_300_seconds` | Đủ số giây kể từ navigation, tính cả thời gian tải và thời gian tab ở nền | `trackCustom` |
| `ScrollDepth_25_percent`, `ScrollDepth_50_percent`, `ScrollDepth_75_percent`, `ScrollDepth_100_percent` | Cuộn đạt tỷ lệ tương ứng trên quãng đường có thể cuộn; 100% là cuối trang (sai số 1px) | `trackCustom` |

Mỗi mốc thời gian/cuộn gửi một lần trong mỗi lần tải trang, có event ID riêng và `content_name`, `content_category`. Cuộn nhanh qua nhiều mốc gửi tất cả mốc đã vượt. Trang không có vùng cuộn không gửi ScrollDepth. Các sự kiện thời gian/cuộn mới chỉ gửi qua browser Pixel, không gửi thêm CAPI. Trang cảm ơn dùng cùng quy tắc; ViewContent chỉ phát sinh nếu có form được tương tác.

Mã nguồn: `public/js/meta-pixel.js` quản lý PageView và engagement; `public/js/funnel-tracker.js` bổ sung ViewContent cho trang chưa dùng `core.js` hoặc `tracking.js`. Những tracker riêng giữ ViewContent hiện tại.

Kiểm tra: `node scripts/test-meta-pixel-engagement.cjs`.

## 2. Flow tong quat

```text
User vao landing page
  -> public/js/core.js tao session_id trong sessionStorage
  -> doc UTM, click IDs tu URL va sessionStorage
  -> tao/doc cookie _fbc, _fbp, _ga
  -> gui PageView ve /api/track
  -> Meta Pixel browser fire PageView voi eventID

User submit form
  -> core.js gom thong tin lead + UTM + click IDs + pixel cookies
  -> POST /api/register
  -> server validate lead va check duplicate theo page_id
  -> server luu registration + conversion event
  -> server gui Meta CAPI CompleteRegistration
  -> server build payload va POST sang webhook active
  -> browser fire Meta Pixel CompleteRegistration voi cung eventID de Meta dedup
```

## 3. Tracking cookie va attribution tren frontend

### 3.1 Session ID

Trong `public/js/core.js`, moi page tao session rieng theo `PAGE_ID`:

```js
const SESSION_KEY = '_sid_' + PAGE_ID;
```

Gia tri duoc luu trong `sessionStorage`, gan vao:

```js
window._sessionId = sessionId;
```

Session nay duoc gui trong:

- `/api/track`
- `/api/register`

### 3.2 UTM va click IDs

Frontend doc tu URL query, neu khong co thi fallback tu `sessionStorage`.

UTM:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `referrer`

Click IDs:

- `fbclid`
- `gclid`
- `ttclid`
- `msclkid`
- `twclid`

Sau khi doc duoc, cac gia tri nay duoc luu lai vao `sessionStorage` de giu attribution khi user di chuyen trong cung tab.

### 3.3 Pixel cookies

Frontend doc hoac tao:

- `_fbc`: Facebook click cookie. Neu URL co `fbclid` va chua co `_fbc`, script tao theo format:

```text
fb.1.<timestamp>.<fbclid>
```

- `_fbp`: Facebook browser pixel cookie. Neu chua co, script tao theo format:

```text
fb.1.<timestamp>.<random>
```

- `_ga`: Google Analytics cookie, chi doc neu co.

Cookie `_fbc` va `_fbp` duoc set voi:

```text
max-age=90 ngay; path=/; SameSite=Lax
```

## 4. Event tracking truoc khi co lead

### 4.1 PageView

Khi page load, `core.js` tao `pageViewEventId`, day vao `dataLayer`, va goi:

```js
window._track('pageview', {
  url,
  title,
  event_id,
  ...utmData,
  ...clickIds,
  fbc,
  fbp
});
```

`/api/track` se:

- luu event vao storage
- neu event khong phai `conversion`, goi `sendTrackEvent()` de gui Meta CAPI

Mapping event trong `src/metaCapi.js`:

| Internal event | Meta event |
| --- | --- |
| `pageview` | `PageView` |
| `form_open` | `ViewContent` |
| `form_submit` | `SubmitApplication` |
| `cta_click` | `Contact` |
| `conversion` | `CompleteRegistration` |

### 4.2 Meta Pixel browser

`public/js/meta-pixel.js` goi `/api/meta-config` de lay Pixel ID.

Neu config enabled, browser fire:

```js
fbq('track', 'PageView', {
  content_name: pageId,
  content_category: 'landing_page'
}, {
  eventID: eventId
});
```

`eventID` nay dung de Meta deduplicate voi CAPI server-side.

## 5. Lead submit va `/api/register`

Khi submit form, frontend gom payload:

```js
{
  name,
  phone,
  email,
  region,
  attendance,
  session_id,
  page_id,
  event_source_url,
  ...utmData,
  ...clickIds,
  fbc,
  fbp,
  ga
}
```

Server `/api/register` thuc hien:

1. Validate bat buoc:
   - `name`
   - `phone` voi page thuong
   - `email`
2. Check duplicate theo cung `page_id`, dua tren phone hoac email.
3. Lay IP that qua `extractClientIp(req)`.
4. Lookup geo qua IP de co `city`, `state`, `zip`.
5. Tao `record` lead voi:
   - thong tin lien he
   - UTM
   - click IDs
   - pixel cookies
   - session_id
   - IP, user_agent
   - device, geo
   - registered_at
6. Luu lead bang `insertRegistration(record)`.
7. Luu event `conversion`.
8. Goi song song:
   - `sendRegistrationEvents(req, record)`
   - `fireWebhooks(buildWebhookPayload(record))`

## 6. Meta CAPI server-side

File: `src/metaCapi.js`

### 6.1 Dieu kien bat CAPI

CAPI chi gui khi:

```js
META_CAPI_ENABLED !== 'false'
META_DATASET_ID hoac FB_PIXEL_ID co gia tri
META_ACCESS_TOKEN co gia tri
```

Bien moi truong lien quan:

| Bien | Y nghia |
| --- | --- |
| `META_CAPI_ENABLED` | Dat `false` de tat CAPI |
| `META_DATASET_ID` | Meta Dataset/Pixel ID |
| `FB_PIXEL_ID` | Fallback Pixel ID |
| `META_ACCESS_TOKEN` | Access token de gui Graph API |
| `META_API_VERSION` | Default `v21.0` |
| `META_TEST_EVENT_CODE` | Test Event Code khi debug trong Events Manager |
| `META_CAPI_TIMEOUT_MS` | Timeout request, default `3500` |
| `META_PHONE_COUNTRY_CODE` | Default `84` |
| `META_DEFAULT_COUNTRY` | Default `vn` |

### 6.2 User data gui sang Meta

Payload CAPI co `user_data` gom:

| Field Meta | Lay tu | Xu ly |
| --- | --- | --- |
| `client_ip_address` | IP request hoac record.ip | raw |
| `client_user_agent` | request UA hoac record.user_agent | raw |
| `fbp` | record.fbp hoac cookie `_fbp` | raw |
| `fbc` | record.fbc hoac cookie `_fbc` hoac `fbclid` | raw |
| `em` | email | SHA-256 lowercase trim |
| `ph` | phone | normalize phone VN roi SHA-256 |
| `fn` | first name | normalize roi SHA-256 |
| `ln` | last name | normalize roi SHA-256 |
| `ct` | city | strip dau tieng Viet, lowercase, SHA-256 |
| `st` | state/region | normalize, lay 2 ky tu, SHA-256 |
| `zp` | zip | normalize, SHA-256 |
| `country` | default `vn` | SHA-256 |
| `external_id` | lead id hoac session_id | SHA-256 |

### 6.3 Custom data gui sang Meta

`custom_data` gom:

- `content_name`
- `content_category`
- `content_ids`
- `contents`
- `content_type`
- `num_items`
- `status`
- `value`
- `currency`
- `lead_event_source`
- `scroll_depth` neu event co depth
- `time_on_page_seconds` neu event co seconds
- `button_position` neu event co position
- `method` neu event co method

Gia tri mac dinh theo page:

| page_id | value |
| --- | ---: |
| `14days-challenge` | `199000` |
| `tt14n-tier2` | `4999000` |
| `tt14n-quiz` | `0` |

### 6.4 Payload CAPI mau

```json
{
  "data": [
    {
      "event_name": "CompleteRegistration",
      "event_time": 1710000000,
      "event_id": "registration-uuid",
      "event_source_url": "https://domain.com/p/landing-page",
      "action_source": "website",
      "user_data": {
        "client_ip_address": "1.2.3.4",
        "client_user_agent": "Mozilla/5.0 ...",
        "fbp": "fb.1.1710000000.123456789",
        "fbc": "fb.1.1710000000.fbclid-value",
        "em": ["sha256-email"],
        "ph": ["sha256-phone"],
        "external_id": ["sha256-lead-id"]
      },
      "custom_data": {
        "content_name": "14days-challenge",
        "content_category": "lead_generation",
        "content_ids": ["14days-challenge"],
        "status": "complete",
        "value": 199000,
        "currency": "VND",
        "lead_event_source": "website"
      }
    }
  ],
  "access_token": "META_ACCESS_TOKEN"
}
```

## 7. Dedup giua Pixel va CAPI

Project dung `event_id` de Meta deduplicate.

Khi submit form thanh cong:

- Server tra ve `event_id = record.id`.
- Browser fire Pixel `CompleteRegistration` voi:

```js
fbq('track', 'CompleteRegistration', ..., { eventID: eventId });
```

- Server CAPI gui `CompleteRegistration` voi:

```js
event_id: record.id
```

Neu Pixel va CAPI cung `event_name` + `event_id`, Meta se hieu la cung mot conversion va dedup.

## 8. Webhook lead

File: `src/webhooks.js`

Sau khi lead duoc luu, server goi:

```js
fireWebhooks(buildWebhookPayload(record))
```

`fireWebhooks()`:

- lay danh sach webhook active tu storage
- POST JSON sang tung webhook URL
- header:

```text
Content-Type: application/json
X-Webhook-Source: landingpage
```

- timeout 7 giay
- luu `last_triggered`, `last_status`, `last_error`, `last_duration_ms`
- insert webhook log neu Supabase kha dung

### 8.1 Webhook payload mau

```json
{
  "event": "new_registration",
  "event_id": "registration-uuid",
  "event_source": "14days-challenge",
  "timestamp": "2026-07-09T01:00:00.000Z",
  "contact": {
    "name": "Nguyen Van A",
    "phone": "0901234567",
    "email": "a@example.com",
    "region": "Ho Chi Minh",
    "interest": "Forex",
    "attendance": "Online qua Zoom"
  },
  "utm": {
    "source": "facebook",
    "medium": "cpc",
    "campaign": "summer-campaign",
    "content": "video_01",
    "term": "",
    "channel": "Social",
    "referrer": "https://facebook.com"
  },
  "click_ids": {
    "fbclid": "fbclid-value",
    "gclid": "",
    "ttclid": "",
    "msclkid": "",
    "twclid": ""
  },
  "pixel": {
    "fbc": "fb.1.1710000000.fbclid-value",
    "fbp": "fb.1.1710000000.123456789",
    "ga": "GA1.1.123456789.1710000000"
  },
  "server": {
    "ip": "1.2.3.4",
    "user_agent": "Mozilla/5.0 ..."
  }
}
```

## 9. Field mapping tu form den webhook va CAPI

| Nguon | Lead record | Webhook | Meta CAPI |
| --- | --- | --- | --- |
| Form name | `name` | `contact.name` | hash `fn`, `ln` |
| Form phone | `phone` | `contact.phone` | hash `ph` |
| Form email | `email` | `contact.email` | hash `em` |
| Form region | `region`, `state` | `contact.region` | hash `st`, co the dung `ct` neu city |
| Form attendance | `attendance` | `contact.attendance` | khong gui truc tiep |
| URL UTM | `utm_*` | `utm.*` | mot phan trong event/custom tracking |
| `fbclid` | `fbclid` | `click_ids.fbclid` | dung tao `fbc` |
| `_fbc` | `fbc` | `pixel.fbc` | `user_data.fbc` |
| `_fbp` | `fbp` | `pixel.fbp` | `user_data.fbp` |
| `_ga` | `ga` | `pixel.ga` | khong gui Meta |
| IP | `ip` | `server.ip` | `client_ip_address` |
| User Agent | `user_agent` | `server.user_agent` | `client_user_agent` |
| Lead ID | `id` | `event_id` | `event_id`, hash `external_id` |

## 10. Debug va kiem tra

### 10.1 Kiem tra browser

Mo DevTools tren landing page:

1. Application -> Cookies:
   - co `_fbc` neu vao tu URL co `fbclid`
   - co `_fbp`
   - co `_ga` neu GA da cai
2. Application -> Session Storage:
   - co `_sid_<PAGE_ID>`
   - co UTM/click IDs neu URL co
3. Network:
   - `/api/track` duoc goi khi pageview/form_open/scroll
   - `/api/register` duoc goi khi submit form

### 10.2 Kiem tra server

- Log loi CAPI co prefix:

```text
[Meta CAPI]
```

- Neu thieu config CAPI, `sendEvent()` tra ve skipped:

```text
missing_meta_config
```

- Webhook log duoc luu qua `insertWebhookLog()` neu Supabase hoat dong.

### 10.3 Kiem tra Meta Events Manager

Neu dung test event:

```env
META_TEST_EVENT_CODE=TEST12345
```

Sau do submit form va kiem tra:

- `PageView`
- `ViewContent`
- `CompleteRegistration`
- Dedup status giua Browser va Server

## 11. Luu y bao mat va van hanh

- `META_ACCESS_TOKEN` chi nam tren server, khong duoc dua ra frontend.
- Frontend chi lay `pixel_id` qua `/api/meta-config`.
- Webhook payload co PII: name, phone, email, IP. Chi gui den endpoint tin cay.
- Nen them secret header/HMAC cho webhook neu ben nhan can xac thuc.
- Nen block webhook URL noi bo/private IP de tranh SSRF.
- Nen them rate limit cho `/api/register` va `/api/track`.
- Nen log `event_id` khi debug de doi chieu Pixel/CAPI/webhook cung mot lead.

## 12. Checklist cau hinh production

```env
META_CAPI_ENABLED=true
META_DATASET_ID=<pixel-or-dataset-id>
META_ACCESS_TOKEN=<server-access-token>
META_API_VERSION=v21.0
META_CAPI_TIMEOUT_MS=3500
META_PHONE_COUNTRY_CODE=84
META_DEFAULT_COUNTRY=vn
```

Neu can test:

```env
META_TEST_EVENT_CODE=<test-event-code-tu-meta-events-manager>
```

Webhook duoc quan ly trong admin CRM:

```text
Admin -> Webhook -> them URL -> active
```

Khi lead moi duoc tao, tat ca webhook active se nhan payload `new_registration`.
