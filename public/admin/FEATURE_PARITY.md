# Admin React Feature Parity Checklist

This file is the source of truth for migrating the old admin to React without losing behavior.

## Sources

- Legacy HTML: `public/admin/legacy.html`
- Legacy CSS: `public/admin/css/admin.css`
- Legacy feature modules: `public/admin/js/features/*.js`
- React shell: `public/admin/react-shell.js`
- Main admin entry: `public/admin.html`
- Admin APIs: `src/routes/admin.js`, `src/routes/cms.js`

## Status Legend

- `[x]` Done in React
- `[~]` Partial in React
- `[ ]` Missing in React
- `[?]` Needs manual verification in browser

## Global Shell

- [x] Supabase login through `/admin/auth/login`
- [x] CRM role check through `/admin/auth/me`
- [x] Admin cookie handoff for Ads/CMS
- [x] Sidebar navigation for Dashboard, CRM, Growth, Settings
- [x] Deep links: `/admin/view/:view`, `/admin/settings/:view`, `/admin/tools/:view`
- [x] Light/dark theme toggle
- [~] Global refresh behavior per active tab
- [x] CSV export for leads using current filters/date range
- [~] Date range filter: custom date range is restored for Leads; presets still pending globally
- [x] Page filter by `page_id` for Leads
- [ ] Toast notification system equivalent to legacy `toast`
- [ ] Confirm dialogs styled as admin modal

## Dashboard: Tong Quan

Legacy source: `02-dashboard-reports.js`, `10-chart-factories.js`

- [x] Stat cards: pageviews, CTA clicks, form opens, conversions, conversion rate, exit intent
- [x] Chart.js enabled in React admin
- [x] Bar chart for leads by day
- [x] Donut chart for traffic channel
- [x] Funnel summary
- [x] Scroll depth summary
- [x] Time on page chart
- [~] Exact legacy color palette and card layout
- [ ] Same chart tooltips/options as legacy Chart.js factories
- [x] Date range filter integration
- [x] Page filter integration

## Dashboard: Traffic

Legacy source: `02-dashboard-reports.js`

- [x] Traffic source breakdown
- [x] Traffic medium breakdown
- [x] Traffic channel breakdown
- [x] Leads by region
- [x] Performance tables: visitors, leads, conversion rate
- [~] Donut/bar charts for all traffic panels
- [ ] Exact channel badge colors from legacy
- [x] Leads by medium table
- [ ] Leads by attendance table
- [x] Date/page filters

## Dashboard: Behavior

Legacy source: `02-dashboard-reports.js`

- [x] Scroll depth sessions
- [x] Time on page sessions
- [x] CTA by position
- [x] Quality summary cards
- [~] Legacy quality labels and thresholds
- [ ] Animated horizontal bars
- [x] Date/page filters

## Dashboard: Devices & Geo

Legacy source: `07-marketing-devices.js`

- [x] Device type chart/table
- [x] Browser chart/table
- [x] OS table
- [x] Country/city/ISP tables
- [x] Leads by region
- [x] Attendance table
- [ ] Legacy maps/geo formatting if any
- [x] Date/page filters

## Survey

Legacy source: `09-survey.js`

- [x] Basic survey totals
- [x] Q1, Q2, Q7, interest breakdowns
- [x] Full Q1-Q9 layout
- [x] Text response lists for Q8/Q9
- [x] Doughnut charts for Q5/Q6/Q7
- [~] Top insight cards
- [ ] Exact legacy colors and labels

## Leads List

Legacy source: `04-leads-duplicates.js`, `06-lead-detail.js`, `11-helpers-boot.js`

- [x] Paginated leads table
- [x] Search by email/phone
- [x] Filter by assignee
- [x] Advanced filters sent to `/admin/leads?filters=...`
- [x] Advanced filter fields: standard fields, tags, custom fields
- [x] Click row opens lead detail modal
- [x] Lead detail is centered popup with scroll
- [x] Detail tabs: overview, CRM, forms, tags, survey, zoom, tracking
- [x] Change assignee
- [x] Add note
- [x] Edit custom fields
- [x] Edit tags
- [~] Survey detail rendering
- [~] Zoom detail rendering inside lead
- [~] Tracking detail rendering
- [x] Manual lead modal
- [x] Delete lead action from list/detail
- [x] CSV export with current filters
- [x] Tag quick filter dropdown
- [x] Date range/page filters
- [x] Last interaction display parity
- [x] CAPI readiness checklist
- [~] Campaign detail tab inside lead drawer
- [~] Email campaign history/preview from lead
- [x] Full custom field controls: dropdown, multiselect, boolean, date, currency
- [ ] Permission nuance: sales can only write notes for assigned leads

## Lead Trung / Duplicates

Legacy source: `04-leads-duplicates.js`

- [x] Duplicate report endpoint `/admin/leads/duplicates`
- [x] Groups list
- [x] Group detail table
- [x] Select two leads
- [x] Merge selected leads through `/admin/leads/merge`
- [~] Auto-pick primary by CRM data score
- [x] Search duplicate groups
- [x] Type filter: all/email/phone
- [x] Refresh/scan button
- [x] Select/delete one or more duplicate leads
- [ ] Merge preview grid with editable final fields
- [x] Open lead detail from duplicate row
- [x] Update report after merge without full page reload
- [ ] Confirm modal with clear primary/duplicate summary

## Zoom

Legacy source: `05-zoom-ads.js`, `08-admin-settings.js`

- [x] Meetings list from `/admin/zoom/meetings`
- [x] Meeting detail popup from `/admin/zoom/meeting-detail`
- [x] Participant table
- [x] Participant join/leave/duration
- [x] Matched lead/sale display
- [x] Create/link lead from participant via `/admin/zoom/participants/:id/create-lead`
- [x] Open linked lead detail from participant row
- [x] Search/filter meetings
- [x] Zoom sync trigger from Settings/Connector
- [x] Zoom sync status/progress panel
- [x] Connect Zoom auth URL flow
- [x] Detail popup exact stats: shown participants, matched leads, total duration
- [x] Raw participant fallback fields parity

## Campaign 14 Days

Legacy source: `03-campaign-14-days.js`

- [x] Campaign summary table from `/admin/campaign/14-days`
- [x] User count is clickable
- [x] Stage user popup from `/admin/campaign/14-days/stage/:stage`
- [x] Centered popup with scroll
- [x] Basic linked CRM status and sale display
- [x] Sale filter inside stage popup
- [x] Click campaign user to open linked lead detail
- [x] Unlinked campaign user detail popup
- [x] Campaign email detail endpoint `/admin/campaign/email-detail?email=...`
- [ ] Email history modal
- [ ] Email HTML preview iframe/modal
- [ ] Email status badges: sent/opened/clicked/bounced
- [x] Lead drawer campaign section
- [ ] Error markers for failed stages

## Ads Performance

Legacy/new source: Ads APIs and React shell

- [x] Ads KPIs via `/ads/api/kpis`
- [x] Top 5 via `/ads/api/top5`
- [x] Campaign table via `/ads/api/campaigns`
- [~] Date range controls
- [~] Full ads dashboard parity with separate `ads-report` app
- [x] Campaign drill-down
- [x] Creative/adset breakdown if available

## Ads Report App

- [x] Admin session handoff endpoint `/admin/ads-report/session`
- [x] Entry screen to open Ads Report
- [ ] Embedded/same-shell experience if desired
- [ ] Error state with reconnect instructions

## CMS Content

Source: `src/routes/cms.js`

- [x] Media list via `/admin/cms/media`
- [x] Blog list via `/admin/cms/blog`
- [x] Upload media
- [x] Create/delete folder
- [x] Delete media
- [x] Create/edit/delete blog post
- [x] Blog detail editor
- [~] CMS search/filter/sort

## Connector / Zoom Settings

Legacy source: `08-admin-settings.js`

- [x] Basic Zoom status fetch via `/admin/zoom/status`
- [x] Connect Zoom button through `/admin/zoom/auth-url`
- [x] Start Zoom sync through `/admin/zoom/sync`
- [x] Poll `/admin/zoom/sync-status`
- [~] Sync logs table
- [~] Sync detail popup
- [ ] Webhook connector status cards

## Phan Quyen / Users

Legacy source: `08-admin-settings.js`

- [x] Users list via `/admin/crm/users`
- [x] Basic user table in React
- [x] Edit role/admin/sale
- [x] Active/inactive toggle
- [x] Lead assignment weights
- [x] Assignment statistics
- [x] Save assignment config through `/admin/crm/lead-assignment`

## Quan Ly Tag

Legacy source: `08-admin-settings.js`

- [x] Tags list through `/admin/crm/settings`
- [~] Create/edit/delete tag category
- [~] Create/edit/delete tag
- [x] People count per tag
- [x] Page tag mapping
- [x] Backfill page tags
- [~] Tag duplicate/name validation UI

## Custom Fields

Legacy source: `08-admin-settings.js`

- [x] Custom fields loaded for lead advanced filter and lead detail
- [x] Custom fields management UI
- [~] Create/edit/delete custom field
- [x] Field groups/categories
- [x] Required/default/options controls
- [x] Confirm key for delete

## Scoring Rules

Legacy source: `08-admin-settings.js`

- [x] Scoring rules table
- [x] Add/edit/delete scoring rule
- [x] Field/operator/value/points controls
- [x] Save through `/admin/crm/scoring-rules`
- [x] Show score matches in lead detail

## Webhooks

Legacy source: `08-admin-settings.js`, admin webhook routes

- [x] Webhook list
- [~] Add/edit webhook modal
- [x] Enable/disable webhook
- [x] Delete webhook
- [ ] Payload preview modal
- [x] Test/retry webhook if supported

## Modals / Popups

- [x] Centered popup layout for lead detail, campaign stage users, zoom detail
- [x] Popup body scroll
- [x] Table scroll inside popup
- [ ] Shared modal component
- [ ] ESC close for every popup
- [ ] Focus trap/accessibility
- [ ] Consistent confirm modal

## API Parity Map

### Already Used By React

- `/admin/auth/config`
- `/admin/auth/login`
- `/admin/auth/me`
- `/admin/api/:view`
- `/admin/leads`
- `/admin/leads/:id`
- `/admin/leads/:id/assignee`
- `/admin/leads/:id/notes`
- `/admin/leads/:id/custom-fields`
- `/admin/leads/:id/tags`
- `/admin/leads/duplicates`
- `/admin/leads/merge`
- `/admin/campaign/14-days`
- `/admin/campaign/14-days/stage/:stage`
- `/admin/zoom/meetings`
- `/admin/zoom/meeting-detail`
- `/admin/zoom/participants/:attendanceId/create-lead`
- `/admin/crm/users`
- `/admin/crm/tags`
- `/admin/crm/custom-fields`
- `/admin/crm/settings`
- `/admin/cms/media`
- `/admin/cms/blog`
- `/ads/api/kpis`
- `/ads/api/top5`
- `/ads/api/campaigns`

### Still Needs React UI Coverage

- `/admin/leads/:id/summary`
- `/admin/leads/:id/sections/:section`
- `/admin/leads/:id` DELETE
- `/admin/leads` POST manual lead
- `/admin/campaign/email-detail`
- `/admin/campaign/lead-summary`
- `/admin/zoom/auth-url`
- `/admin/zoom/status`
- `/admin/zoom/sync-status`
- `/admin/zoom/sync`
- `/admin/crm/users/:userId` PUT
- `/admin/crm/lead-assignment` PUT
- `/admin/crm/scoring-rules` GET/PUT
- `/admin/crm/tag-categories` POST/PUT/DELETE
- `/admin/crm/tags` POST
- `/admin/crm/tags/:id` PUT/DELETE
- `/admin/crm/page-tags` GET/PUT
- `/admin/crm/page-tags/backfill` POST
- `/admin/crm/custom-fields` POST
- `/admin/crm/custom-fields/:id` PUT/DELETE
- `/admin/webhooks/*`
- `/admin/cms/media/folder`, `/admin/cms/media/upload`, `/admin/cms/media` DELETE
- `/admin/cms/blog` POST, `/admin/cms/blog/:id` GET/PUT/DELETE

## Migration Order

1. Leads parity
   - Manual lead, delete lead, CSV export, date/page filters, campaign/email detail in drawer.
2. Duplicate parity
   - Search/type filter, editable merge preview, delete selected, open detail from row.
3. Campaign parity
   - Sale filter, click user to open lead/unlinked detail, email detail, email preview.
4. Zoom parity
   - Open linked lead, sync/connect controls, sync logs.
5. Settings parity
   - Users, assignment weights, tags, custom fields, scoring rules, webhooks.
6. CMS parity
   - Upload/folders/delete media, blog editor.
7. Polish
   - Shared modal, toast, confirm modal, permissions, keyboard/focus behavior.

## Rule For Future React Changes

Before changing a tab, update this checklist first:

1. Mark intended legacy features as `[~]`.
2. Implement the React behavior.
3. Verify API calls and browser behavior.
4. Mark completed items `[x]`.
5. Never remove a legacy-backed feature unless it is explicitly marked as intentionally dropped.
