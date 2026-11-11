import React from 'react';
import { Skeleton, notify, Select, Overlay } from './ui.js';
import { openContact } from './customers.js';
import './webinarProgram.css';

// CRM > Webinar Dòng Tiền. Tab Các khóa: the weeks running now first, then one line per cohort,
// the Zalo group edited in a side panel. Tab Lịch học & cài đặt: schedule and API key.
// Cohorts come from the registration time (src/webinarProgram.js).
const h = React.createElement;
const BASE = '/admin/webinar-program';
const WEEKDAYS = [[1, 'Thứ 2'], [2, 'Thứ 3'], [3, 'Thứ 4'], [4, 'Thứ 5'], [5, 'Thứ 6'], [6, 'Thứ 7'], [7, 'Chủ nhật']];
const STATUS = { collecting: ['Đang nhận đăng ký', 'wp-on'], running: ['Đang học', 'wp-run'], upcoming: ['Sắp tới', ''], done: ['Đã học xong', ''] };
const part = (value, options) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23', ...options }).format(new Date(value));
const dm = value => part(value, { day: '2-digit', month: '2-digit' }).replace(/-/g, '/');
const hm = value => part(value, { hour: '2-digit', minute: '2-digit' });
const stamp = value => `${hm(value)} ${dm(value)}`;
const lastMinute = value => new Date(new Date(value).getTime() - 60000);
const evenings = c => c.sessions.length ? `${c.sessions.map(s => dm(s.at).slice(0, 2)).join(', ')}/${dm(c.sessions[0].at).slice(3)}` : '—';
const joinsText = c => c.sessions.length ? (c.session_joins || []).map((n, i) => `B${i + 1}: ${n}`).join(' · ') : '—';
const linkText = link => `Mở ${link.visits} (${link.visitors} người) · Đăng ký ${link.registered} · Vào học ${link.entered}`;

async function copyLink(path) {
  const url = `${location.origin}${path}`;
  try { await navigator.clipboard.writeText(url); notify('Đã chép link tuần'); } catch { notify(url); }
}

function useOverview(apiFetch) {
  const [state, setState] = React.useState({ loading: true, error: '', data: null });
  const [revision, setRevision] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    apiFetch(BASE).then(data => { if (live) setState({ loading: false, error: '', data }); })
      .catch(error => { if (live) setState({ loading: false, error: error.message, data: null }); });
    return () => { live = false; };
  }, [apiFetch, revision]);
  return { ...state, reload: () => setRevision(n => n + 1) };
}

const StatusBadge = ({ status }) => h('span', { className: `wp-status ${STATUS[status][1]}` }, STATUS[status][0]);
const zaloButtonLabel = c => c.zalo_url ? 'Sửa nhóm' : 'Nhập link Zalo';

// A week running now: the numbers and the two things done most often, copy the link and set Zalo.
function WeekCard({ cohort, onEdit, onView, canEdit }) {
  const link = cohort.links?.[0];
  return h('section', { className: 'cu-card wp-week', 'aria-label': `${cohort.label}` },
    h('div', { className: 'wp-week-head' }, h('button', { type: 'button', className: 'cu-link wp-open', 'aria-label': `Xem đo lường ${cohort.label}`, onClick: () => onView(cohort) }, cohort.label), h(StatusBadge, { status: cohort.status }), h('span', { className: 'cu-grow' }), h('span', { className: 'cu-sub cu-tabular' }, `Học ${evenings(cohort)} · ${cohort.sessions[0] ? hm(cohort.sessions[0].at) : ''}`)),
    h('div', { className: 'wp-numbers' },
      [['Số người', cohort.people], ['Vào nhóm Zalo', cohort.zalo_clicks || 0], ['Đăng ký qua link', link?.registered || 0], ['Vào học qua link', link?.entered || 0]].map(([label, value]) => h('div', { key: label }, h('small', null, label), h('strong', { className: 'cu-tabular' }, value)))),
    h('p', { className: 'cu-sub cu-tabular wp-joins' }, `Vào từng buổi: ${joinsText(cohort)}`),
    link ? h('div', { className: 'wp-week-row' }, h('code', { className: 'wp-path' }, link.path), h('button', { type: 'button', className: 'cu-btn cu-btn-secondary cu-btn-sm', onClick: () => copyLink(link.path) }, 'Chép link')) : null,
    h('div', { className: 'wp-week-row' },
      h('span', { className: cohort.zalo_url ? 'wp-zalo-name' : 'wp-zalo-name cu-error' }, cohort.zalo_url ? (cohort.zalo_name || cohort.zalo_url) : 'Chưa có link nhóm Zalo'),
      canEdit ? h('button', { type: 'button', className: cohort.zalo_url ? 'cu-btn cu-btn-secondary cu-btn-sm' : 'cu-btn cu-btn-primary cu-btn-sm', 'aria-label': `Nhóm Zalo ${cohort.label}`, onClick: () => onEdit(cohort) }, zaloButtonLabel(cohort)) : null));
}

function CohortRow({ cohort, onEdit, onView, canEdit }) {
  const link = cohort.links?.[0];
  return h('tr', { className: 'cu-row wp-row', 'data-cohort': cohort.starts_on, onClick: e => { if (!e.target.closest('button, a')) onView(cohort); } },
    h('td', null, h('button', { type: 'button', className: 'cu-link wp-open', 'aria-label': `Xem đo lường ${cohort.label}`, onClick: () => onView(cohort) }, cohort.label)),
    h('td', null, h(StatusBadge, { status: cohort.status })),
    h('td', { className: 'cu-nowrap cu-tabular' }, evenings(cohort), h('div', { className: 'cu-sub' }, `Nhận đến ${stamp(lastMinute(cohort.closes_at))}`)),
    h('td', { className: 'cu-right cu-tabular' }, cohort.people),
    h('td', { className: 'cu-right cu-tabular' }, cohort.zalo_clicks || 0),
    h('td', { className: 'cu-nowrap cu-sub cu-tabular' }, joinsText(cohort)),
    h('td', null, link ? h(React.Fragment, null, h('button', { type: 'button', className: 'cu-link', title: 'Chép link', 'aria-label': `Chép link ${link.slug}`, onClick: () => copyLink(link.path) }, link.slug), h('div', { className: 'cu-sub cu-tabular' }, linkText(link))) : '—'),
    h('td', null, cohort.zalo_url ? h('span', { className: 'wp-zalo-name' }, cohort.zalo_name || 'Đã có link') : h('span', { className: ['collecting', 'running'].includes(cohort.status) ? 'cu-error' : 'cu-muted' }, 'Chưa có')),
    h('td', { className: 'cu-right' }, canEdit ? h('button', { type: 'button', className: 'cu-btn cu-btn-secondary cu-btn-sm cu-nowrap', 'aria-label': `Nhóm Zalo ${cohort.label}`, onClick: () => onEdit(cohort) }, zaloButtonLabel(cohort))
      : h('button', { type: 'button', className: 'cu-btn cu-btn-secondary cu-btn-sm cu-nowrap', onClick: () => onView(cohort) }, 'Xem')));
}

// One week, person by person: who joined the Zalo group and which sessions they entered.
const PAGE_SIZE = 25;
function CohortPeople({ startsOn, apiFetch, ui, onBack }) {
  const [state, setState] = React.useState({ loading: true, error: '', data: null });
  const [users, setUsers] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState('');
  const [page, setPage] = React.useState(1);
  React.useEffect(() => {
    let live = true;
    apiFetch(`${BASE}/cohorts/${startsOn}/people`).then(data => { if (live) setState({ loading: false, error: '', data }); }).catch(error => { if (live) setState({ loading: false, error: error.message, data: null }); });
    apiFetch('/admin/crm/users').then(data => { if (live) setUsers(data.rows || []); }).catch(() => {});
    return () => { live = false; };
  }, [apiFetch, startsOn]);
  React.useEffect(() => setPage(1), [query, filter]);
  const back = h('button', { type: 'button', className: 'cu-icon-btn cu-icon-32', onClick: onBack, 'aria-label': 'Quay lại các khóa' }, '‹');
  if (!state.data) return h('div', { className: 'cu-page wp-page' }, back, state.error ? h('div', { className: 'cu-card cu-empty cu-error', role: 'alert' }, state.error) : h('div', { className: 'cu-card cu-pad' }, h(Skeleton)));
  const { cohort, people } = state.data;
  const sale = Object.fromEntries(users.map(u => [u.user_id, u.full_name || u.email]));
  const entered = p => p.joins.length > 0;
  const FILTERS = [['', 'Tất cả', () => true], ['zalo', 'Đã vào Zalo', p => p.zalo_clicked_at], ['no-zalo', 'Chưa vào Zalo', p => !p.zalo_clicked_at], ['joined', 'Đã vào học', entered], ['none', 'Chưa vào buổi nào', p => !entered(p)]];
  const needle = query.trim().toLowerCase();
  const matches = FILTERS.find(([id]) => id === filter)[2];
  const rows = people.filter(p => matches(p) && (!needle || [p.name, p.email, p.phone].some(v => String(v).toLowerCase().includes(needle))));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);
  async function openPerson(id) {
    try {
      const { contact_id } = await apiFetch(`/admin/contacts/by-registration/${encodeURIComponent(id)}`);
      await openContact(ui, contact_id);
    } catch { /* shown */ }
  }
  return h('div', { className: 'cu-page wp-page' },
    h('div', { className: 'wp-week-head' }, back, h('h1', { className: 'wp-people-title' }, `Chi tiết ${cohort.label}`), h(StatusBadge, { status: cohort.status }), h('span', { className: 'cu-sub cu-tabular' }, `${people.length} người · học ${evenings(cohort)}`)),
    h('section', { className: 'cu-card cu-list-card', 'aria-label': `Danh sách ${cohort.label}` },
      h('div', { className: 'wp-list-head' },
        h('label', { className: 'cu-search wp-search' }, h('input', { type: 'search', value: query, onChange: e => setQuery(e.target.value), placeholder: 'Tìm theo tên, SĐT hoặc email', 'aria-label': 'Tìm người trong khóa' })),
        h('div', { className: 'cu-chips' }, FILTERS.map(([id, label, test]) => h('button', { key: id, type: 'button', 'aria-pressed': filter === id, className: filter === id ? 'cu-chip on' : 'cu-chip', onClick: () => setFilter(id) }, `${label} · ${people.filter(test).length}`)))),
      shown.length ? h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table' },
        h('thead', null, h('tr', null, h('th', null, 'Học viên'), h('th', null, 'SĐT'), h('th', null, 'Đăng ký'), h('th', null, 'Sale'), h('th', null, 'Nhóm Zalo'), cohort.sessions.map(s => h('th', { key: s.position, className: 'wp-center' }, `Buổi ${s.position}`)))),
        h('tbody', null, shown.map(p => h('tr', { key: p.registration_id, className: 'cu-row', 'data-person': p.email },
          h('td', null, h('button', { type: 'button', className: 'cu-link fu-person', onClick: () => openPerson(p.registration_id) }, p.name || 'Chưa có tên'), h('div', { className: 'cu-sub' }, p.email)),
          h('td', { className: 'cu-nowrap cu-tabular' }, p.phone || '—'),
          h('td', { className: 'cu-nowrap cu-tabular' }, stamp(p.registered_at)),
          h('td', { className: 'cu-nowrap' }, sale[p.assigned_to] || h('span', { className: 'cu-muted' }, 'Chưa giao')),
          h('td', { className: 'cu-nowrap' }, p.zalo_clicked_at ? h('span', { className: 'wp-status wp-on' }, 'Đã bấm') : h('span', { className: 'cu-muted' }, 'Chưa')),
          cohort.sessions.map(s => { const join = p.joins.find(j => j.position === s.position); return h('td', { key: s.position, className: 'wp-center cu-tabular' }, join ? h('span', { className: 'wp-status wp-on', title: `Vào lúc ${stamp(join.first_at)}, ${join.clicks} lần bấm` }, hm(join.first_at)) : h('span', { className: 'cu-muted' }, '—')); })))))) : h('p', { className: 'cu-empty' }, people.length ? 'Không có người khớp bộ lọc.' : 'Khóa này chưa có người đăng ký.'),
      h('div', { className: 'cu-footer' }, h('span', null, `${rows.length} người`),
        h('div', { className: 'cu-row-gap' },
          h('button', { type: 'button', className: 'cu-page-btn', 'aria-label': 'Trang trước', disabled: page <= 1, onClick: () => setPage(p => p - 1) }, '‹'),
          h('button', { type: 'button', className: 'cu-page-btn', 'aria-label': 'Trang sau', disabled: page >= pages, onClick: () => setPage(p => p + 1) }, '›')))));
}

const share = (part, whole) => whole ? `${Math.round(part / whole * 100)}%` : '—';
const total = (links, key) => (links || []).reduce((sum, link) => sum + (link[key] || 0), 0);

// One week: what happened on it (people, Zalo, each session, each link) and its Zalo group.
function CohortPanel({ cohort, focusZalo, canEdit, apiFetch, onClose, onSaved, onDetail }) {
  const [name, setName] = React.useState(cohort.zalo_name || cohort.zalo_name_suggested || '');
  const [url, setUrl] = React.useState(cohort.zalo_url);
  const [busy, setBusy] = React.useState(false);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`${BASE}/cohorts/${cohort.starts_on}`, { method: 'PUT', body: JSON.stringify({ zalo_name: name, zalo_url: url }) });
      notify(`Đã lưu nhóm Zalo của ${cohort.label}`);
      onSaved();
      onClose();
    } catch { /* shown */ } finally { setBusy(false); }
  }
  return h(Overlay, { className: 'drawer-layer' },
    h('button', { className: 'drawer-backdrop', onClick: onClose, 'aria-label': 'Đóng' }),
    h('form', { className: 'lead-drawer-react wp-panel', role: 'dialog', 'aria-labelledby': 'wp-panel-title', onSubmit: save },
      h('div', { className: 'drawer-head-react' },
        h('div', null, h('h2', { id: 'wp-panel-title' }, `Đo lường ${cohort.label}`), h('p', { className: 'cu-sub' }, `${STATUS[cohort.status][0]} · Nhận đăng ký ${stamp(cohort.opens_at)} đến ${stamp(lastMinute(cohort.closes_at))}`)),
        h('button', { type: 'button', className: 'cu-btn cu-btn-plain cu-btn-sm', onClick: onClose }, 'Đóng')),
      h('div', { className: 'drawer-body-react wp-panel-body' },
        h('div', { className: 'wp-numbers' },
          [['Số người', cohort.people, ''], ['Vào nhóm Zalo', cohort.zalo_clicks || 0, share(cohort.zalo_clicks || 0, cohort.people)], ['Đăng ký qua link', total(cohort.links, 'registered'), ''], ['Vào học qua link', total(cohort.links, 'entered'), '']].map(([label, value, note]) => h('div', { key: label }, h('small', null, label), h('strong', { className: 'cu-tabular' }, value), note ? h('small', null, `${note} số người`) : null))),
        h('div', null, h('button', { type: 'button', className: 'cu-btn cu-btn-secondary', onClick: onDetail }, 'Xem chi tiết từng người')),
        h('section', { 'aria-label': 'Vào từng buổi' }, h('h3', null, 'Vào từng buổi'),
          h('table', { className: 'cu-table wp-sessions-report' },
            h('thead', null, h('tr', null, h('th', null, 'Buổi'), h('th', null, 'Giờ học'), h('th', { className: 'cu-right' }, 'Số người vào'), h('th', { className: 'cu-right' }, 'So với số người'))),
            h('tbody', null, cohort.sessions.map((s, i) => { const joined = cohort.session_joins?.[i] || 0; return h('tr', { key: s.position, className: 'cu-row' },
              h('td', null, h('strong', null, `Buổi ${s.position}`)), h('td', { className: 'cu-nowrap cu-tabular' }, stamp(s.at)),
              h('td', { className: 'cu-right cu-tabular' }, joined), h('td', { className: 'cu-right cu-tabular' }, share(joined, cohort.people))); }))),
          h('p', { className: 'cu-sub' }, 'Tính người đã bấm vào phòng học.')),
        h('section', { 'aria-label': 'Theo link tuần' }, h('h3', null, 'Theo link tuần'),
          (cohort.links || []).map(link => h('div', { key: link.slug, className: 'wp-panel-link' },
            h('div', { className: 'wp-week-row' }, h('code', { className: 'wp-path' }, link.path), h('button', { type: 'button', className: 'cu-btn cu-btn-secondary cu-btn-sm', onClick: () => copyLink(link.path) }, 'Chép link')),
            h('div', { className: 'wp-numbers' }, [['Lượt mở', link.visits], ['Người mở', link.visitors], ['Đăng ký mới', link.registered], ['Vào học', link.entered]].map(([label, value]) => h('div', { key: label }, h('small', null, label), h('strong', { className: 'cu-tabular' }, value))))))),
        !canEdit ? h('section', { className: 'wp-panel-zalo', 'aria-label': 'Nhóm Zalo' }, h('h3', null, 'Nhóm Zalo của khóa'),
          cohort.zalo_url ? h('a', { href: cohort.zalo_url, target: '_blank', rel: 'noopener' }, cohort.zalo_name || cohort.zalo_url) : h('p', { className: 'cu-muted' }, 'Chưa có link nhóm Zalo.'))
        : h('section', { className: 'wp-panel-zalo', 'aria-label': 'Nhóm Zalo' }, h('h3', null, 'Nhóm Zalo của khóa'),
          h('label', null, 'Link nhóm Zalo', h('input', { className: 'ui-input', value: url, placeholder: 'https://zalo.me/g/...', autoFocus: !!focusZalo, onChange: e => setUrl(e.target.value) })),
          h('label', null, 'Tên nhóm', h('input', { className: 'ui-input', value: name, onChange: e => setName(e.target.value) })),
          h('div', { className: 'cu-row-gap' }, h('button', { type: 'submit', className: 'cu-btn cu-btn-primary', disabled: busy }, busy ? 'Đang lưu…' : 'Lưu nhóm Zalo'))))));
}

function Settings({ initial, apiFetch, onSaved }) {
  const [form, setForm] = React.useState({ ...initial, first_number: initial.first_number ?? '' });
  const [busy, setBusy] = React.useState(false);
  const baseline = JSON.stringify({ ...initial, first_number: initial.first_number ?? '' });
  const dirty = JSON.stringify(form) !== baseline;
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const setSession = (index, patch) => set({ sessions: form.sessions.map((s, i) => i === index ? { ...s, ...patch } : s) });
  // Opens the session's room as EverWebinar gives it now, with the saved settings.
  async function tryRoom(position) {
    const tab = window.open('', '_blank');
    try {
      const result = await apiFetch(`${BASE}/test-room`, { method: 'POST', body: JSON.stringify({ position }) });
      notify(result.source === 'api' ? `Buổi ${position}: EverWebinar đã tạo phòng riêng.` : `Buổi ${position}: dùng link vào thẳng. ${result.problem || ''}`, result.source !== 'api');
      if (tab) tab.location.href = result.url; else window.open(result.url, '_blank');
    } catch { tab?.close(); }
  }
  async function save() {
    setBusy(true);
    try {
      await apiFetch(`${BASE}/settings`, { method: 'PUT', body: JSON.stringify(form) });
      notify('Đã lưu lịch học và cài đặt');
      onSaved();
    } catch { /* shown */ } finally { setBusy(false); }
  }
  return h('section', { className: 'cu-card wp-settings', 'aria-label': 'Lịch học và cài đặt' },
    h('h2', null, 'Lịch các buổi'),
    h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table wp-sessions' },
      h('thead', null, h('tr', null, ['Buổi', 'Bật', 'Thứ', 'Giờ', 'Webinar ID', 'Link vào thẳng (dự phòng)', 'Kiểm tra'].map(l => h('th', { key: l }, l)))),
      h('tbody', null, form.sessions.map((s, i) => h('tr', { key: i, className: 'cu-row' },
        h('td', null, h('strong', null, `Buổi ${i + 1}`)),
        h('td', null, h('input', { type: 'checkbox', checked: s.enabled, 'aria-label': `Bật buổi ${i + 1}`, onChange: e => setSession(i, { enabled: e.target.checked }) })),
        h('td', null, h(Select, { value: String(s.weekday), 'aria-label': `Thứ của buổi ${i + 1}`, onChange: e => setSession(i, { weekday: Number(e.target.value) }) }, WEEKDAYS.map(([id, label]) => h('option', { key: id, value: String(id) }, label)))),
        h('td', null, h('input', { className: 'ui-input', type: 'time', value: s.time, 'aria-label': `Giờ buổi ${i + 1}`, onChange: e => setSession(i, { time: e.target.value }) })),
        h('td', null, h('input', { className: 'ui-input', value: s.webinar_id, placeholder: '162', 'aria-label': `Webinar ID buổi ${i + 1}`, onChange: e => setSession(i, { webinar_id: e.target.value }) })),
        h('td', null, h('input', { className: 'ui-input', value: s.direct_url, placeholder: 'https://event.webinarjam.com/.../go/live/...', 'aria-label': `Link vào thẳng buổi ${i + 1}`, onChange: e => setSession(i, { direct_url: e.target.value }) })),
        h('td', null, h('button', { type: 'button', className: 'cu-btn cu-btn-secondary cu-btn-sm cu-nowrap', disabled: dirty || !s.enabled, title: dirty ? 'Lưu cài đặt trước khi thử' : '', onClick: () => tryRoom(form.sessions.filter(x => x.enabled).sort((a, b) => a.weekday - b.weekday).indexOf(s) + 1) }, 'Thử vào phòng'))))))),
    h('h2', null, 'Chia khóa'),
    h('div', { className: 'wp-fields' },
      h('label', null, 'Mốc chốt danh sách (thứ 2)', h('input', { className: 'ui-input', type: 'time', value: form.cutoff_time, onChange: e => set({ cutoff_time: e.target.value }) }),
        h('small', null, 'Chỉ áp dụng cho người đăng ký sau khi đổi.')),
      h('label', null, 'Số của khóa đầu tiên', h('input', { className: 'ui-input', type: 'number', min: 1, value: form.first_number, placeholder: 'Ví dụ 3', onChange: e => set({ first_number: e.target.value }) }),
        h('small', null, 'Chưa nhập thì khóa được gọi theo ngày.')),
      h('label', null, 'Khóa đầu tiên học từ thứ 2', h('input', { className: 'ui-input', type: 'date', value: form.first_starts_on, onChange: e => set({ first_starts_on: e.target.value }) }))),
    h('h2', null, 'Kết nối EverWebinar'),
    h('div', { className: 'wp-fields' },
      h('label', { className: 'wp-wide' }, 'API key', h('input', { className: 'ui-input', type: 'password', autoComplete: 'off', value: form.api_key, placeholder: 'Dán API key vào đây', onChange: e => set({ api_key: e.target.value }) }),
        h('small', null, 'Một key cho cả tài khoản. Sau khi lưu, key được ẩn và không hiện lại.'))),
    h('div', { className: 'cu-row-gap' }, h('button', { type: 'button', className: 'cu-btn cu-btn-primary', disabled: !dirty || busy, onClick: save }, busy ? 'Đang lưu…' : 'Lưu lịch học và cài đặt')));
}

export default function WebinarProgramPage({ apiFetch, ui, canEdit = false }) {
  const state = useOverview(apiFetch);
  const [detail, setDetail] = React.useState('');
  const [tab, setTab] = React.useState('cohorts');
  const [show, setShow] = React.useState('ahead');
  const [editing, setEditing] = React.useState(null);
  if (detail) return h(CohortPeople, { startsOn: detail, apiFetch, ui, onBack: () => setDetail('') });
  if (state.loading && !state.data) return h('div', { className: 'cu-page' }, h('div', { className: 'cu-card cu-pad' }, h(Skeleton)));
  if (!state.data) return h('div', { className: 'cu-page' }, h('div', { className: 'cu-card cu-empty cu-error', role: 'alert' }, state.error || 'Chưa tải được dữ liệu.'));
  const { cohorts, settings } = state.data;
  const live = cohorts.filter(c => ['running', 'collecting'].includes(c.status));
  const ahead = [...live, ...cohorts.filter(c => c.status === 'upcoming')];
  const earlier = cohorts.filter(c => c.status === 'done').reverse();
  const missing = live.filter(c => !c.zalo_url);
  const rows = show === 'ahead' ? ahead : earlier;
  const onEdit = c => setEditing({ starts_on: c.starts_on, focusZalo: true });
  const onView = c => setEditing({ starts_on: c.starts_on, focusZalo: false });
  const opened = editing && cohorts.find(c => c.starts_on === editing.starts_on);
  return h('div', { className: 'cu-page wp-page' },
    h('div', { className: 'cu-title-row' }, h('div', null, h('h1', null, `Webinar · ${settings.title}`),
      h('p', null, `Đăng ký từ ${settings.cutoff_time} thứ 2 tuần trước đến trước ${settings.cutoff_time} thứ 2 tuần này vào cùng một khóa, học từ tối thứ 2 đó.`))),
    h('div', { className: 'cu-views', role: 'tablist', 'aria-label': 'Mục' },
      [['cohorts', 'Các khóa'], ...(canEdit ? [['settings', 'Lịch học & cài đặt']] : [])].map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': tab === id, className: tab === id ? 'cu-view on' : 'cu-view', onClick: () => setTab(id) }, label))),
    tab === 'settings' && canEdit ? h(Settings, { key: JSON.stringify(settings), initial: settings, apiFetch, onSaved: state.reload }) : h(React.Fragment, null,
      missing.length ? h('div', { className: 'wp-alert', role: 'alert' }, `Chưa có link nhóm Zalo: ${missing.map(c => c.label).join(', ')}. Khách của khóa này đang chưa thấy nút vào nhóm.`) : null,
      h('div', { className: 'wp-weeks' }, live.map(c => h(WeekCard, { key: c.starts_on, cohort: c, onEdit, onView, canEdit }))),
      h('section', { className: 'cu-card cu-list-card', 'aria-label': 'Tất cả các khóa' },
        h('div', { className: 'wp-list-head' }, h('h2', null, 'Tất cả các khóa'),
          h('div', { className: 'cu-chips' }, [['ahead', `Đang chạy và sắp tới · ${ahead.length}`], ['earlier', `Đã học xong · ${earlier.length}`]].map(([id, label]) => h('button', { key: id, type: 'button', 'aria-pressed': show === id, className: show === id ? 'cu-chip on' : 'cu-chip', onClick: () => setShow(id) }, label)))),
        rows.length ? h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table' },
          h('thead', null, h('tr', null, [['Khóa'], ['Trạng thái'], ['Học các tối'], ['Số người', 1], ['Vào Zalo', 1], ['Vào từng buổi'], ['Link tuần'], ['Nhóm Zalo']].map(([l, right]) => h('th', { key: l, className: right ? 'cu-right' : '' }, l)), h('th', null, h('span', { className: 'sr-only' }, 'Thao tác')))),
          h('tbody', null, rows.map(c => h(CohortRow, { key: c.starts_on, cohort: c, onEdit, onView, canEdit }))))) : h('p', { className: 'cu-empty' }, 'Chưa có khóa nào đã học xong.'))),
    opened ? h(CohortPanel, { key: opened.starts_on, cohort: opened, focusZalo: editing.focusZalo, canEdit, apiFetch, onClose: () => setEditing(null), onSaved: state.reload, onDetail: () => { setEditing(null); setDetail(opened.starts_on); } }) : null);
}
