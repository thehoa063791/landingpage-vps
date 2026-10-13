// node scripts/test-zoom-event.cjs — /zoom funnel: CRM email check, info completion,
// personal Zoom links, event changes, admin report and page rendering.
// Offline database (JSON fallback in a temp folder), in-memory CRM, fake Zoom API.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRepository, createZoomEventService, normalizeSettings } = require('../src/zoomEvent');
const { render } = require('../src/zoomEventPage');
const { discoverFunnels } = require('../src/funnels');
const { pool } = require('../src/db');
const hubcrmModule = require('../src/hubcrm');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zoom-event-test-'));
  const offline = Object.assign(new Error('test database offline'), { code: 'ECONNREFUSED' });
  const repository = createRepository({ database: { query: async () => { throw offline; }, connect: async () => { throw offline; } }, directory, fallback: true });
  const leads = [{ id: 'lead-old', name: 'Khách Cũ', email: 'Old@Example.invalid', phone: '0911111111', region: 'Hà Nội', page_id: 'trading', registered_at: '2026-01-01T00:00:00.000Z' }];
  const events = [], tags = [], settingsStore = {}, capi = [];
  const crm = {
    getRegistrations: async () => leads, getRegistrationById: async id => leads.find(l => l.id === id) || null,
    insertRegistration: async row => { leads.push(row); }, tagLeadByPage: async row => { tags.push([row.id, row.page_id]); },
    insertEvent: async row => { events.push(row); },
    getCrmSetting: async (key, fallback) => settingsStore[key] ?? fallback, setCrmSetting: async (key, value) => { settingsStore[key] = value; },
  };
  const zoomCalls = [];
  let zoomDown = false, zoomLimited = false, networkFailures = 0;
  const zoomRegistered = [];
  let zoomQuestions = { questions: [], custom_questions: [] };
  const zoom = {
    encodeZoomId: id => encodeURIComponent(id),
    zoomRequest: async (method, route, body) => {
      zoomCalls.push([method, route, body]);
      if (method === 'POST' && networkFailures > 0) { networkFailures--; throw Object.assign(new Error('Zoom network error: fetch failed (ECONNRESET)'), { network: true }); }
      if (zoomDown) throw Object.assign(new Error('Registration has not been enabled for this meeting'), { status: 400, zoomCode: 3000 });
      if (method === 'GET' && route.endsWith('/registrants/questions')) return zoomQuestions;
      if (method === 'GET' && route.includes('/registrants')) return { registrants: zoomRegistered, next_page_token: '' };
      if (zoomLimited && method === 'POST') throw Object.assign(new Error('You have exceeded the daily rate limit of (3) for Add meeting registrant API requests for the registrant (x). You can resume these API requests at GMT 00:00:00.'), { status: 429, zoomCode: 429 });
      if (method === 'POST') { await new Promise(r => setTimeout(r, 20)); return { registrant_id: `r-${zoomCalls.length}`, join_url: `https://zoom.us/w/${route.split('/')[2]}?tk=${encodeURIComponent(body.email)}` }; }
      if (method === 'GET') return { topic: 'Buổi chia sẻ', start_time: '2026-10-25T13:00:00Z', duration: 90, type: 2, settings: { approval_type: 2 } };
      return {};
    },
  };
  // HubCRM: customers by exact email; `hubcrmDown` simulates an outage.
  const hubcrmCustomers = { 'hub@example.invalid': { id: '9001', name: 'Khách HubCRM', email: 'hub@example.invalid', phone: '0944444444' }, 'hubform@example.invalid': { id: '9002', name: 'Hub Form', email: 'hubform@example.invalid', phone: '' } };
  let hubcrmDown = false;
  const hubcrm = { findCustomerByEmail: async email => { if (hubcrmDown) throw new Error('timeout'); return hubcrmCustomers[email] || null; } };
  const webhooks = [];
  const service = createZoomEventService({ repository, crm, zoom, hubcrm, integrations: { lookupGeo: async () => ({ city: 'Hà Nội', region: 'Hà Nội', zip: '100000' }), capi: { sendRegistrationEvents: async (req, record) => { capi.push(record.id); } }, webhooks: { buildWebhookPayload: record => ({ event: 'new_registration', page_id: record.page_id, email: record.email, name: record.name, attendance: record.attendance, utm_source: record.utm_source || '' }), fireWebhooks: async payload => { webhooks.push(payload); } } } });
  const ctx = { ip: '203.0.113.9', user_agent: 'test', request: {}, tracking: { utm_source: 'zalo' } };
  const rejects = async (promise, status, code) => { await assert.rejects(promise, error => error.status === status && (!code || error.code === code)); };

  try {
    // Not configured yet: the landing explains instead of failing silently.
    await rejects(service.check({ email: 'a@example.invalid' }, ctx), 503, 'not_open');
    await rejects(service.saveSettings({ zoom_id: '12ab' }), 400);
    await rejects(service.saveSettings({ zoom_id: '81234567890', hero_mode: 'image' }), 400);
    await service.saveSettings({ zoom_id: '812 3456 7890', starts_at: '2026-10-25T20:00:00+07:00', duration_minutes: 90 });
    assert.equal((await service.settings()).zoom_id, '81234567890');
    assert.equal((await service.settings()).starts_at, '2026-10-25T13:00:00.000Z');

    // Unknown email → info step, nothing stored yet.
    await rejects(service.check({ email: 'not-an-email' }, ctx), 400);
    assert.deepEqual(await service.check({ email: 'New@Example.invalid' }, ctx), { status: 'need_info' });
    assert.equal((await service.registrations()).length, 0);

    // Completion validates, creates the lead and the personal link.
    await rejects(service.complete({ email: 'new@example.invalid', name: 'Người Mới', phone: '12', region: 'Hà Nội' }, ctx), 400);
    await rejects(service.complete({ email: 'new@example.invalid', name: 'Người Mới', phone: '0901234567', region: 'Sao Hỏa' }, ctx), 400);
    const created = await service.complete({ email: 'New@Example.invalid', name: 'Người Mới', phone: '0901 234 567', region: 'Hồ Chí Minh', utm_source: 'zalo' }, ctx);
    assert.equal(created.status, 'ready'); assert.ok(created.event_id); assert.match(created.access_key, /^[A-Za-z0-9_-]{24}$/);
    const lead = leads.find(l => l.email === 'new@example.invalid');
    assert.equal(lead.page_id, 'zoom-event'); assert.equal(lead.region, 'Hồ Chí Minh'); assert.equal(lead.utm_source, 'zalo'); assert.equal(lead.city, 'Hà Nội');
    assert.deepEqual(capi, [lead.id]);
    assert.ok(events.some(e => e.event === 'conversion' && e.event_id === lead.id));
    assert.deepEqual(zoomCalls.at(-1), ['POST', '/meetings/81234567890/registrants', { email: 'new@example.invalid', first_name: 'Người', last_name: 'Mới', phone: '0901 234 567' }]);

    // The same email again keeps its link; no second Zoom registrant.
    const before = zoomCalls.length;
    assert.deepEqual(await service.check({ email: 'new@example.invalid' }, ctx), { status: 'ready', access_key: created.access_key });
    assert.equal(zoomCalls.length, before);

    // A CRM lead from another funnel skips the info step and gets the /zoom page tag.
    const old = await service.check({ email: 'old@example.invalid' }, ctx);
    assert.equal(old.status, 'ready');
    assert.deepEqual(tags.at(-1), ['lead-old', 'zoom-event']);
    // n8n receives new leads once, with the personal page; known customers are not sent.
    const newHook = webhooks.find(w => w.email === 'new@example.invalid');
    assert.deepEqual([newHook.page_id, newHook.attendance, newHook.is_new_lead, newHook.event_id, newHook.utm_source], ['zoom-event', 'Zoom event', true, lead.id, 'zalo']);
    assert.match(newHook.zoom.join_page_url, new RegExp(`/zoom/vao-hoc/${created.access_key}$`));
    assert.deepEqual([newHook.zoom.kind, newHook.zoom.id, newHook.zoom.starts_at], ['meeting', '81234567890', '2026-10-25T13:00:00.000Z']);
    assert.equal(webhooks.some(w => w.email === 'old@example.invalid'), false);
    assert.equal(webhooks.filter(w => w.email === 'new@example.invalid').length, 1, 'repeat sign-up is not sent again');

    // A HubCRM customer unknown locally: straight to the personal page, local lead from HubCRM.
    const capiBefore = capi.length;
    const hub = await service.check({ email: 'HUB@example.invalid' }, ctx);
    assert.equal(hub.status, 'ready');
    const hubLead = leads.find(l => l.email === 'hub@example.invalid');
    assert.deepEqual([hubLead.name, hubLead.phone, hubLead.page_id, hubLead.hubcrm_customer_id], ['Khách HubCRM', '0944444444', 'zoom-event', '9001']);
    assert.equal(webhooks.some(w => w.email === 'hub@example.invalid'), false, 'HubCRM customers are not sent to n8n');
    assert.equal(capi.length, capiBefore, 'no Meta lead for a HubCRM customer');
    // The info form of a HubCRM customer (e.g. typed after a failed lookup) is not a new lead either.
    const hubForm = await service.complete({ email: 'hubform@example.invalid', name: 'Hub Form', phone: '0955555555', region: 'Hà Nội' }, ctx);
    assert.equal(hubForm.event_id, undefined);
    assert.equal(capi.length, capiBefore);
    // HubCRM down: the local CRM still decides, unknown emails get the info step.
    hubcrmDown = true;
    assert.equal((await service.check({ email: 'old@example.invalid' }, ctx)).access_key, old.access_key);
    assert.deepEqual(await service.check({ email: 'hub2@example.invalid' }, ctx), { status: 'need_info' });
    hubcrmDown = false;
    assert.equal(leads.length, 4, 'no duplicate CRM lead');
    // Completing with an email that is already in CRM reuses the lead.
    assert.equal((await service.complete({ email: 'old@example.invalid', name: 'X', phone: '0900000000', region: 'Hà Nội' }, ctx)).access_key, old.access_key);
    assert.equal(leads.length, 4);

    // Simultaneous sign-ups of one email: one row, one registrant.
    leads.push({ id: 'lead-race', name: 'Race', email: 'race@example.invalid', phone: '0922222222', region: 'Hà Nội', page_id: 'dong-tien', registered_at: '2026-02-01T00:00:00.000Z' });
    const raceStart = zoomCalls.length;
    const race = await Promise.all([1, 2, 3].map(() => service.check({ email: 'race@example.invalid' }, ctx)));
    assert.equal(new Set(race.map(r => r.access_key)).size, 1);
    assert.equal(zoomCalls.slice(raceStart).filter(([m]) => m === 'POST').length, 1);

    // Session and join: the click is counted and leads to the personal Zoom URL.
    const session = await service.session(created.access_key);
    assert.deepEqual([session.name, session.email, session.ready, session.duration_minutes], ['Người Mới', 'new@example.invalid', true, 90]);
    const url = await service.join(created.access_key, ctx);
    assert.match(url, /^https:\/\/zoom\.us\/w\/81234567890\?tk=new%40example\.invalid$/);
    await service.join(created.access_key, ctx);
    assert.equal(events.filter(e => e.event === 'zoom_join_click').length, 2);
    await rejects(service.session('bad'), 404, 'not_found');
    await rejects(service.session('x'.repeat(24)), 404, 'not_found');

    // Zoom refuses: the sign-up is kept, the link is created on a later visit.
    zoomDown = true;
    leads.push({ id: 'lead-wait', name: 'Chờ Link', email: 'wait@example.invalid', phone: '0933333333', region: 'Hà Nội', page_id: 'trading', registered_at: '2026-03-01T00:00:00.000Z' });
    const waiting = await service.check({ email: 'wait@example.invalid' }, ctx);
    assert.equal((await service.session(waiting.access_key)).ready, false);
    await rejects(service.join(waiting.access_key, ctx), 503, 'link_pending');
    let report = await service.report();
    assert.equal(report.summary.link_errors, 1);
    assert.match(report.rows.find(r => r.email === 'wait@example.invalid').zoom_error, /chưa bật đăng ký/);
    // Polling the page does not call Zoom again before the retry time (2 minutes).
    zoomDown = false;
    const posts = () => zoomCalls.filter(([m]) => m === 'POST').length;
    const beforeRetry = posts();
    const pending = await service.session(waiting.access_key);
    assert.equal(pending.ready, false);
    assert.ok(Date.parse(pending.retry_at) - Date.now() > 20000 && Date.parse(pending.retry_at) - Date.now() <= 30000);
    assert.equal(posts(), beforeRetry);
    // Admin "Tạo lại link lỗi" retries now.
    assert.deepEqual(await service.retryLinks(), { success: true, total: 1, ready: 1, waiting: 0, failed: 0 });
    assert.equal((await service.session(waiting.access_key)).ready, true);

    // A network failure is retried at once; the visitor gets the link in the same request.
    networkFailures = 2;
    leads.push({ id: 'lead-net', name: 'Mạng Chập', email: 'net@example.invalid', phone: '0911000000', region: 'Hà Nội', page_id: 'trading', registered_at: '2026-03-04T00:00:00.000Z' });
    const net = await service.check({ email: 'net@example.invalid' }, ctx);
    assert.equal((await service.session(net.access_key)).ready, true);
    // Zoom unreachable for longer: retry in 30 s, not counted as one of Zoom's daily attempts.
    networkFailures = 3;
    leads.push({ id: 'lead-net2', name: 'Mạng Mất', email: 'net2@example.invalid', phone: '0911000001', region: 'Hà Nội', page_id: 'trading', registered_at: '2026-03-05T00:00:00.000Z' });
    const net2 = await service.check({ email: 'net2@example.invalid' }, ctx);
    const net2Session = await service.session(net2.access_key);
    assert.equal(net2Session.ready, false);
    assert.ok(Date.parse(net2Session.retry_at) - Date.now() <= 30000);
    assert.match((await service.report()).rows.find(r => r.email === 'net2@example.invalid').zoom_error, /lỗi mạng/);
    await service.retryLinks();
    assert.equal((await service.session(net2.access_key)).ready, true);
    for (const id of ['lead-net', 'lead-net2']) leads.splice(leads.findIndex(l => l.id === id), 1);

    // Zoom's daily limit: wait for the reset (00:00 GMT), even for the admin retry.
    zoomLimited = true;
    leads.push({ id: 'lead-limit', name: 'Giới Hạn', email: 'limit@example.invalid', phone: '0966666666', region: 'Hà Nội', page_id: 'trading', registered_at: '2026-03-02T00:00:00.000Z' });
    const limited = await service.check({ email: 'limit@example.invalid' }, ctx);
    const limitedSession = await service.session(limited.access_key);
    assert.equal(limitedSession.ready, false);
    assert.equal(new Date(limitedSession.retry_at).getUTCHours(), 0);
    assert.ok(Date.parse(limitedSession.retry_at) > Date.now());
    assert.match((await service.report()).rows.find(r => r.email === 'limit@example.invalid').zoom_error, /giới hạn 3 lần/);
    const limitPosts = posts();
    assert.deepEqual(await service.retryLinks(), { success: true, total: 1, ready: 0, waiting: 1, failed: 0 });
    assert.equal(posts(), limitPosts);
    // Already registered on Zoom (e.g. through Zoom's own form): that link is reused.
    zoomRegistered.push({ email: 'Limit@Example.invalid', join_url: 'https://zoom.us/w/81234567890?tk=existing', id: 'zr-1' });
    leads.push({ id: 'lead-zoomed', name: 'Đã Có Zoom', email: 'limit2@example.invalid', phone: '0966666667', region: 'Hà Nội', page_id: 'trading', registered_at: '2026-03-03T00:00:00.000Z' });
    zoomRegistered.push({ email: 'limit2@example.invalid', join_url: 'https://zoom.us/w/81234567890?tk=existing2', id: 'zr-2' });
    const reused = await service.check({ email: 'limit2@example.invalid' }, ctx);
    assert.equal(await service.join(reused.access_key, ctx), 'https://zoom.us/w/81234567890?tk=existing2');
    zoomLimited = false;
    assert.equal((await service.retryLinks()).waiting, 1, 'limited email still waits for the reset');
    for (const id of ['lead-limit', 'lead-zoomed']) leads.splice(leads.findIndex(l => l.id === id), 1);

    // Admin report for the current event.
    report = await service.report();
    assert.deepEqual(report.summary, { registrations: 10, new_leads: 1, existing_leads: 9, hubcrm_customers: 2, links_ready: 9, link_errors: 1, clicked: 2 });
    assert.equal(report.rows.find(r => r.email === 'hub@example.invalid').hubcrm_customer_id, '9001');
    assert.equal(report.rows.find(r => r.email === 'new@example.invalid').join_clicks, 2);
    assert.equal(report.rows.find(r => r.email === 'old@example.invalid').phone, '0911111111');
    assert.equal((await service.report({ dateFrom: '2000-01-01', dateTo: '2000-01-02' })).summary.registrations, 0);

    // A new event in admin: an old link moves to it with a new personal Zoom link.
    await service.saveSettings({ zoom_kind: 'webinar', zoom_id: '99887766554' });
    const moved = await service.session(created.access_key);
    assert.notEqual(moved.access_key, created.access_key);
    assert.equal(moved.ready, true);
    assert.equal(zoomCalls.at(-1)[1], '/webinars/99887766554/registrants');
    assert.match(await service.join(moved.access_key, ctx), /99887766554/);
    report = await service.report();
    assert.equal(report.summary.registrations, 1);
    assert.equal(report.events.length, 2);
    assert.equal((await service.report({ event: 'meeting:81234567890' })).summary.registrations, 10);

    // The meeting's registration form decides which fields are sent; unanswerable ones are flagged.
    zoomQuestions = { questions: [{ field_name: 'last_name', required: true }, { field_name: 'phone', required: true }, { field_name: 'country', required: true }, { field_name: 'org', required: true }], custom_questions: [{ title: 'Bạn biết sự kiện qua đâu?', required: true }] };
    await service.saveSettings({ zoom_kind: 'meeting', zoom_id: '81234567892' });
    leads.push({ id: 'lead-one', name: 'Đạt', email: 'one@example.invalid', phone: '0988888888', region: 'Hồ Chí Minh', page_id: 'trading', registered_at: '2026-04-01T00:00:00.000Z' });
    await service.check({ email: 'one@example.invalid' }, ctx);
    assert.deepEqual(zoomCalls.filter(([m]) => m === 'POST').at(-1)[2], { email: 'one@example.invalid', first_name: 'Đạt', last_name: '.', phone: '0988888888', country: 'VN' });
    const formInfo = await service.zoomCheck();
    assert.deepEqual(formInfo.required_fields, ['Họ', 'Số điện thoại', 'Quốc gia', 'Tổ chức']);
    assert.deepEqual(formInfo.blocking_fields, ['Tổ chức', 'Bạn biết sự kiện qua đâu?']);
    zoomQuestions = { questions: [], custom_questions: [] };

    // HubCRM client: exact email among substring matches, paging, errors.
    process.env.HUBCRM_APP_ID = 'test-app'; process.env.HUBCRM_X_APP_ID = 'test-key';
    const requests = [];
    const pages = [[{ id: 1, email: 'xan@example.invalid', username: 'Other' }], [{ id: 2, email: ' An@Example.invalid ', username: 'An', phone: '0901' }]];
    const fakeFetch = async (url, init) => { requests.push([url, init.headers]); const page = Number(new URL(url).searchParams.get('page')); return { ok: true, status: 200, json: async () => ({ success: true, data: { content: pages[page] || [], last: page >= pages.length - 1 } }) }; };
    assert.deepEqual(await hubcrmModule.findCustomerByEmail('an@example.invalid', { fetchImpl: fakeFetch }), { id: '2', name: 'An', email: 'an@example.invalid', phone: '0901', status: '' });
    assert.equal(new URL(requests[0][0]).searchParams.get('name'), 'an@example.invalid');
    assert.deepEqual([requests[0][1]['APP-ID'], requests[0][1]['X-App-Id']], ['test-app', 'test-key']);
    assert.equal(await hubcrmModule.findCustomerByEmail('none@example.invalid', { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: { content: [], last: true } }) }) }), null);
    await assert.rejects(hubcrmModule.findCustomerByEmail('an@example.invalid', { fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ success: false, errorCode: 'UNAUTHORIZED' }) }) }), /HTTP 401/);

    // Zoom check and enabling auto-approved registration.
    const info = await service.zoomCheck({ zoom_kind: 'meeting', zoom_id: '81234567890' });
    assert.deepEqual([info.topic, info.registration_enabled, info.can_register], ['Buổi chia sẻ', false, true]);
    await service.enableRegistration({ zoom_kind: 'meeting', zoom_id: '81234567890' });
    assert.ok(zoomCalls.some(([m, r, b]) => m === 'PATCH' && r === '/meetings/81234567890' && b.settings.approval_type === 0));

    // Rendering: settings are escaped, empty footer items and missing time are hidden.
    const template = await fs.readFile(path.join(__dirname, '..', 'pages', 'zoom-event', 'index.html'), 'utf8');
    const html = render(template, normalizeSettings({ title_line1: '<script>x</script>', footer_hotline: '', footer_address: '', footer_website: '', starts_at: '2026-10-25T13:00:00Z' }));
    assert.ok(!html.includes('<script>x</script>') && html.includes('&lt;script&gt;x&lt;/script&gt;'));
    assert.ok(!/\{\{/.test(html));
    assert.ok(html.includes('tel:') === false && html.includes('mailto:support@vinmoc.com'));
    assert.ok(html.includes('>20:00<') && html.includes('>25/10/2026<'));
    assert.match(html, /og:image" content="https:\/\/[^"]+\/p\/zoom-event\/assets\/share-default\.jpg"/);
    const bare = render(template, normalizeSettings({ hero_mode: 'image', banner_desktop: '/storage/cms-media/zoom-event/b.jpg', banner_mobile: '/storage/cms-media/zoom-event/m.jpg', footer_company: '', footer_hotline: '', footer_email: '', footer_website: '', footer_address: '' }));
    assert.ok(!bare.includes('site-footer') && bare.includes('hero--image') && bare.includes('media="(max-width: 767px)" srcset="/storage/cms-media/zoom-event/m.jpg"'));
    assert.match(bare, /<section class="card event-card" hidden/);
    assert.equal(normalizeSettings({ banner_desktop: 'javascript:alert(1)' }).banner_desktop, '');

    // The funnel dashboard finds /zoom.
    const funnel = discoverFunnels().find(f => f.slug === 'zoom-event');
    assert.deepEqual([funnel.name, funnel.url, funnel.zoom_event], ['Sự kiện Zoom', '/zoom', true]);
    console.log('zoom event tests passed');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
    await pool.end().catch(() => {});
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
