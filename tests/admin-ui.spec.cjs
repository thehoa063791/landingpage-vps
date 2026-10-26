const { test, expect } = require('@playwright/test');
const path = require('path');
const { buildAdmin } = require('../scripts/build-admin.cjs');
const demoBundle = path.join(__dirname, '..', 'test-results', 'admin-demo', 'react-shell.js');
test.beforeAll(async () => {
  // Synthetic data is available only in a test bundle, never in public production assets.
  await buildAdmin({ demo: true, outfile: demoBundle });
});
test.beforeEach(async ({ page }, info) => {
  if (/browser-only demo|traffic demo responds|funnel detail separates|status colors and chart/.test(info.title)) {
    await page.route('**/admin/react-shell.js*', route => route.fulfill({ path: demoBundle, contentType: 'application/javascript' }));
  }
});

test('production ignores demo query and stale browser storage and requires real authentication', async ({ page }) => {
  const bundle = require('fs').readFileSync(path.join(__dirname, '..', 'public', 'admin', 'react-shell.js'), 'utf8');
  for (const marker of ['demo-sale-', 'demo-lead-', 'from_demo', 'Xem dữ liệu demo', 'Dữ liệu demo']) {
    expect(bundle).not.toContain(marker);
  }
  await page.addInitScript(() => localStorage.setItem('vinmocAdminDemo', '1'));
  await page.goto('/admin/view/funnels?demo=1');
  await expect(page.locator('.auth-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: /demo/i })).toHaveCount(0);
  await expect(page.locator('.demo-banner')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('vinmocAdminDemo'))).toBeNull();
  await fixtures(page);
  await page.reload();
  await expect(page.locator('.shell-main')).toBeVisible();
  await expect(page.getByRole('button', { name: /demo/i })).toHaveCount(0);
  await expect(page.locator('.demo-banner')).toHaveCount(0);
});
const lead = { id: 'lead-demo', name: 'Nguyễn Minh Anh', phone: '0901234567', email: 'minhanh@example.test', page_id: 'dongtien', channel: 'facebook', registered_at: '2026-10-05T01:00:00Z', assigned_name: 'Trần Linh', assigned_to: 'sale-1', notes: [], tags: [], custom_fields: [{ id: 'budget', label: 'Ngân sách', type: 'currency', value: 1000000 }, { id: 'topics', label: 'Chủ đề', type: 'multiselect', options: ['Đầu tư', 'Tài chính'], value: [] }], orders: [], zoom_attendances: [] };
const contactRow = { id: 'contact-demo', name: 'Nguyễn Minh Anh', email: 'minhanh@example.test', phone: '0901234567', owner_id: 'sale-1', owner_name: 'Trần Linh', funnels: ['dongtien', 'trading'], tag_ids: ['tag-1'], first_touch: { source: 'facebook', medium: 'cpc', at: '2026-09-12T01:00:00Z' }, last_touch: { source: 'zalo', medium: 'bot', at: '2026-10-05T01:00:00Z' }, registrations_count: 2, latest_registration_id: 'lead-demo', latest_note: 'Hẹn gọi lại tối nay', notes_count: 1, last_interaction_at: '2026-10-06T01:00:00Z', has_candidates: true };
const contactDetail = {
  contact: { id: 'contact-demo', display_name: 'Nguyễn Minh Anh', primary_email: 'minhanh@example.test', primary_phone: '0901234567', owner_id: 'sale-1', owner_name: 'Trần Linh', first_touch: contactRow.first_touch, last_touch: contactRow.last_touch, first_registered_at: '2026-09-12T01:00:00Z', last_registered_at: '2026-10-05T01:00:00Z' },
  registrations: [
    { id: 'lead-old', page_id: 'trading', name: 'Nguyễn Minh Anh', email: 'minhanh@example.test', registered_at: '2026-09-12T01:00:00Z', source: 'direct', medium: '(none)', assigned_name: 'Trần Linh', forms: [{ submitted_at: '2026-09-12T01:00:00Z', page_id: 'trading', utm_source: 'facebook', source: 'initial_registration' }, { submitted_at: '2024-01-02T01:00:00Z', page_id: 'wp:loinhuan', source: 'wordpress_import' }] },
    { ...lead, source: 'zalo', medium: 'bot', forms: [{ submitted_at: '2026-10-05T01:00:00Z', page_id: 'dongtien', utm_source: 'zalo' }, { submitted_at: '2026-10-06T01:00:00Z', page_id: 'dongtien', source: 'repeat_submission' }] },
  ],
  identities: [{ kind: 'email', value: 'minhanh@example.test' }, { kind: 'email', value: 'minhanh.work@example.test' }, { kind: 'phone', value: '0901234567' }],
  candidates: [{ other_id: 'contact-2', other_name: 'Minh Anh', reason: 'same_phone_other_name' }],
  notes: [{ id: 'n1', body: 'Hẹn gọi lại tối nay', interaction_type: 'call', author_name: 'Trần Linh', created_at: '2026-10-06T01:00:00Z' }],
  tags: [{ id: 'tag-1', name: 'Quan tâm', color: '#616161' }], custom_values: { budget: { value: 1000000 } }, orders: [{ id: 'o1', page_id: 'breakout', amount: 99000, currency: 'VND', status: 'won', created_at: '2026-10-07T01:00:00Z' }], surveys: [],
  learning: [{ course: 'dongtien', title: 'Dòng Tiền', status: 'in_progress', completed_lessons: 2, total_lessons: 5, last_activity_at: '2026-10-07T13:00:00Z', days_since_last_activity: 1, resume_url: 'https://example.test/dong-tien/learn/3', current_lesson: { id: 3, title: 'Quản lý vốn', watch_percent: 40 }, next_lesson: { id: 3 }, lessons: [1, 2, 3, 4, 5].map(id => ({ id, position: id, title: `Bài ${id}`, completed: id < 3, watch_percent: id < 3 ? 100 : id === 3 ? 40 : 0, completed_at: id < 3 ? `2026-10-0${id + 4}T13:00:00Z` : null })) }],
  // Zoom logs a rejoin from a second device as an overlapping piece of the same session.
  zoom_attendances: [{ id: 'z1', topic: 'Xu hướng 2026', zoom_meeting_id: '842', zoom_meeting_uuid: 'u1', registration_id: 'lead-demo', meeting_duration: 90, join_time: '2026-10-08T13:00:00Z', leave_time: '2026-10-08T14:00:00Z', duration: 3600, lead_email: 'minhanh@example.test' },
    { id: 'z2', topic: 'Xu hướng 2026', zoom_meeting_id: '842', zoom_meeting_uuid: 'u1', meeting_duration: 90, join_time: '2026-10-08T13:30:00Z', leave_time: '2026-10-08T14:18:00Z', duration: 2880, lead_email: 'minhanh@example.test' }], merges: [],
};
const courseLessons = [1, 2, 3, 4, 5, 6].map(id => ({ id, title: `Bài học số ${id}`, stage_id: id <= 3 ? 1 : 2, duration: 600 + id * 60, is_visible: id !== 6, position: id, viewers: [40, 34, 30, 18, 15, 0][id - 1], completed: [30, 25, 20, 10, 8, 0][id - 1], completion_rate: 70 - id * 5, avg_watch_percent: 90 - id * 7 }));
const courseStudent = (n, done, extra = {}) => ({ id: `st-${n}`, name: `Học viên ${n}`, email: `hv${n}@example.test`, phone: '0901000000', region: 'Hà Nội', registered_at: '2026-10-05T01:00:00Z', assigned_to: n % 2 ? 'sale-1' : '', completed: done, total_lessons: 5, watch_percent: done * 20, lessons: courseLessons.map(l => ({ lesson_id: l.id, title: l.title, is_visible: l.is_visible, completed: l.id <= done, opened: l.id <= done + 1 && done > 0, watched_seconds: l.id <= done ? 600 : 0, watch_percent: l.id <= done ? 100 : 0, updated_at: l.id <= done ? `2026-10-${10 + n}T01:00:00Z` : null })), ...extra });
const courseReport = { lessons: courseLessons, stages: [{ id: 1, title: 'Chương 1 · Nền tảng', is_visible: true }, { id: 2, title: 'Chương 2 · Thực hành', is_visible: true }], students: [courseStudent(1, 5), courseStudent(2, 3, { known_since: '2025-03-01T01:00:00Z' }), courseStudent(3, 1), courseStudent(4, 0)], history: [{ id: 'h1', registration_id: 'st-1', name: 'Học viên 1', email: 'hv1@example.test', lesson_id: 1, title: 'Bài học số 1', opened_at: '2026-10-12T01:00:00Z', watch_percent: 100, completed: true }], cta_stats: {}, summary: { students: 4, sessions: 1, completed_students: 1, completion_rate: 25, regions: [] } };
const coursePeople = { funnel: 'dong-tien', range: { from: '2026-09-24T00:00:00+07:00', to: '2026-10-24T00:00:00+07:00' }, current: { registrations: 4, people: 4, new_people: 3, existing_people: 1, same_person_other_email: 0, visits: 50, repeats: 0 }, previous: { registrations: 2, new_people: 2, visits: 40 }, daily: [], origins: [{ page_id: 'trading', count: 1 }], sources: { last_touch: [], first_touch: [] }, spend: { total: null, previous_total: null, matched_registrations: 0, paid_registrations: 0 } };
const zoomStats = (reg, att, stayed, walkins, sessions = 1) => ({ registrations: reg, links: reg, clicked: Math.round(reg * 0.4), attended: att, stayed, attendees: att + walkins, stayed_all: stayed, walkins, unmatched: 2, sessions, stay_minutes: 70 });
const zoomList = {
  rows: [
    { id: 'ev-2', title: 'Xu hướng 2026 · lần 2', zoom_kind: 'webinar', zoom_id: '84211930457', starts_at: '2026-10-30T13:00:00Z', duration_minutes: 90, status: 'open', has_page: true, stats: zoomStats(1284, 0, 0, 0, 0) },
    { id: 'ev-1', title: 'Xu hướng 2026 · lần 1', zoom_kind: 'webinar', zoom_id: '84211930457', starts_at: '2026-10-15T13:00:00Z', duration_minutes: 90, status: 'closed', has_page: true, stats: zoomStats(2106, 812, 503, 62) },
  ],
  open: null, kpis: { registrations_30d: 3390, attendance_rate: 0.39, stayed_rate: 0.62, unmatched: 62, unassigned_sessions: 1 },
};
zoomList.open = zoomList.rows[0];
const zoomSessions = [
  { zoom_meeting_uuid: 'm1', zoom_meeting_id: '84211930457', topic: 'Xu hướng đầu tư 2026', start_time: '2026-10-15T12:52:00Z', duration: 104, hidden: false, hidden_by: '', type: '5', event_id: 'ev-1', source: 'auto', excluded: false, event_title: 'Xu hướng 2026 · lần 1', people: 936, contacts: 874 },
  { zoom_meeting_uuid: 'm2', zoom_meeting_id: '7015529930', topic: 'Phòng họp cá nhân', start_time: '2026-10-21T13:05:00Z', duration: 47, hidden: false, hidden_by: '', type: '4', event_id: null, source: null, excluded: false, event_title: null, people: 38, contacts: 35 },
];
const zoomDetail = {
  event: { ...zoomList.rows[1], page: {}, prefix: 'webinar:84211930457' }, stats: { ...zoomStats(2106, 812, 503, 62), known_before: 1402, new_people: 704 }, total_minutes: 104,
  curve: Array.from({ length: 27 }, (_, i) => ({ minute: i * 4, people: i < 3 ? 200 * i : 700 - (i > 20 ? (i - 20) * 60 : 0) })),
  sources: [{ source: 'facebook', registrations: 1122, attended: 348 }, { source: 'zalo', registrations: 418, attended: 217 }],
  people: [
    { key: 'c:1', contact_id: 'contact-demo', name: 'Nguyễn Minh Anh', email: 'minhanh@example.test', registered_at: '2026-10-13T01:00:00Z', source: 'zalo', has_link: true, zoom_error: '', clicks: 1, first_click: '2026-10-15T12:58:00Z', attended: true, minutes: 78, stayed: true, emails_in_zoom: ['minhanh.work@example.test'], status: 'stayed' },
    { key: 'e:x', contact_id: null, name: 'Trần Quốc Bảo', email: 'bao@example.test', registered_at: '2026-10-14T01:00:00Z', source: 'facebook', has_link: true, zoom_error: '', clicks: 0, first_click: null, attended: false, minutes: 0, stayed: false, emails_in_zoom: [], status: 'absent' },
  ],
  unmatched: [{ attendance_ids: ['a1'], email: 'hungtrader@example.test', name: 'Hùng Trader', minutes: 88, suggestions: [{ id: 'contact-demo', display_name: 'Nguyễn Văn Hùng', primary_email: 'hung@example.test' }] }],
  sessions: [{ zoom_meeting_uuid: 'm1', topic: 'Xu hướng đầu tư 2026', start_time: '2026-10-15T12:52:00Z', duration: 104, source: 'auto', excluded: false, people: 936 }],
};
const reviewSide = (id, name, email, phone, funnels) => ({ id, name, email, phone, emails: [email], phones: phone ? [phone] : [], names: [name], funnels, owner_id: '', owner_name: '', first_registered_at: '2026-09-12T01:00:00Z', registrations: 1, notes: 0, orders: 0 });
const reviewPairs = [
  { reason: 'same_phone_other_name', match_key: '0912345678', a: reviewSide('ca', 'Nguyễn Minh Anh', 'anh@example.test', '0912345678', ['trading']), b: reviewSide('cb', 'Trần Thị Bình', 'binh@example.test', '0912345678', ['richlife']) },
  { reason: 'same_email_other_name', match_key: 'home@example.test', a: reviewSide('cc', 'Lê Hà Linh', 'home@example.test', '', ['zoom-event']), b: reviewSide('cd', 'Phạm Quốc Tuấn', 'home@example.test', '', ['wordpress']) },
];
const users = [{ user_id: 'sale-1', full_name: 'Trần Linh', email: 'linh@example.test', role: 'sale', active: true }];
async function fixtures(page, role = 'admin') {
  const writes = [];
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (/\.(js|css|woff2)$/.test(url.pathname)) return route.continue();
    if (!/\/admin\/(auth|api|leads|contacts|funnels|crm|zoom|survey|campaign|prosperity|cms|webhooks)|\/ads\/api/.test(url.pathname)) return route.continue();
    if (request.method() !== 'GET') writes.push({ path: url.pathname, method: request.method(), body: request.postDataJSON() });
    let body = {};
    if (url.pathname.endsWith('/auth/config')) body = { googleEnabled: true };
    else if (url.pathname.endsWith('/auth/me')) body = { user: { id: 'demo', full_name: 'Quản trị viên', email: 'admin@example.test', role } };
    else if (url.pathname === '/admin/leads') body = { rows: [lead], total: 1 };
    else if (url.pathname === '/admin/leads/lead-demo') body = lead;
    else if (url.pathname === '/admin/funnels-index') body = { rows: [{ slug: 'dong-tien', name: 'Dòng Tiền', url: '/dong-tien', page_ids: ['dong-tien'], learning: true, zoom_event: false }] };
    else if (url.pathname === '/admin/funnels/dong-tien/custom-code') body = request.method() === 'PUT' ? { ...request.postDataJSON(), updated_at: '2026-10-26T07:00:00Z' } : { head: '', body: '', updated_at: null };
    else if (url.pathname === '/admin/funnels/dong-tien/people') body = coursePeople;
    else if (url.pathname === '/admin/funnels/dong-tien/learning/ctas') body = { ctas: [] };
    else if (url.pathname === '/admin/funnels/dong-tien/learning') body = courseReport;
    else if (url.pathname === '/admin/funnels/dong-tien') body = { slug: 'dong-tien', steps: [], revenue: 0 };
    else if (url.pathname === '/admin/zoom-events') body = zoomList;
    else if (url.pathname === '/admin/zoom-events/sessions') body = { rows: zoomSessions, counts: { all: 2, unassigned: 1, hidden: 1 } };
    else if (url.pathname === '/admin/zoom-events/ev-1') body = zoomDetail;
    else if (url.pathname === '/admin/contacts/candidates') body = { rows: reviewPairs, counts: { same_phone_other_name: 1, same_email_other_name: 1, same_name_similar_email: 0, all: 2 }, decided: 5, pageNum: 1, pageSize: 50 };
    else if (url.pathname === '/admin/contacts/merges') body = { rows: [{ id: 7, kept_id: 'contact-demo', merged_id: 'contact-2', action: 'merge', reason: 'manual merge', by_email: 'admin@example.test', created_at: '2026-10-20T03:00:00Z', kept_name: 'Nguyễn Minh Anh', merged_name: 'Minh Anh', registration_ids: ['lead-x'], can_undo: true }] };
    else if (url.pathname === '/admin/contacts/views') body = { views: { all: 1, mine: 0, today: 0, no_note: 0, unassigned: 0, candidates: 1 }, multi_funnel: 1, funnels: [{ id: 'dongtien', count: 1 }], sources: [{ id: 'facebook', count: 1 }] };
    else if (url.pathname === '/admin/contacts') body = { rows: [contactRow], total: 1, pageNum: 1, pageSize: 50 };
    else if (url.pathname === '/admin/contacts/contact-demo') body = contactDetail;
    else if (url.pathname.startsWith('/admin/contacts/by-registration/')) body = { contact_id: 'contact-demo' };
    else if (url.pathname.endsWith('/summary')) body = { score: 15, score_matches: 2 };
    else if (url.pathname.endsWith('/crm/users')) body = { rows: users };
    else if (url.pathname.endsWith('/crm/tags')) body = { tags: [{ id: 'tag-1', name: 'Quan tâm', category_name: 'Chăm sóc' }], categories: [] };
    else if (url.pathname.endsWith('/custom-fields')) body = { rows: lead.custom_fields, customFields: lead.custom_fields };
    else if (url.pathname.endsWith('/accounts') || url.pathname.startsWith('/ads/api/') && /daily|campaigns|adsets|ads$|creatives|breakdown|demographics/.test(url.pathname)) body = [];
    else if (url.pathname.startsWith('/admin/api/')) body = { stats: { pageviews: 1200, conversions: 48, conversionRate: 4, ctaClicks: 180, formOpens: 90 }, regByDay: { '2026-10-03': 8, '2026-10-04': 12, '2026-10-05': 18 }, trafficChannel: { Facebook: 700, Direct: 300, Google: 200 }, scrollDepth: { 25: 900, 75: 500, 90: 200 }, timeOnPage: { 30: 800, 60: 500 } };
    else if (url.pathname.includes('/media')) body = { folders: [], files: [] };
    else if (url.pathname.endsWith('/scoring-rules')) body = { rules: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  return writes;
}

test('lead flow, accessible select, local columns, detail, money and confirmation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const writes = await fixtures(page);
  await page.goto('/admin/view/leads');
  await expect(page.getByRole('heading', { name: 'Danh sách lead', exact: true }).first()).toBeVisible();
  await expect(page.locator('.react-table')).toContainText(lead.name);
  await page.screenshot({ path: 'test-results/admin-leads-light.png', fullPage: true });
  const assignee = page.locator('.lead-assignee-select');
  await assignee.click();
  await page.getByRole('option', { name: 'Trần Linh' }).click();
  await expect(page.locator('.filter-pills')).toContainText('Trần Linh');
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await page.getByRole('button', { name: /Tùy chỉnh cột/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.react-table tbody tr').first().click();
  await expect(page).toHaveURL(/lead=lead-demo/);
  await expect(page.locator('.lead-detail-page')).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-lead-detail.png', fullPage: true });
  await page.getByRole('button', { name: 'Trường tùy chỉnh', exact: true }).click();
  await page.locator('.money-input input').fill('2.500.000,5');
  await expect(page.locator('.save-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Quay lại danh sách', exact: true }).click();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.locator('.lead-detail-page')).toBeVisible();
  await page.locator('.save-bar').getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => writes.find(w => w.path.endsWith('/custom-fields'))?.body?.values?.budget).toBe('2500000.5');
  await expect(page.locator('.ui-toast')).toContainText('Đã lưu');
  await page.getByRole('button', { name: 'Xóa lead', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hủy', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  expect(writes.filter(w => w.method === 'DELETE')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('customers: one row per person, quick filters, note, owner and tabbed detail', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const writes = await fixtures(page);
  await page.goto('/admin/view/customers');
  await expect(page.locator('.cu-title-row h1')).toHaveText('Khách hàng');
  await expect(page.locator('.cu-title-row p')).toContainText('1 người tham gia từ 2 phễu');
  await expect(page.locator('.cu-table')).toContainText('Nguyễn Minh Anh');
  await expect(page.locator('.cu-table')).toContainText('Có thể trùng');
  await expect(page.locator('.cu-table')).toContainText('1 ghi chú');
  await page.getByRole('tab', { name: /^Chưa giao/ }).click();
  await expect(page.getByRole('tab', { name: /^Chưa giao/ })).toHaveAttribute('aria-selected', 'true');
  // A filter shows a "Đang lọc" line; after a reload the view is remembered, the filter is not.
  await page.getByRole('combobox', { name: 'Sale', exact: true }).click();
  await page.getByRole('option', { name: 'Chưa giao', exact: true }).click();
  await expect(page.locator('.cu-filtering')).toContainText('Đang lọc: Sale: Chưa giao');
  await page.reload();
  await expect(page.getByRole('tab', { name: /^Chưa giao/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: 'Sale', exact: true })).toHaveText(/^Sale/);
  await expect(page.locator('.cu-filtering')).toHaveCount(0);
  await page.getByRole('tab', { name: /^Tất cả/ }).click();
  await page.getByRole('checkbox', { name: /^Chọn Nguyễn/ }).check();
  await expect(page.locator('.cu-bar-selected')).toContainText('Đã chọn 1');
  await page.getByRole('button', { name: 'Bỏ chọn' }).click();
  await page.getByRole('button', { name: 'Ghi chú', exact: true }).click();
  await page.getByLabel('Ghi chú', { exact: true }).fill('Đã gọi, khách hẹn mai');
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect.poll(() => writes.find(w => w.path === '/admin/leads/lead-demo/notes')?.body?.body).toBe('Đã gọi, khách hẹn mai');
  await page.screenshot({ path: 'test-results/admin-customers.png', fullPage: true });
  await page.locator('.cu-table .cu-name').first().click();
  await expect(page).toHaveURL(/contact=contact-demo/);
  await expect(page.locator('.cu-detail-head h1')).toHaveText('Nguyễn Minh Anh');
  await expect(page.locator('.cu-timeline')).toContainText('Gửi lại form /dongtien');
  await expect(page.locator('.cu-timeline')).toContainText('Đăng ký trên website WordPress cũ · form loinhuan');
  // One row per Zoom session, overlapping pieces counted once.
  await expect(page.locator('.cu-timeline li', { hasText: 'Tham dự Zoom' })).toHaveCount(1);
  await expect(page.locator('.cu-timeline')).toContainText('Ở lại 78/90 phút · 20:00–21:18 · vào phòng 2 lần.');
  // Nguồn khách: the latest registration's own source and date.
  await expect(page.getByRole('region', { name: 'Nguồn khách' })).toContainText('Đăng ký gần nhất · 05/10/2026 · /dongtien');
  await expect(page.getByRole('region', { name: 'Nguồn khách' })).toContainText('zalo · bot');
  // A registration without UTM (lead rows say direct / (none)) has no known source.
  await page.getByRole('tab', { name: /^Phễu/ }).click();
  await expect(page.locator('.cu-table')).toContainText('Không rõ nguồn');
  await page.getByRole('tab', { name: 'Dòng thời gian' }).click();
  // Several emails: the main one is marked, another can become the main one.
  await expect(page.locator('.cu-ident')).toContainText('Email (2)');
  await page.getByRole('button', { name: 'Đặt làm chính' }).click();
  await expect.poll(() => writes.find(w => w.path === '/admin/contacts/contact-demo/primary')?.body).toEqual({ kind: 'email', value: 'minhanh.work@example.test' });
  await page.screenshot({ path: 'test-results/admin-customer-timeline.png', fullPage: true });
  await page.getByRole('tab', { name: /^Học tập/ }).click();
  await expect(page.locator('.cu-cells span.done')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/admin-customer-learning.png' });
  for (const tab of ['Phễu', 'Học tập', 'Zoom', 'Đơn hàng', 'Khảo sát', 'Kỹ thuật']) {
    await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toHaveAttribute('aria-selected', 'true');
  }
  await page.screenshot({ path: 'test-results/admin-customer-detail.png', fullPage: true });
  // A registration in the timeline opens that registration; deleting it comes back to the person.
  await page.getByRole('tab', { name: 'Dòng thời gian' }).click();
  // Registrations and Zoom rows have Xem chi tiết; learning, notes and orders do not.
  await expect(page.locator('.cu-timeline li', { hasText: 'Học Dòng Tiền' }).getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Xem chi tiết: Tham dự Zoom/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Xem chi tiết: Đăng ký /dongtien' }).click();
  await expect(page.locator('.lead-detail-page')).toBeVisible();
  await page.getByRole('button', { name: 'Xóa lead', exact: true }).click();
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect.poll(() => writes.filter(w => w.method === 'DELETE').map(w => w.path)).toEqual(['/admin/leads/lead-demo']);
  await expect(page.locator('.ui-toast')).toContainText('Đã xóa lượt đăng ký');
  await expect(page.locator('.cu-timeline')).toBeVisible();
  await page.getByRole('tab', { name: /^Phễu/ }).click();
  await page.getByRole('button', { name: 'Mở lượt' }).last().click();
  await expect(page.locator('.lead-detail-page')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/view/customers');
  await expect(page.locator('.cu-cards')).toBeVisible();
  await expect(page.locator('.cu-table')).toBeHidden();
  await page.screenshot({ path: 'test-results/admin-customers-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('course funnel: students and lessons tabs follow the mockups', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const writes = await fixtures(page);
  await page.goto('/admin/view/funnels?funnel=dong-tien');
  await expect(page.getByRole('tab', { name: /^Học viên/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.fu-kpi').first()).toContainText('4');
  await expect(page.locator('.fu-bucket')).toHaveCount(5);
  await page.getByRole('button', { name: /^Hoàn thành/ }).click();
  await expect(page.locator('.fu-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: /^Hoàn thành/ }).click();
  await expect(page.locator('.fu-table tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'Người cũ · 1' }).click();
  await expect(page.locator('.fu-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.fu-table')).toContainText('Người cũ · biết từ 01/03/2025');
  await page.getByRole('button', { name: 'Tất cả · 4' }).click();
  await page.screenshot({ path: 'test-results/admin-funnel-students.png', fullPage: true });
  // A learner opens in Khách hàng; its back button returns to this funnel tab and range.
  await page.goto('/admin/view/funnels?funnel=dong-tien&section=students&dateFrom=2026-10-01&dateTo=2026-10-20');
  await page.locator('.fu-person').first().click();
  await expect(page).toHaveURL(/\/admin\/view\/customers\?contact=contact-demo/);
  await page.getByRole('button', { name: 'Quay lại danh sách khách hàng' }).first().click();
  await expect(page).toHaveURL(/funnel=dong-tien&section=students&dateFrom=2026-10-01&dateTo=2026-10-20/);
  await expect(page.getByRole('tab', { name: /^Học viên/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Lịch sử mở video' }).click();
  await expect(page.locator('.fu-table')).toContainText('Bài học số 1');
  await page.getByRole('tab', { name: /^Bài giảng & CTA/ }).click();
  await expect(page.locator('.fu-bars-retention .fu-bar')).toHaveCount(5);
  await expect(page.locator('.fu-stage')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Ẩn' }).click();
  await expect.poll(() => writes.find(w => w.path === '/admin/funnels/dong-tien/learning/lessons/6')?.body?.is_visible).toBe(true);
  await page.screenshot({ path: 'test-results/admin-funnel-lessons.png', fullPage: true });
  // Mã nhúng (admin): header/body code saved for the funnel.
  await page.getByRole('tab', { name: 'Mã nhúng' }).click();
  await page.getByRole('textbox', { name: 'Header' }).fill('<script src="https://hub.example/t.js"></script>');
  await page.getByRole('button', { name: 'Lưu mã nhúng' }).click();
  await expect.poll(() => writes.find(w => w.path === '/admin/funnels/dong-tien/custom-code')?.body).toEqual({ head: '<script src="https://hub.example/t.js"></script>', body: '' });
  await expect(page.getByRole('button', { name: 'Lưu mã nhúng' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('review: compare two people, choose values, merge, not the same, later, history undo', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const writes = await fixtures(page);
  await page.goto('/admin/view/review');
  await expect(page.locator('.cu-title-row h1')).toHaveText('Có thể trùng');
  await expect(page.locator('.cu-title-row p')).toContainText('Đã duyệt 5 ca, còn 2');
  await expect(page.locator('.nav-count')).toHaveText('2');
  await expect(page.locator('.rv-reason')).toContainText('Cùng SĐT, tên khác');
  await expect(page.locator('.rv-table')).toContainText('Trần Thị Bình');
  await page.getByRole('radio', { name: 'Trần Thị Bình' }).check();
  await page.screenshot({ path: 'test-results/admin-review.png', fullPage: true });
  await page.locator('.cu-title-row h1').click(); // shortcuts are ignored while a field has focus
  await page.keyboard.press('g');
  await expect.poll(() => writes.find(w => w.path === '/admin/contacts/candidates/decide')?.body).toEqual({ contact_a: 'ca', contact_b: 'cb', decision: 'same', pins: { display_name: 'Trần Thị Bình', primary_email: 'anh@example.test' } });
  await page.getByRole('button', { name: /Để sau/ }).click();
  await expect(page.locator('.rv-reason')).toContainText('Cùng email, tên khác');
  await page.getByRole('button', { name: /Không phải cùng người/ }).click();
  await expect.poll(() => writes.filter(w => w.path === '/admin/contacts/candidates/decide').map(w => w.body.decision)).toContain('not_same');
  await page.getByRole('button', { name: 'Lịch sử gộp' }).click();
  await expect(page.locator('.cu-title-row h1')).toHaveText('Lịch sử gộp');
  await page.getByRole('button', { name: 'Tách lại' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Xác nhận|Đồng ý|OK|Tiếp tục/ }).click();
  await expect.poll(() => writes.some(w => w.path === '/admin/contacts/merges/7/undo')).toBe(true);
  await page.screenshot({ path: 'test-results/admin-review-history.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('zoom events: list, sessions, event detail with people, unmatched and sessions', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const writes = await fixtures(page);
  await page.goto('/admin/view/zoom-events');
  await expect(page.locator('.cu-title-row h1')).toHaveText('Sự kiện Zoom');
  await expect(page.locator('.ze-open')).toContainText('Xu hướng 2026 · lần 2');
  await expect(page.locator('.fu-kpi')).toHaveCount(4);
  await expect(page.locator('.fu-table')).toContainText('2.106');
  await page.screenshot({ path: 'test-results/admin-zoom-events.png', fullPage: true });
  await page.getByRole('tab', { name: /^Buổi Zoom/ }).click();
  await expect(page.locator('.fu-table')).toContainText('Phòng họp cá nhân');
  await page.getByRole('combobox', { name: 'Gán buổi vào sự kiện' }).selectOption('ev-1');
  await expect.poll(() => writes.find(w => w.path === '/admin/zoom-events/sessions/m2')?.body).toEqual({ event_id: 'ev-1' });
  await page.getByRole('button', { name: 'Tạo sự kiện' }).click();
  await expect(page.locator('.ze-create')).toBeVisible();
  await page.getByRole('tab', { name: /^Sự kiện/ }).click();
  await page.getByRole('button', { name: 'Xu hướng 2026 · lần 1' }).click();
  await expect(page).toHaveURL(/event=ev-1/);
  await expect(page.locator('.ze-step')).toHaveCount(5);
  await expect(page.locator('.ze-note')).toContainText('70 phút');
  await page.screenshot({ path: 'test-results/admin-zoom-event.png', fullPage: true });
  await page.getByRole('tab', { name: /^Khách/ }).click();
  await expect(page.locator('.fu-table')).toContainText('vào bằng minhanh.work@example.test');
  await page.getByRole('tab', { name: /^Tham dự chưa khớp/ }).click();
  await page.getByRole('button', { name: 'Gán theo gợi ý' }).click();
  await expect.poll(() => writes.find(w => w.path === '/admin/zoom-events/attendances/link')?.body).toEqual({ attendance_ids: ['a1'], contact_id: 'contact-demo' });
  await page.getByRole('tab', { name: /^Buổi/ }).click();
  await page.getByRole('checkbox', { name: 'Có' }).click();
  await expect.poll(() => writes.find(w => w.path === '/admin/zoom-events/sessions/m1')?.body).toEqual({ excluded: true });
  await page.getByRole('tab', { name: /^Trang .zoom/ }).click();
  await expect(page.getByRole('button', { name: 'Mở lại trên /zoom' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('all admin modules render in both themes without runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await fixtures(page);
  const modules = ['view/overview', 'view/customers', 'view/leads', 'view/review', 'view/duplicates', 'view/zoom-events', 'view/zoom', 'view/funnels', 'tools/ads', 'tools/cms', 'settings/connector', 'settings/users', 'settings/tags', 'settings/custom-fields', 'settings/scoring', 'settings/webinar-settings', 'settings/webhooks'];
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(t => localStorage.setItem('crmTheme', t), theme);
    for (const module of modules) {
      await page.goto(`/admin/${module}`);
      await expect(page.locator('.shell-main')).toBeVisible();
      await expect(page.locator('.page-header-react h1, .cu-title-row h1').first()).toBeVisible();
      await page.waitForTimeout(200);
      expect(errors, `${theme}/${module}: runtime errors`).toEqual([]);
      expect(await page.locator('.react-content .ui-button-default:visible').count(), `${module}: multiple primary actions`).toBeLessThanOrEqual(1);
      expect(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), `${module}: viewport overflow`).toBe(true);
    }
    await page.goto('/admin/view/overview');
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
    await page.screenshot({ path: `test-results/admin-overview-${theme}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('server errors remain visible and destructive confirmation sends exactly one write', async ({ page }) => {
  const writes = await fixtures(page);
  await page.goto('/admin/view/leads');
  await page.locator('.react-table tbody tr').click();
  await page.getByRole('button', { name: 'Xóa lead', exact: true }).click();
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect.poll(() => writes.filter(w => w.method === 'DELETE').length).toBe(1);
  await expect(page.locator('.lead-detail-page')).toHaveCount(0);
  await expect(page.locator('.ui-toast')).toContainText('Đã xóa');
  await page.route('**/admin/leads?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Máy chủ tạm thời không khả dụng' }) }));
  await page.locator('.leads-header-actions').getByRole('button', { name: 'Làm mới', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Máy chủ tạm thời không khả dụng');
});

test('sale sees no destructive lead controls and admin-only pages stay protected', async ({ page }) => {
  await fixtures(page, 'sale');
  await page.goto('/admin/view/leads');
  await expect(page.getByRole('button', { name: 'Xóa lead', exact: true })).toHaveCount(0);
  await page.locator('.react-table tbody tr').click();
  await expect(page.getByRole('button', { name: 'Xóa lead', exact: true })).toHaveCount(0);
  await page.goto('/admin/settings/users');
  await expect(page.getByText('Bạn chưa có quyền admin')).toBeVisible();
});

test('browser-only demo has populated screens and a single sidebar scroll direction', async ({ page }) => {
  const errors = [], apiRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/admin\/(auth|api|leads|crm|zoom|survey|cms|webhooks|funnels)(\/|\?|$)|\/ads\/api/.test(new URL(request.url()).pathname)) apiRequests.push(request.url()); });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/admin/view/overview?demo=1');
  await expect(page.locator('.demo-banner')).toBeVisible();
  await expect(page.locator('.stat-value-react').first()).not.toHaveText('0');
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  expect(await page.locator('.sidebar-scroll').evaluate(el => ({ noHorizontal: el.scrollWidth <= el.clientWidth, overflowX: getComputedStyle(el).overflowX, overflowY: getComputedStyle(el).overflowY }))).toEqual({ noHorizontal: true, overflowX: 'hidden', overflowY: 'auto' });
  await page.screenshot({ path: 'test-results/admin-demo-overview.png', fullPage: true });
  await page.locator('.sidebar-scroll .nav-item').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.sidebar-scroll .nav-item').last()).toBeVisible();
  await expect(page.locator('.account-card')).toBeInViewport();
  await page.getByRole('button', { name: 'Chuyển giao diện tối', exact: true }).click();
  await page.screenshot({ path: 'test-results/admin-demo-dark.png', fullPage: true });
  const modules = ['view/duplicates', 'view/zoom', 'view/funnels', 'tools/ads', 'tools/cms', 'settings/connector', 'settings/users', 'settings/tags', 'settings/custom-fields', 'settings/scoring', 'settings/webinar-settings', 'settings/webhooks'];
  for (const module of modules) {
    await page.goto(`/admin/${module}`);
    await expect(page.locator('.page-header-react h1, .cu-title-row h1').first()).toBeVisible();
    await expect(page.locator('.skeleton')).toHaveCount(0);
    expect(errors, module).toEqual([]);
  }
  await page.goto('/admin/view/leads');
  await expect(page.locator('.react-table tbody tr')).toHaveCount(24);
  await page.screenshot({ path: 'test-results/admin-demo-leads.png', fullPage: true });
  await page.locator('.react-table tbody tr').first().click();
  await expect(page.locator('.lead-detail-page')).toBeVisible();
  await page.getByRole('button', { name: 'Trường tùy chỉnh', exact: true }).click();
  await page.locator('.money-input input').fill('2.500.000');
  await page.locator('.save-bar').getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.locator('.ui-toast')).toContainText('demo');
  await expect(page.locator('.money-input input')).toHaveValue('2.500.000');
  await page.getByRole('button', { name: 'Khảo sát', exact: true }).click();
  await expect(page.locator('.lead-detail-page')).toContainText('Quản lý dòng tiền tốt hơn');
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Thoát demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xem dữ liệu demo', exact: true })).toBeVisible();
  await expect(page.locator('.demo-banner')).toHaveCount(0);
});

test('analytics and list pages share width; traffic demo responds to page and date filters', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const bounds = [];
  for (const route of ['view/overview', 'view/leads', 'settings/tags', 'settings/connector', 'settings/webinar-settings']) {
    await page.goto(`/admin/${route}?demo=1`);
    await expect(page.locator('.page-header-react h1, .cu-title-row h1').first()).toBeVisible();
    bounds.push(await page.locator('.react-content').boundingBox());
    const header = await page.locator('.page-header-react').boundingBox();
    expect(header.x).toBe(bounds.at(-1).x);
    expect(header.width).toBe(bounds.at(-1).width);
  }
  expect(new Set(bounds.map(b => `${b.x}:${b.width}`)).size).toBe(1);
  await page.goto('/admin/view/overview?demo=1');
  await expect(page.locator('.panel-title').getByText('Lượt xem trang theo ngày', { exact: true })).toBeVisible();
  await expect(page.locator('.panel-title').getByText('Lượt xem theo landing page', { exact: true })).toBeVisible();
  const allViews = await page.locator('.stat-value-react').first().textContent();
  await page.getByPlaceholder('Tất cả page').fill('trading');
  await expect(page.locator('.stat-value-react').first()).not.toHaveText(allViews);
  const pageViews = await page.locator('.stat-value-react').first().textContent();
  await page.locator('.analytics-toolbar-card').getByRole('combobox').click();
  await page.getByRole('option', { name: '7 ngày qua', exact: true }).click();
  await expect(page.locator('.stat-value-react').first()).not.toHaveText(pageViews);
  await page.screenshot({ path: 'test-results/admin-traffic-width.png', fullPage: true });
});

test('funnel detail separates scoped analytics without a survey tab', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin/view/funnels?demo=1');
  const dashboard = page.locator('.nav-section').first();
  await expect(dashboard.locator('.nav-item')).toHaveCount(2);
  await page.locator('.funnel-row').first().click();
  await expect(page).toHaveURL(/funnel=trading/);
  await expect(page.locator('.fu-kpi').first()).toContainText('Lượt đăng ký');
  await expect(page.locator('.fu-kpi')).toHaveCount(5);
  await expect(page.locator('.fu-who')).toContainText('Người mới');
  await expect(page.locator('.fu-table').first()).toContainText('facebook');
  await page.getByRole('button', { name: 'Xem theo First Touch' }).click();
  await expect(page.getByRole('heading', { name: 'Theo nguồn (First Touch)' })).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-funnel-overview.png', fullPage: true });
  await expect(page.getByRole('tab', { name: 'Khảo sát', exact: true })).toHaveCount(0);
  for (const tab of ['Nguồn & thiết bị', 'Hành vi trên trang']) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.analytics-toolbar-card')).toHaveCount(0);
    await expect(page.locator('.react-content .panel-card').first()).toBeVisible();
    expect(errors).toEqual([]);
  }
  await page.getByRole('button', { name: '7 ngày' }).click();
  await expect(page.getByRole('button', { name: '7 ngày' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/dateFrom=/);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Hành vi trên trang' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '7 ngày' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('status colors and chart series retain semantic colors in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(t => localStorage.setItem('crmTheme', t), theme);
    await page.goto('/admin/tools/ads?demo=1');
    await expect(page.locator('.chart-legend').first()).toContainText('Doanh thu');
    await page.screenshot({ path: `test-results/admin-colors-${theme}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Chiến dịch', exact: true }).click();
    await expect(page.locator('.ads-status-badge.active').first()).toBeVisible();
    for (const [status, tone] of [['active', 'success'], ['paused', 'warning']]) {
      const correct = await page.locator(`.ads-status-badge.${status}`).first().evaluate((el, tone) => {
        const probe = document.createElement('span'); probe.style.color = `var(--${tone}-text)`; probe.style.background = `var(--${tone}-surface)`; el.append(probe);
        const actual = getComputedStyle(el), expected = getComputedStyle(probe);
        const matches = actual.color === expected.color && actual.backgroundColor === expected.backgroundColor;
        probe.remove(); return matches;
      }, tone);
      expect(correct).toBe(true);
    }
  }
});
