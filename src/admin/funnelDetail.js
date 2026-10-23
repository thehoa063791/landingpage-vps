import React from 'react';
import { Skeleton, notify } from './ui.js';
import { FunnelCustomers } from './customers.js';
import './funnel.css';

// Dashboard > Funnels > one funnel (roadmap 3.2b), laid out as the approved mockups
// (Funnel, FunnelStudents, FunnelLessons). Registrations are split into people new to the
// system and people who already had a profile (src/funnelPeople.js).
const h = React.createElement;
const fmt = n => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(n || 0));
const money = n => n == null ? '—' : `${fmt(n)} ₫`;
const pct1 = n => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(n || 0)}%`;
const DAY = 86400000;
const vnDate = (d = new Date()) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const shift = (iso, days) => vnDate(new Date(new Date(`${iso}T12:00:00+07:00`).getTime() + days * DAY));
const RANGES = [['today', 'Hôm nay'], ['7d', '7 ngày'], ['30d', '30 ngày'], ['month', 'Tháng này']];
function rangeOf(id) {
  const today = vnDate();
  if (id === 'today') return { from: today, to: today };
  if (id === '7d') return { from: shift(today, -6), to: today };
  if (id === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: shift(today, -29), to: today };
}
const presetOf = (from, to) => RANGES.map(r => r[0]).find(id => { const r = rangeOf(id); return r.from === from && r.to === to; }) || '';
const rangeQuery = r => new URLSearchParams({ dateFrom: `${r.from}T00:00:00+07:00`, dateTo: `${shift(r.to, 1)}T00:00:00+07:00` }).toString();
const ago = value => {
  if (!value) return '—';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / DAY);
  return days <= 0 ? 'Hôm nay' : days === 1 ? 'Hôm qua' : new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' });
};
const daysSince = value => value ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / DAY)) : null;

function useLoad(path, apiFetch, key) {
  const [state, setState] = React.useState({ loading: true, error: '', data: null });
  React.useEffect(() => {
    if (!path) { setState({ loading: false, error: '', data: null }); return undefined; }
    let live = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    apiFetch(path).then(data => { if (live) setState({ loading: false, error: '', data }); })
      .catch(err => { if (live) setState(s => ({ loading: false, error: err.message, data: s.data })); });
    return () => { live = false; };
  }, [path, apiFetch, key]);
  return state;
}

// "↑ 12%" against the previous period; costs are better when they go down.
function delta(now, before, { points = false, lowerIsBetter = false } = {}) {
  if (now == null || before == null || (!points && !before)) return null;
  const change = points ? now - before : (now - before) / before * 100;
  if (!Number.isFinite(change)) return null;
  const good = lowerIsBetter ? change < 0 : change > 0;
  const text = `${change >= 0 ? '↑' : '↓'} ${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: points ? 1 : 0 }).format(Math.abs(change))}${points ? ' điểm' : '%'}`;
  return { text, tone: Math.abs(change) < 0.05 ? 'flat' : good ? 'good' : 'bad' };
}

function Kpi({ label, value, change, hint, primary }) {
  return h('section', { className: primary ? 'fu-kpi primary' : 'fu-kpi' },
    h('h2', null, label),
    h('div', { className: 'fu-kpi-value' }, h('span', null, value), change ? h('span', { className: `fu-delta ${change.tone}` }, change.text) : null),
    h('p', null, hint));
}

export default function FunnelDetail({ slug, apiFetch, currentUser, ui, onSwitch, onBack }) {
  const params = new URLSearchParams(location.search);
  const today = vnDate();
  const [range, setRange] = React.useState(() => ({ from: params.get('dateFrom')?.slice(0, 10) || rangeOf('30d').from, to: params.get('dateTo')?.slice(0, 10) || today }));
  const index = useLoad('/admin/funnels-index', apiFetch);
  const funnel = (index.data?.rows || []).find(f => f.slug === slug);
  const tabs = [
    ['overview', 'Tổng quan'], ['customers', 'Khách hàng'], ['traffic', 'Nguồn & thiết bị'], ['behavior', 'Hành vi trên trang'],
    ...(funnel?.learning ? [['students', 'Học viên'], ['lessons', 'Bài giảng & CTA']] : []),
    ...(funnel?.zoom_event ? [['zoom', 'Đăng ký Zoom'], ['zoom-settings', 'Cài đặt sự kiện']] : []),
  ];
  const [section, setSectionState] = React.useState(params.get('section') || '');
  const active = tabs.some(t => t[0] === section) ? section : funnel?.learning && !section ? 'students' : funnel?.zoom_event && !section ? 'zoom' : 'overview';
  function setSection(id) {
    setSectionState(id);
    const p = new URLSearchParams(location.search); p.set('section', id);
    history.replaceState({}, '', `${location.pathname}?${p}`);
  }
  function pickRange(next) {
    setRange(next);
    const p = new URLSearchParams(location.search); p.set('dateFrom', next.from); p.set('dateTo', next.to);
    history.replaceState({}, '', `${location.pathname}?${p}`);
  }
  const q = rangeQuery(range);
  const people = useLoad(funnel ? `/admin/funnels/${encodeURIComponent(slug)}/people?${q}` : '', apiFetch);
  const [learnKey, setLearnKey] = React.useState(0);
  const learning = useLoad(funnel?.learning && ['students', 'lessons'].includes(active) ? `/admin/funnels/${encodeURIComponent(slug)}/learning?${new URLSearchParams({ dateFrom: `${range.from}T00:00:00+07:00`, dateTo: `${range.to}T23:59:59.999+07:00` })}` : '', apiFetch, learnKey);
  const counts = { customers: people.data?.current?.people, students: learning.data?.summary?.students, lessons: learning.data?.lessons?.length };
  const preset = presetOf(range.from, range.to);
  const scope = { page: slug, dateFrom: `${range.from}T00:00:00+07:00`, dateTo: `${range.to}T23:59:59.999+07:00` };
  const shared = { Button: ui.Button, Card: ui.Card, Input: ui.Input, Field: ui.Field, Badge: ui.Badge, downloadCsv: ui.downloadCsv };
  const running = (people.data?.current?.registrations || 0) > 0;

  return h('div', { className: 'cu-page fu-page' },
    h('div', { className: 'fu-head' },
      h('button', { type: 'button', className: 'cu-icon-btn cu-icon-32', onClick: onBack, 'aria-label': 'Tất cả phễu' }, '‹'),
      h('label', { className: 'fu-label', htmlFor: 'fu-switch' }, 'Phễu'),
      h(ui.Select, { className: 'fu-switch', value: slug, 'aria-label': 'Chọn phễu', onChange: e => e.target.value && onSwitch(e.target.value) },
        (index.data?.rows || [{ slug, name: slug }]).map(f => h('option', { key: f.slug, value: f.slug }, f.name))),
      people.data ? h('span', { className: `cu-badge ${running ? 'cu-badge-success' : 'cu-badge-neutral'}` }, running ? 'Đang chạy' : 'Không có đăng ký') : null,
      h('span', { className: 'cu-grow' }),
      h('div', { className: 'fu-ranges', role: 'group', 'aria-label': 'Khoảng thời gian' },
        RANGES.map(([id, label]) => h('button', { key: id, type: 'button', 'aria-pressed': preset === id, className: preset === id ? 'on' : '', onClick: () => pickRange(rangeOf(id)) }, label))),
      h('div', { className: 'fu-dates' },
        h('input', { type: 'date', value: range.from, max: range.to, 'aria-label': 'Từ ngày', onChange: e => e.target.value && pickRange({ ...range, from: e.target.value }) }),
        h('span', { 'aria-hidden': true }, '–'),
        h('input', { type: 'date', value: range.to, min: range.from, max: today, 'aria-label': 'Đến ngày', onChange: e => e.target.value && pickRange({ ...range, to: e.target.value }) }))),
    h('nav', { className: 'fu-tabs', role: 'tablist', 'aria-label': 'Các mục của phễu' },
      tabs.map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': active === id, className: active === id ? 'on' : '', onClick: () => setSection(id) },
        label, counts[id] != null ? h('span', null, fmt(counts[id])) : null))),
    !funnel && index.loading ? h('div', { className: 'cu-card cu-pad' }, h(Skeleton))
      : !funnel ? h('div', { className: 'cu-card cu-empty' }, 'Không tìm thấy phễu.')
      : active === 'overview' ? h(Overview, { people, slug, apiFetch, q })
      : active === 'customers' ? h(FunnelCustomers, { apiFetch, currentUser, ui, pages: funnel.page_ids })
      : active === 'traffic' ? h('div', { className: 'fu-stack' }, h(ui.AnalyticsPage, { key: `t-${q}`, view: 'traffic', apiFetch, scope }), h(ui.AnalyticsPage, { key: `d-${q}`, view: 'devices', apiFetch, scope }))
      : active === 'behavior' ? h(ui.AnalyticsPage, { key: `b-${q}`, view: 'behavior', apiFetch, scope })
      : active === 'students' ? h(Students, { learning, funnel, apiFetch, ui })
      : active === 'lessons' ? h(Lessons, { learning, funnel, apiFetch, canEdit: currentUser?.role === 'admin', ui, shared, range, onChanged: () => setLearnKey(k => k + 1) })
      : h(ui.ZoomEventAdmin, { key: active, section: active, apiFetch, canEdit: currentUser?.role === 'admin', ui: shared }));
}

// ── Tổng quan ────────────────────────────────────────────────────────────────
function Overview({ people, slug, apiFetch, q }) {
  const [touch, setTouch] = React.useState('last_touch');
  const report = useLoad(`/admin/funnels/${encodeURIComponent(slug)}?${q}`, apiFetch);
  const d = people.data;
  if (!d) return people.error ? h('div', { className: 'cu-card cu-empty cu-error' }, people.error) : h('div', { className: 'cu-card cu-pad' }, h(Skeleton));
  const c = d.current, p = d.previous, s = d.spend;
  const rate = c.visits ? c.registrations / c.visits * 100 : null;
  const prevRate = p.visits ? p.registrations / p.visits * 100 : null;
  const perReg = s.total != null && c.registrations ? s.total / c.registrations : null;
  const perNew = s.total != null && c.new_people ? s.total / c.new_people : null;
  const prevPerReg = s.previous_total && p.registrations ? s.previous_total / p.registrations : null;
  const prevPerNew = s.previous_total && p.new_people ? s.previous_total / p.new_people : null;
  const coverage = s.paid_registrations ? `Khớp được chiến dịch cho ${fmt(s.matched_registrations)}/${fmt(s.paid_registrations)} lượt từ Facebook` : 'Chưa có lượt nào khớp chiến dịch quảng cáo';
  // One bar per day of the range, also the days without registrations.
  const byDay = Object.fromEntries(d.daily.map(row => [row.day, row]));
  const days = [];
  for (let day = vnDate(new Date(d.range.from)); day < vnDate(new Date(d.range.to)) || (day === vnDate(new Date(d.range.to)) && days.length === 0); day = shift(day, 1)) {
    days.push({ day, new: byDay[day]?.new || 0, existing: byDay[day]?.existing || 0 });
    if (days.length > 92) break;
  }
  const peak = Math.max(1, ...days.map(x => x.new + x.existing));
  const freshPct = c.registrations ? Math.round(c.new_people / c.registrations * 100) : 0;
  const originTotal = d.origins.reduce((sum, o) => sum + o.count, 0);
  const sources = d.sources[touch];
  const steps = report.data?.steps || [];
  return h(React.Fragment, null,
    h('div', { className: 'fu-kpis' },
      h(Kpi, { primary: true, label: 'Lượt đăng ký', value: fmt(c.registrations), change: delta(c.registrations, p.registrations), hint: `${fmt(c.people)} người · so với cùng kỳ trước` }),
      h(Kpi, { label: 'Lượt truy cập', value: fmt(c.visits), change: delta(c.visits, p.visits), hint: 'Phiên vào trang phễu' }),
      h(Kpi, { label: 'Tỷ lệ chuyển đổi', value: rate == null ? '—' : pct1(rate), change: rate != null && prevRate != null ? delta(rate, prevRate, { points: true }) : null, hint: 'Lượt đăng ký / lượt truy cập' }),
      h(Kpi, { label: 'Chi phí / lượt đăng ký', value: money(perReg == null ? null : Math.round(perReg)), change: delta(perReg, prevPerReg, { lowerIsBetter: true }), hint: perReg == null ? coverage : `Từ Ads Performance · ${coverage.toLowerCase()}` }),
      h(Kpi, { label: 'Chi phí / người mới', value: money(perNew == null ? null : Math.round(perNew)), change: delta(perNew, prevPerNew, { lowerIsBetter: true }), hint: 'Chỉ tính người lần đầu vào hệ thống' })),
    h('div', { className: 'fu-row' },
      h('section', { className: 'cu-card fu-chart-card', 'aria-label': 'Lượt đăng ký theo ngày' },
        h('div', { className: 'fu-card-head' }, h('h2', null, 'Lượt đăng ký theo ngày'),
          h('span', { className: 'fu-legend' }, h('i', { className: 'new' }), 'Người mới'), h('span', { className: 'fu-legend' }, h('i', { className: 'old' }), 'Người đã có')),
        h('div', { className: 'fu-bars', role: 'img', 'aria-label': `Biểu đồ cột ${days.length} ngày: ${fmt(c.new_people)} người mới, ${fmt(c.existing_people)} người đã có` },
          days.map(x => h('div', { key: x.day, className: 'fu-bar', title: `${x.day.slice(8)}/${x.day.slice(5, 7)}: ${x.new} người mới, ${x.existing} người đã có` },
            h('div', { className: 'old', style: { height: `${x.existing / peak * 100}%` } }),
            h('div', { className: 'new', style: { height: `${x.new / peak * 100}%` } })))),
        h('div', { className: 'fu-axis' }, h('span', null, days.length === 1 ? '00:00' : `${days[0].day.slice(8)}/${days[0].day.slice(5, 7)}`), h('span', null, 'Hôm nay'))),
      h('section', { className: 'cu-card fu-who', 'aria-label': 'Lượt đăng ký gồm những ai' },
        h('h2', null, 'Lượt đăng ký gồm những ai'),
        h('div', { className: 'fu-split', 'aria-hidden': true }, h('div', { className: 'new', style: { width: `${freshPct}%` } }), h('div', { className: 'old' })),
        h('div', { className: 'cu-kv' }, h('span', null, 'Người mới'), h('strong', null, `${fmt(c.new_people)} · ${freshPct}%`)),
        h('div', { className: 'cu-kv' }, h('span', null, 'Người đã có từ phễu khác'), h('strong', null, fmt(c.existing_people))),
        d.origins.length ? h('ul', { className: 'fu-origins' }, d.origins.slice(0, 5).map(o => h('li', { key: o.page_id }, h('span', null, `đến từ ${o.page_id}`), h('span', null, `${Math.round(o.count / originTotal * 100)}%`)))) : null,
        h('div', { className: 'fu-who-foot' },
          h('div', { className: 'cu-kv' }, h('span', null, 'Gửi lại form (không tính lượt)'), h('strong', null, fmt(c.repeats))),
          c.same_person_other_email ? h('span', { className: 'cu-sub' }, `${fmt(c.same_person_other_email)} lượt là cùng một người đăng ký bằng email khác (đã gắn chung hồ sơ).`) : null))),
    h('section', { className: 'cu-card', 'aria-label': 'Theo nguồn' },
      h('div', { className: 'fu-card-head fu-pad' },
        h('h2', null, touch === 'last_touch' ? 'Theo nguồn (Last Touch)' : 'Theo nguồn (First Touch)'),
        h('button', { type: 'button', className: 'cu-btn cu-btn-plain cu-btn-sm', onClick: () => setTouch(t => t === 'last_touch' ? 'first_touch' : 'last_touch') }, touch === 'last_touch' ? 'Xem theo First Touch' : 'Xem theo Last Touch')),
      h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table fu-table' },
        h('thead', null, h('tr', null, ['Nguồn · chiến dịch', 'Lượt truy cập', 'Lượt đăng ký', 'Tỷ lệ', 'Người mới', 'Chi phí / người mới'].map((label, i) => h('th', { key: label, className: i ? 'cu-right' : '' }, label)))),
        h('tbody', null, sources.length ? sources.map(row => h('tr', { key: `${row.source}|${row.campaign}`, className: 'cu-row' },
          h('td', null, [row.source, row.campaign].filter(Boolean).join(' · ')),
          h('td', { className: 'cu-right cu-tabular' }, row.visits ? fmt(row.visits) : '—'),
          h('td', { className: 'cu-right cu-tabular' }, fmt(row.registrations)),
          h('td', { className: 'cu-right cu-tabular' }, row.visits ? pct1(row.registrations / row.visits * 100) : '—'),
          h('td', { className: 'cu-right cu-tabular' }, fmt(row.new_people)),
          h('td', { className: 'cu-right cu-tabular' }, money(row.cost_per_new)))) : h('tr', null, h('td', { colSpan: 6, className: 'cu-empty' }, 'Chưa có lượt đăng ký trong khoảng này.')))))),
    steps.length ? h('section', { className: 'cu-card', 'aria-label': 'Các bước và doanh thu' },
      h('div', { className: 'fu-card-head fu-pad' }, h('h2', null, 'Các bước của phễu'), report.data?.revenue ? h('span', { className: 'cu-muted' }, `Doanh thu ${money(report.data.revenue)} · ${fmt(report.data.orders)} đơn`) : null),
      h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table fu-table' },
        h('thead', null, h('tr', null, ['Bước', 'Lượt xem', 'Người xem', 'Đăng ký', 'Tỷ lệ', 'Doanh thu'].map((label, i) => h('th', { key: label, className: i ? 'cu-right' : '' }, label)))),
        h('tbody', null, steps.map(step => h('tr', { key: step.id, className: 'cu-row' },
          h('td', null, step.name), h('td', { className: 'cu-right cu-tabular' }, fmt(step.pageviews)), h('td', { className: 'cu-right cu-tabular' }, fmt(step.unique_visitors)),
          h('td', { className: 'cu-right cu-tabular' }, step.optins ? fmt(step.optins) : '—'), h('td', { className: 'cu-right cu-tabular' }, step.optins ? pct1(step.optin_rate) : '—'),
          h('td', { className: 'cu-right cu-tabular' }, step.revenue ? money(step.revenue) : '—'))))))) : null);
}

// ── Học viên ─────────────────────────────────────────────────────────────────
const BUCKETS = [['none', 'Chưa xem', '#e3e3e3'], ['q1', 'Dưới 25%', '#91d0ff'], ['q2', '25–50%', '#2a78d6'], ['q3', '50–95%', '#4a3aa7'], ['done', 'Hoàn thành', '#29845a']];
const started = s => s.lessons.some(l => l.opened || l.watched_seconds > 0 || l.completed);
function bucketOf(s) {
  if (s.total_lessons && s.completed >= s.total_lessons) return 'done';
  if (!started(s)) return 'none';
  return s.watch_percent < 25 ? 'q1' : s.watch_percent < 50 ? 'q2' : 'q3';
}
const lastActivity = s => s.lessons.map(l => l.updated_at || l.completed_at).filter(Boolean).sort().pop() || null;
function currentLesson(s) {
  const visible = s.lessons.filter(l => l.is_visible);
  const index = visible.findIndex(l => !l.completed && (l.opened || l.watched_seconds > 0));
  const next = index >= 0 ? index : visible.findIndex(l => !l.completed);
  if (!started(s)) return 'Chưa mở bài nào';
  if (next < 0) return 'Đã xem hết';
  return `Bài ${next + 1} · ${visible[next].title}`;
}

function Students({ learning, funnel, apiFetch, ui }) {
  const [bucket, setBucket] = React.useState('');
  const [stale, setStale] = React.useState(false);
  const [view, setView] = React.useState('students');
  const [query, setQuery] = React.useState('');
  const [lesson, setLesson] = React.useState('');
  const [page, setPage] = React.useState(1);
  const users = useLoad('/admin/crm/users', apiFetch);
  React.useEffect(() => setPage(1), [bucket, stale, view, query, lesson]);
  const d = learning.data;
  if (!d) return learning.error ? h('div', { className: 'cu-card cu-empty cu-error' }, learning.error) : h('div', { className: 'cu-card cu-pad' }, h(Skeleton));
  const saleOf = Object.fromEntries((users.data?.rows || []).map(u => [u.user_id, u.full_name || u.email]));
  const students = d.students.map(s => ({ ...s, bucket: bucketOf(s), last: lastActivity(s) }));
  const total = students.length;
  const startedCount = students.filter(started).length;
  const avgWatch = total ? students.reduce((sum, s) => sum + (s.watch_percent || 0), 0) / total : 0;
  const counts = Object.fromEntries(BUCKETS.map(([id]) => [id, students.filter(s => s.bucket === id).length]));
  const needle = query.trim().toLowerCase();
  const match = row => !needle || [row.name, row.email, row.phone].some(v => String(v || '').toLowerCase().includes(needle));
  const rows = view === 'students'
    ? students.filter(s => (!bucket || s.bucket === bucket) && (!stale || (daysSince(s.last) ?? 999) > 7) && match(s) && (!lesson || s.lessons.some(l => l.lesson_id === Number(lesson) && (l.opened || l.watched_seconds > 0))))
    : d.history.filter(r => match(r) && (!lesson || r.lesson_id === Number(lesson)));
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const shown = rows.slice((Math.min(page, pages) - 1) * 25, Math.min(page, pages) * 25);
  async function remind(s) {
    const url = `${location.origin}${funnel.url}/learn`;
    try { await navigator.clipboard.writeText(url); notify('Đã chép link vào học. Dán vào tin nhắn Zalo.'); } catch { notify(url); }
    const phone = String(s.phone || '').replace(/\D/g, '');
    if (phone) window.open(`https://zalo.me/${phone}`, '_blank', 'noopener');
  }
  async function openPerson(registrationId) {
    try {
      const { contact_id } = await apiFetch(`/admin/contacts/by-registration/${encodeURIComponent(registrationId)}`);
      await ui.openModule?.('customers');
      history.replaceState(null, '', `/admin/view/customers?contact=${encodeURIComponent(contact_id)}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch { /* shown */ }
  }
  return h(React.Fragment, null,
    h('div', { className: 'fu-kpis fu-kpis-4' },
      h(Kpi, { label: 'Học viên', value: fmt(total), hint: 'Đăng ký trong khoảng đã chọn' }),
      h(Kpi, { label: 'Đã bắt đầu học', value: `${fmt(startedCount)} · ${total ? Math.round(startedCount / total * 100) : 0}%`, hint: 'Mở ít nhất một bài' }),
      h(Kpi, { label: 'Hoàn thành khóa', value: `${fmt(counts.done)} · ${total ? Math.round(counts.done / total * 100) : 0}%`, hint: 'Xem ≥95% mọi bài đang hiển thị' }),
      h(Kpi, { label: 'Đã xem trung bình', value: `${Math.round(avgWatch)}%`, hint: 'Theo thời lượng thực xem, tua không tính' })),
    h('section', { className: 'cu-card fu-pad fu-stack-12', 'aria-label': 'Học viên dừng ở đâu' },
      h('h2', null, 'Học viên dừng ở đâu'),
      h('div', { className: 'fu-split fu-split-5', 'aria-hidden': true }, BUCKETS.map(([id, , color]) => counts[id] ? h('div', { key: id, style: { flex: counts[id], background: color } }) : null)),
      h('div', { className: 'cu-chips' }, BUCKETS.map(([id, label, color]) => h('button', { key: id, type: 'button', 'aria-pressed': bucket === id, className: bucket === id ? 'fu-bucket on' : 'fu-bucket', onClick: () => setBucket(bucket === id ? '' : id) },
        h('i', { style: { background: color } }), `${label} · `, h('strong', null, fmt(counts[id])))))),
    h('section', { className: 'cu-card cu-list-card', 'aria-label': 'Danh sách học viên' },
      h('div', { className: 'cu-views', role: 'tablist', 'aria-label': 'Xem' },
        [['students', 'Danh sách học viên'], ['history', 'Lịch sử mở video']].map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': view === id, className: view === id ? 'cu-view on' : 'cu-view', onClick: () => setView(id) }, label))),
      h('div', { className: 'cu-bar' },
        h('label', { className: 'cu-search' }, h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true }, h('circle', { cx: 11, cy: 11, r: 7 }), h('path', { d: 'm20 20-3.5-3.5' })),
          h('input', { type: 'search', value: query, onChange: e => setQuery(e.target.value), placeholder: 'Tìm theo tên, SĐT hoặc email', 'aria-label': 'Tìm học viên' })),
        view === 'students' ? h('label', { className: 'cu-check fu-stale' }, h('input', { type: 'checkbox', checked: stale, onChange: () => setStale(v => !v) }), 'Quá 7 ngày chưa quay lại') : null,
        h(ui.Select, { className: lesson ? 'cu-filter on' : 'cu-filter', value: lesson, 'aria-label': 'Bài học', onChange: e => setLesson(e.target.value) },
          h('option', { value: '' }, 'Bài học'), d.lessons.map((l, i) => h('option', { key: l.id, value: String(l.id) }, `${i + 1}. ${l.title}`)))),
      h('div', { className: 'cu-table-wrap' }, view === 'students' ? h('table', { className: 'cu-table fu-table' },
        h('thead', null, h('tr', null, ['Học viên', 'Bài đang học', 'Tiến độ', 'Học gần nhất', 'Sale'].map(l => h('th', { key: l }, l)), h('th', null, h('span', { className: 'sr-only' }, 'Thao tác')))),
        h('tbody', null, shown.map(s => {
          const gap = daysSince(s.last);
          const value = s.bucket === 'done' ? 100 : Math.round(s.watch_percent || 0);
          return h('tr', { key: s.id, className: 'cu-row' },
            h('td', null, h('button', { type: 'button', className: 'cu-link fu-person', onClick: () => openPerson(s.id) }, s.name || 'Chưa có tên'), h('div', { className: 'cu-sub' }, s.email)),
            h('td', null, currentLesson(s)),
            h('td', null, h('div', { className: 'fu-progress' },
              h('div', { role: 'progressbar', 'aria-label': `Tiến độ ${s.name}`, 'aria-valuenow': value, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div', { style: { width: `${value}%`, background: value === 100 ? '#29845a' : '#2a78d6' } })),
              h('span', { className: 'cu-tabular' }, `${value}%`))),
            h('td', { className: 'cu-nowrap' }, ago(s.last), h('div', { className: 'cu-sub', style: gap > 7 ? { color: 'var(--destructive)' } : null }, s.last ? (gap === 0 ? 'đang học' : `${gap} ngày chưa quay lại`) : '')),
            h('td', { className: saleOf[s.assigned_to] ? 'cu-nowrap' : 'cu-nowrap cu-muted' }, saleOf[s.assigned_to] || 'Chưa giao'),
            h('td', { className: 'cu-right' }, h('button', { type: 'button', className: 'cu-btn cu-btn-plain cu-btn-sm', onClick: () => remind(s) }, 'Nhắc học')));
        })))
        : h('table', { className: 'cu-table fu-table' },
          h('thead', null, h('tr', null, ['Học viên', 'Bài học', 'Mở lúc', 'Đã xem'].map(l => h('th', { key: l }, l)))),
          h('tbody', null, shown.map((r, i) => h('tr', { key: `${r.id}-${i}`, className: 'cu-row' },
            h('td', null, h('button', { type: 'button', className: 'cu-link fu-person', onClick: () => openPerson(r.registration_id) }, r.name || 'Chưa có tên'), h('div', { className: 'cu-sub' }, r.email)),
            h('td', null, r.title), h('td', { className: 'cu-nowrap' }, new Date(r.opened_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
            h('td', null, r.completed ? h('span', { className: 'cu-badge cu-badge-success' }, 'Xong') : `${Math.round(r.watch_percent || 0)}%`)))))),
      !rows.length ? h('div', { className: 'cu-empty' }, 'Không có học viên khớp bộ lọc.') : null,
      h('div', { className: 'cu-footer' },
        h('span', null, `${fmt(rows.length)} ${view === 'students' ? 'học viên' : 'lượt mở'}${bucket || stale || needle || lesson ? ' khớp bộ lọc' : ''}`),
        h('div', { className: 'cu-row-gap' },
          h('button', { type: 'button', className: 'cu-page-btn', 'aria-label': 'Trang trước', disabled: page <= 1, onClick: () => setPage(p => p - 1) }, '‹'),
          h('button', { type: 'button', className: 'cu-page-btn', 'aria-label': 'Trang sau', disabled: page >= pages, onClick: () => setPage(p => p + 1) }, '›')))));
}

// ── Bài giảng & CTA ──────────────────────────────────────────────────────────
function Lessons({ learning, funnel, apiFetch, canEdit, ui, shared, range, onChanged }) {
  const [closed, setClosed] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const d = learning.data;
  if (!d) return learning.error ? h('div', { className: 'cu-card cu-empty cu-error' }, learning.error) : h('div', { className: 'cu-card cu-pad' }, h(Skeleton));
  const total = d.summary.students || 0;
  const stageVisible = id => !id || d.stages.find(s => Number(s.id) === Number(id))?.is_visible !== false;
  const ordered = [...d.stages, { id: 0, title: 'Chưa phân chương' }].map(s => ({ ...s, lessons: d.lessons.filter(l => Number(l.stage_id || 0) === Number(s.id)) })).filter(s => s.lessons.length);
  const visibleLessons = ordered.flatMap(s => s.lessons).filter(l => l.is_visible !== false && stageVisible(l.stage_id));
  const retention = visibleLessons.map(l => total ? Math.min(100, Math.round(l.viewers / total * 100)) : 0);
  let worst = -1, drop = 0;
  retention.forEach((v, i) => { if (i && retention[i - 1] - v > drop) { drop = retention[i - 1] - v; worst = i; } });
  const minutes = s => `${Math.floor((s || 0) / 60)}:${String(Math.round((s || 0) % 60)).padStart(2, '0')}`;
  async function toggle(l) {
    setBusy(true);
    try { await apiFetch(`/admin/funnels/${encodeURIComponent(funnel.slug)}/learning/lessons/${l.id}`, { method: 'PATCH', body: JSON.stringify({ is_visible: l.is_visible === false }) }); setRevision(r => r + 1); onChanged(); }
    catch { /* shown */ } finally { setBusy(false); }
  }
  return h(React.Fragment, null,
    h('section', { className: 'cu-card fu-pad fu-stack-12', 'aria-label': 'Tỷ lệ người xem qua từng bài' },
      h('div', { className: 'fu-card-head' }, h('h2', null, 'Học viên còn xem đến bài nào'),
        worst > 0 ? h('span', { className: 'cu-sub' }, `Rơi nhiều nhất: bài ${worst} → bài ${worst + 1} (−${drop} điểm)`) : null),
      visibleLessons.length ? h('div', { className: 'fu-bars fu-bars-retention', role: 'img', 'aria-label': `Biểu đồ cột: phần trăm học viên xem từng bài, từ ${retention[0]}% ở bài 1 đến ${retention[retention.length - 1]}% ở bài ${retention.length}` },
        retention.map((v, i) => h('div', { key: i, className: 'fu-bar', title: `Bài ${i + 1}: ${v}%` }, h('div', { className: i === worst ? 'warn' : 'new', style: { height: `${Math.max(v, 1)}%` } })))) : h('p', { className: 'cu-muted' }, 'Chưa có bài đang hiển thị.'),
      visibleLessons.length ? h('div', { className: 'fu-axis' }, h('span', null, `Bài 1 · ${retention[0]}% học viên`), h('span', null, `Bài ${retention.length} · ${retention[retention.length - 1]}%`)) : null),
    h('section', { className: 'cu-card', 'aria-label': 'Chương và bài giảng' },
      h('div', { className: 'fu-card-head fu-pad' }, h('h2', null, 'Chương và bài giảng'), h('span', { className: 'cu-sub' }, 'Bài ẩn không tính vào tiến độ. Sửa, sắp xếp và thêm bài ở mục "Quản lý" bên dưới.')),
      ordered.map((s, stageIndex) => {
        const open = !closed[s.id];
        const before = ordered.slice(0, stageIndex).reduce((sum, x) => sum + x.lessons.length, 0);
        return h('div', { key: s.id, className: 'fu-stage' },
          h('button', { type: 'button', className: 'fu-stage-head', 'aria-expanded': open, onClick: () => setClosed(c => ({ ...c, [s.id]: open })) },
            h('strong', null, s.title), s.is_visible === false ? h('span', { className: 'cu-badge cu-badge-neutral' }, 'Chương đang ẩn') : null, h('span', { className: 'cu-grow' }), h('span', { className: 'cu-muted' }, `${s.lessons.length} bài`), h('span', { 'aria-hidden': true }, open ? '▾' : '▸')),
          open ? h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table fu-table fu-lesson-table' },
            h('thead', null, h('tr', null, ['#', 'Bài', 'Thời lượng', 'Người xem', 'Xem trung bình', 'Hoàn thành', 'Hiển thị'].map((label, i) => h('th', { key: label, className: i >= 2 && i <= 5 ? 'cu-right' : '' }, label)))),
            h('tbody', null, s.lessons.map((l, i) => {
              const hidden = l.is_visible === false;
              return h('tr', { key: l.id, className: hidden ? 'cu-row fu-dim' : 'cu-row' },
                h('td', { className: 'cu-muted' }, before + i + 1),
                h('td', { className: 'cu-strong' }, l.title),
                h('td', { className: 'cu-right cu-tabular' }, minutes(l.duration)),
                h('td', { className: 'cu-right cu-tabular' }, hidden ? '—' : fmt(l.viewers)),
                h('td', { className: 'cu-right cu-tabular' }, hidden ? '—' : `${Math.round(l.avg_watch_percent)}%`),
                h('td', { className: 'cu-right cu-tabular' }, hidden ? '—' : `${Math.round(l.completion_rate)}%`),
                h('td', null, canEdit ? h('label', { className: 'cu-check' }, h('input', { type: 'checkbox', checked: !hidden, disabled: busy, onChange: () => toggle(l) }), hidden ? 'Ẩn' : 'Hiện') : (hidden ? 'Ẩn' : 'Hiện')));
            })))) : null);
      })),
    h('section', { className: 'fu-manage', 'aria-label': 'Quản lý bài giảng và CTA' },
      h('h2', null, 'Quản lý chương, bài giảng và CTA'),
      h(ui.CourseLearning, { key: revision, course: funnel.slug, title: funnel.name, apiFetch, canEdit, ui: shared, only: ['lessons', 'cta'], range, hideHeader: true })));
}
