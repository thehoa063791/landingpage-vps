// Synthetic, browser-only fixtures. This module never fetches or writes server data.
export const demoUser = { id: 'demo-admin', user_id: 'demo-admin', role: 'admin', full_name: 'Quản trị viên demo', email: 'admin@example.test' };
const copy = value => JSON.parse(JSON.stringify(value));
const day = offset => {
  const date = new Date(); date.setDate(date.getDate() - offset);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};
const timestamp = offset => `${day(offset)}T03:00:00+07:00`;
const users = ['Trần Thùy Linh', 'Nguyễn Hoàng Nam', 'Lê Minh Phương'].map((full_name, i) => ({ user_id: `demo-sale-${i}`, full_name, email: `sale${i + 1}@example.test`, role: 'sale', active: true }));
const categories = [{ id: 'demo-category', name: 'Chăm sóc', color: '#616161' }];
const tags = ['Quan tâm', 'Đã tư vấn', 'Khách hàng'].map((name, i) => ({ id: `demo-tag-${i}`, name, category_id: 'demo-category', category_name: 'Chăm sóc', active: true, people_count: 8 + i * 3, color: '#616161' }));
const fields = [{ id: 'demo-budget', key: 'budget', label: 'Ngân sách dự kiến', type: 'currency', group_name: 'Nhu cầu', active: true }, { id: 'demo-goal', key: 'goal', label: 'Mục tiêu', type: 'dropdown', options: ['Quản lý dòng tiền', 'Đầu tư dài hạn', 'Tự do tài chính'], active: true }];
const names = ['Nguyễn Minh Anh', 'Trần Quốc Bảo', 'Lê Ngọc Chi', 'Phạm Hoàng Dũng', 'Võ Thanh Hà', 'Đặng Thu Hương', 'Bùi Gia Huy', 'Ngô Khánh Linh', 'Đỗ Tuấn Minh', 'Hoàng Bảo Ngọc', 'Vũ Phương Thảo', 'Đinh Đức Thành', 'Nguyễn Lan Vy', 'Lê Hải Yến', 'Trần Đức Khang', 'Phạm Anh Tú', 'Nguyễn Quỳnh Mai', 'Võ Nhật Long', 'Đỗ Thùy Dương', 'Bùi Anh Kiệt', 'Trần Gia Hân', 'Lê Ngọc Sơn', 'Nguyễn Bảo Trâm', 'Phạm Thành Đạt'];
let leads = names.map((name, i) => ({
  id: `demo-lead-${i + 1}`, name, email: `khach${i + 1}@example.test`, phone: `090000${String(i + 1).padStart(4, '0')}`,
  page_id: ['trading', 'hoc-trading', 'richlife'][i % 3], channel: ['facebook', 'google', 'direct', 'email'][i % 4],
  source: ['facebook', 'google', 'direct', 'newsletter'][i % 4], medium: i % 4 < 2 ? 'cpc' : 'organic',
  assigned_to: users[i % 3].user_id, assigned_name: users[i % 3].full_name, assigned_profile: users[i % 3],
  registered_at: timestamp(i % 14), last_interaction_at: timestamp(i % 5), region: ['Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng'][i % 3], city: ['Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng'][i % 3], country: 'Việt Nam',
  latest_sale_note: ['Đã trao đổi nhu cầu, hẹn tư vấn vào chiều mai.', 'Quan tâm khóa học dòng tiền, cần gửi tài liệu.', 'Đã tham gia webinar, đang cân nhắc đăng ký.'][i % 3],
  notes: [{ id: `demo-note-${i}`, body: 'Đã trao đổi nhu cầu và gửi tài liệu giới thiệu. Khách muốn được tư vấn thêm về kế hoạch tài chính.', interaction_type: 'call', created_at: timestamp(i % 5), author: users[i % 3], author_name: users[i % 3].full_name }],
  tags: [tags[i % 3]], custom_fields: fields.map(field => ({ ...field, value: field.type === 'currency' ? (i + 1) * 1000000 : field.options[i % 3] })),
  custom_values: { 'demo-budget': (i + 1) * 1000000, 'demo-goal': 'Quản lý dòng tiền' },
  orders: i % 3 === 0 ? [{ id: `demo-order-${i}`, status: 'won', amount: 2900000, currency: 'VND', payment_method: 'Chuyển khoản', created_at: timestamp(1), created_by_email: 'admin@example.test', history: [] }] : [],
  device: { device_type: i % 2 ? 'desktop' : 'mobile', browser: 'Chrome', os: i % 2 ? 'Windows' : 'Android' }, geo: { country: 'Việt Nam', city: ['Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng'][i % 3] },
  survey: { 'Mục tiêu': 'Quản lý dòng tiền tốt hơn', 'Kinh nghiệm': 'Đã có kiến thức cơ bản' }, interest: 'Tài chính cá nhân', zoom_attendances: [], attendance: 'online',
}));
const analytics = {
  stats: { pageviews: 12840, ctaClicks: 2890, formOpens: 1840, conversions: 436, conversionRate: 3.4, formConvRate: 23.7, exitIntent: 248 },
  regByDay: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [day(13 - i), [18, 22, 16, 28, 31, 24, 38, 33, 41, 29, 35, 44, 37, 40][i]])),
  trafficChannel: { facebook: 6420, google: 3210, direct: 1926, email: 1284 }, trafficSource: { facebook: 6420, google: 3210, direct: 1926, newsletter: 1284 }, trafficMedium: { cpc: 9630, organic: 1926, email: 1284 },
  leadsByChannel: { facebook: 218, google: 110, direct: 65, email: 43 }, leadsBySource: { facebook: 218, google: 110, direct: 65, newsletter: 43 }, leadsByMedium: { cpc: 328, organic: 65, email: 43 }, leadsByRegion: { 'Hồ Chí Minh': 212, 'Hà Nội': 148, 'Đà Nẵng': 76 },
  scrollDepth: { 25: 10440, 50: 8120, 75: 5640, 90: 3290 }, timeOnPage: { 30: 9800, 60: 7210, 120: 3840 }, ctaByPos: { 'Đầu trang': 1480, 'Giữa trang': 860, 'Cuối trang': 550 },
  deviceType: { mobile: 8320, desktop: 4010, tablet: 510 }, browser: { Chrome: 8100, Safari: 3420, Edge: 1320 }, os: { Android: 5640, iOS: 3190, Windows: 3420, macOS: 590 }, country: { 'Việt Nam': 12160, 'Singapore': 420, 'Hoa Kỳ': 260 }, city: { 'Hồ Chí Minh': 6400, 'Hà Nội': 4120, 'Đà Nẵng': 2320 }, isp: { Viettel: 6100, VNPT: 4210, FPT: 2530 },
};
const meetings = ['Quản lý dòng tiền cá nhân', 'Lập kế hoạch tài chính', 'Đầu tư dài hạn'].map((topic, i) => ({ zoom_meeting_uuid: `demo-meeting-${i}`, zoom_meeting_id: `90000000${i}`, topic, start_time: timestamp(i * 3), unique_participants: 68 - i * 8, matched_leads: 52 - i * 6 }));
let settings = { users, tags, categories, customFields: fields, assignment: users.map((user, i) => ({ ...user, weight: i + 1, assigned_count: 45 + i * 10, target_share: 33.3, actual_share: 31 + i * 2 })) };
let rules = [{ id: 'demo-rule', field: 'channel', operator: 'equals', value: 'facebook', points: 10, active: true }];
let webinar = { enabled: true, configured: true, api_key: '********', webinar_id: 'demo-webinar', schedule: 'demo-schedule', timezone: 'GMT+7', phone_country_code: '+84', join_url_type: 'live_room_url' };
let webhooks = [{ id: 'demo-webhook', name: 'Thông báo lead mới', url: 'https://example.test/hooks/leads', active: true, last_status: 200, last_error: null }];
const campaigns = ['Dòng tiền – Khách hàng mới', 'Webinar – Remarketing', 'Khóa học – Chuyển đổi'].map((name, i) => ({ id: `demo-campaign-${i}`, platform_id: `demo-${i}`, name, campaign_name: name, objective: 'OUTCOME_LEADS', status: i === 2 ? 'PAUSED' : 'ACTIVE', spend: 4200000 - i * 800000, impressions: 180000 - i * 30000, reach: 92000 - i * 10000, frequency: 1.96, cpm: 23333, ctr: 2.8, landing_page_views: 4200 - i * 700, registrations: 130 - i * 20, cpl: 32307, roas: 2.4, revenue: 10080000 - i * 1900000, conversion_goal: 'Lead' }));
const funnels = ['trading', 'hoc-trading', 'richlife'].map((slug, i) => ({ id: slug, slug, name: ['Trading', 'Học trading', 'Richlife'][i], url: `/p/${slug}/`, steps: [{ name: 'Landing page', path: 'index.html', pageviews: 6400 }, { name: 'Cảm ơn', path: 'thank-you.html', pageviews: 218 }], unique_visitors: 5800 - i * 1200, pageviews: 6420 - i * 1200, optins: 218 - i * 45, optin_rate: 3.4, revenue: 17400000 - i * 2900000, orders: 6 - i, earnings_per_visit: 3000 }));

function trafficDemo(url) {
  const page = url.searchParams.get('page') || '';
  const from = (url.searchParams.get('dateFrom') || day(13)).slice(0, 10);
  const to = (url.searchParams.get('dateTo') || day(0)).slice(0, 10);
  const rows = Array.from({ length: 30 }, (_, i) => ['trading', 'hoc-trading', 'richlife'].map((slug, j) => ({ date: day(29 - i), slug, views: 280 + (i * 37 + j * 71) % 340, leads: 9 + (i * 3 + j) % 16 }))).flat().filter(row => row.date >= from && row.date <= to && (!page || row.slug.includes(page.toLowerCase())));
  const result = copy(analytics);
  result.visitsByDay = {}; result.visitsByPage = {}; result.regByDay = {};
  for (const row of rows) {
    result.visitsByDay[row.date] = (result.visitsByDay[row.date] || 0) + row.views;
    result.visitsByPage[row.slug] = (result.visitsByPage[row.slug] || 0) + row.views;
    result.regByDay[row.date] = (result.regByDay[row.date] || 0) + row.leads;
  }
  const views = rows.reduce((sum, row) => sum + row.views, 0), conversions = rows.reduce((sum, row) => sum + row.leads, 0);
  const scale = views / analytics.stats.pageviews;
  for (const key of ['trafficChannel', 'trafficSource', 'trafficMedium', 'leadsByChannel', 'leadsBySource', 'leadsByMedium', 'leadsByRegion', 'scrollDepth', 'timeOnPage', 'ctaByPos', 'deviceType', 'browser', 'os', 'country', 'city', 'isp']) result[key] = Object.fromEntries(Object.entries(result[key]).map(([label, value]) => [label, Math.round(value * scale)]));
  result.stats = { pageviews: views, ctaClicks: Math.round(views * .225), formOpens: Math.round(views * .143), conversions, conversionRate: views ? conversions / views * 100 : 0, formConvRate: views ? conversions / Math.round(views * .143) * 100 : 0, exitIntent: Math.round(views * .019) };
  return result;
}

export async function demoFetch(path, options = {}) {
  const url = new URL(path, location.origin), p = url.pathname;
  const method = (options.method || 'GET').toUpperCase();
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
  if (method !== 'GET') {
    const match = p.match(/^\/admin\/leads\/([^/]+)(?:\/(.*))?$/);
    const lead = match && leads.find(row => row.id === match[1]);
    const section = match?.[2];
    if (p === '/admin/leads' && method === 'POST') { const row = { ...copy(leads[0]), ...body, id: `demo-lead-${Date.now()}`, registered_at: timestamp(0), notes: [], tags: [], orders: [] }; leads.unshift(row); return copy(row); }
    if (lead) {
      if (method === 'DELETE' && !section) leads = leads.filter(row => row.id !== lead.id);
      else if (section === 'custom-fields') { lead.custom_values = { ...lead.custom_values, ...body.values }; lead.custom_fields.forEach(field => { if (field.id in body.values) field.value = body.values[field.id]; }); }
      else if (section === 'tags') lead.tags = tags.filter(tag => body.tag_ids.includes(tag.id));
      else if (section === 'assignee') { const user = users.find(user => user.user_id === body.user_id); lead.assigned_to = body.user_id; lead.assigned_name = user?.full_name; }
      else if (section === 'notes') lead.notes.unshift({ ...body, id: `demo-note-${Date.now()}`, created_at: timestamp(0), author: demoUser });
      else if (section?.startsWith('notes/') && method === 'DELETE') lead.notes = lead.notes.filter(note => note.id !== section.split('/')[1]);
      else if (section === 'orders') lead.orders.unshift({ ...body, id: `demo-order-${Date.now()}`, created_at: timestamp(0), history: [] });
      else if (section?.startsWith('orders/')) { const id = section.split('/')[1]; if (method === 'DELETE') lead.orders = lead.orders.filter(order => order.id !== id); else Object.assign(lead.orders.find(order => order.id === id) || {}, body); }
      return copy(lead);
    }
    if (p.endsWith('/webinar-settings')) webinar = { ...webinar, ...body };
    else if (p.endsWith('/scoring-rules')) rules = body.rules;
    else if (p.endsWith('/settings')) settings = { ...settings, ...body };
    // Other demo actions acknowledge locally; no integration or upload is invoked.
    return { ok: true, settings: copy(webinar), rowsUpserted: 24, demo: true };
  }
  if (p === '/admin/leads') {
    let rows = leads;
    const q = (url.searchParams.get('q') || '').toLowerCase();
    if (q) rows = rows.filter(row => [row.name, row.email, row.phone].some(value => value.toLowerCase().includes(q)));
    if (url.searchParams.get('assignee')) rows = rows.filter(row => row.assigned_to === url.searchParams.get('assignee'));
    for (const filter of JSON.parse(url.searchParams.get('filters') || '[]')) if (filter.field === 'tags') rows = rows.filter(row => row.tags.some(tag => tag.id === filter.value));
    const from = url.searchParams.get('dateFrom'), to = url.searchParams.get('dateTo');
    if (from) rows = rows.filter(row => row.registered_at.slice(0, 10) >= from);
    if (to) rows = rows.filter(row => row.registered_at.slice(0, 10) < to);
    const size = Number(url.searchParams.get('pageSize') || 100), page = Number(url.searchParams.get('pageNum') || 1);
    return copy({ rows: rows.slice((page - 1) * size, page * size), total: rows.length });
  }
  if (p === '/admin/leads/duplicates') return copy({ groups: [{ id: 'demo-duplicate', type: 'phone', key: '0900000001', count: 2, leads: [leads[0], { ...leads[1], phone: leads[0].phone }] }], total: 2 });
  if (p.startsWith('/admin/leads/')) { const row = leads.find(row => row.id === p.split('/')[3]); if (!row) throw new Error('Không tìm thấy lead demo'); return copy(p.endsWith('/summary') ? { score: 25, score_matches: 3, channel: row.channel, country: row.country } : row); }
  if (p === '/admin/funnels') return copy({ rows: funnels });
  if (p.startsWith('/admin/funnels/')) { const row = funnels.find(row => row.slug === p.split('/')[3]); return copy({ ...row, sales: row.orders, average_order_value: 2900000, sources: analytics.leadsByChannel, steps: row.steps.map((step, i) => ({ ...step, id: i, unique_visitors: i ? 218 : 5800, optins: 218, optin_rate: 3.4, sales: i ? 6 : 0, revenue: i ? 17400000 : 0 })) }); }
  if (p.startsWith('/admin/api/')) return trafficDemo(url);
  if (p === '/admin/crm/users') return copy({ rows: users });
  if (p === '/admin/crm/tags') return copy({ tags, categories });
  if (p === '/admin/crm/custom-fields') return copy({ rows: fields, customFields: fields });
  if (p === '/admin/crm/settings') return copy(settings);
  if (p === '/admin/crm/scoring-rules') return copy({ rules });
  if (p === '/admin/crm/webinar-settings') return copy({ settings: webinar });
  if (p === '/admin/webhooks') return copy({ rows: webhooks });
  if (p === '/admin/zoom/meetings') return copy({ rows: meetings });
  if (p === '/admin/zoom/meeting-detail') return copy({ meeting: meetings.find(row => row.zoom_meeting_uuid === url.searchParams.get('uuid')) || meetings[0], stats: { shown_participants: 8, matched_leads: 8, total_participant_duration: 21600 }, participants: leads.slice(0, 8).map((lead, i) => ({ id: `demo-attendance-${i}`, zoom_display_name: lead.name, lead_email: lead.email, lead_phone: lead.phone, join_time: timestamp(0), leave_time: `${day(0)}T04:00:00+07:00`, duration: 2700, lead: { ...lead, assigned_profile: users[i % 3] } })) });
  if (p === '/admin/zoom/status') return { connected: true, mode: 'server-to-server', account_name: 'Vinmoc demo' };
  if (p === '/admin/zoom/sync-status') return { running: false, status: 'completed', last_sync_at: timestamp(0), logs: [] };
  if (p === '/admin/survey') { const result = { total: 184, answered: 172, q1: { 'Mới bắt đầu': 82, 'Đã có kế hoạch': 54, 'Đang đầu tư': 48 }, q2: { 'Chưa kiểm soát chi tiêu': 96, 'Thiếu kế hoạch': 88 }, q3: { 'Chi tiêu theo cảm xúc': 104, 'Thiếu quỹ dự phòng': 80 }, q4: { 'Tự do tài chính': 110, 'Tăng tiết kiệm': 74 }, q5: { 'Đã từng học': 72, 'Chưa từng học': 112 }, q6: { 'Buổi tối': 120, 'Cuối tuần': 64 }, q7: { 'Thiếu thời gian': 102, 'Chi phí': 82 }, interest: { 'Dòng tiền': 92, 'Đầu tư': 58, 'Tiết kiệm': 34 }, q8: ['Mong muốn xây dựng kế hoạch tài chính cho gia đình.', 'Cần hướng dẫn quản lý thu nhập và chi tiêu.'], q9: ['Ưu tiên quỹ dự phòng và tiết kiệm đều đặn.', 'Muốn bắt đầu đầu tư dài hạn.'] }; if (url.searchParams.get('page')) { const scale = trafficDemo(url).stats.conversions / 436; for (const key of ['total', 'answered']) result[key] = Math.round(result[key] * scale); for (const key of ['q1','q2','q3','q4','q5','q6','q7','interest']) result[key] = Object.fromEntries(Object.entries(result[key]).map(([label,value]) => [label, Math.round(value * scale)])); } return result; }
  if (p.startsWith('/ads/api/')) {
    if (p.endsWith('/accounts')) return [{ id: 'demo-ads', name: 'Vinmoc demo', platform: 'meta' }];
    if (p.endsWith('/kpis')) return { spend: 10200000, revenue: 24480000, registrations: 330, landing_page_views: 10500, impressions: 450000, reach: 246000, frequency: 1.83, cpm: 22667, ctr: 2.8, clicks: 12600, cpc: 810, cpl: 30909, roas: 2.4, purchases: 9, cpa: 1133333, conversion_rate: 3.14 };
    if (p.endsWith('/daily')) return Array.from({ length: 14 }, (_, i) => ({ d: day(13 - i), spend: 400000 + i * 35000, revenue: 1000000 + i * 80000, registrations: 12 + i, results: 12 + i }));
    if (p.endsWith('/demographics')) return url.searchParams.get('type') === 'gender' ? [{ k: 'Nữ', results: 192 }, { k: 'Nam', results: 138 }] : [{ k: '25–34', results: 180 }, { k: '35–44', results: 110 }, { k: '45–54', results: 40 }];
    if (p.endsWith('/breakdowns')) return [{ breakdown_value: '25–34', spend: 5800000 }, { breakdown_value: '35–44', spend: 3200000 }, { breakdown_value: '45–54', spend: 1200000 }];
    if (p.endsWith('/top5')) return campaigns.map(row => ({ ...row, ad_name: row.name, results: row.registrations, cpr: row.cpl }));
    return copy(campaigns);
  }
  if (p === '/admin/cms/media') return { folders: [{ name: 'Chiến dịch', path: 'chien-dich' }], files: [{ id: 'demo-image', name: 'Bìa webinar demo.svg', path: 'webinar-demo.svg', mimetype: 'image/svg+xml', size: 4200, url: '/admin/demo-cover.svg' }] };
  return {};
}
