import React from 'react';
import { Skeleton, notify, Select } from './ui.js';
import { openContact } from './customers.js';
import './webinarProgram.css';

// CRM > Webinar Dòng Tiền. Tab Các khóa: the weeks running now first, then one line per cohort;
// a cohort opens its own page (?khoa=YYYY-MM-DD): numbers, the two ways in (landing, week link),
// each session, the week links, the Zalo group and every person. Tab Lịch học & cài đặt:
// schedule and API key (admins). Cohorts come from the registration time (src/webinarProgram.js).
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
// A share, or nothing when there is nothing to compare with.
const pct = (part, whole) => whole ? `${Math.round(part / whole * 100)}%` : '';
const FLOW = { landing: 'Landing', link: 'Link vào học nhanh' };
// The one link sent to the groups; it goes on to the day's session link (20h-18-11-26).
const STUDY_LINK = '/w/dong-tien';

async function copyLink(path) {
  const url = `${location.origin}${path}`;
  try { await navigator.clipboard.writeText(url); notify('Đã chép link tuần'); } catch { notify(url); }
}

function useLoad(path, apiFetch, revision = 0) {
  const [state, setState] = React.useState({ loading: true, error: '', data: null });
  React.useEffect(() => {
    let live = true;
    setState(current => ({ ...current, loading: true }));
    apiFetch(path).then(data => { if (live) setState({ loading: false, error: '', data }); })
      .catch(error => { if (live) setState({ loading: false, error: error.message, data: null }); });
    return () => { live = false; };
  }, [path, apiFetch, revision]);
  return state;
}

const StatusBadge = ({ status }) => h('span', { className: `wp-status ${STATUS[status][1]}` }, STATUS[status][0]);
const Stat = ({ label, value, note }) => h('div', { className: 'wp-stat' }, h('small', null, label), h('strong', { className: 'cu-tabular' }, value), note ? h('span', { className: 'cu-sub' }, note) : null);

// A week running now: the numbers and the two things done most often, copy the link and set Zalo.
function WeekCard({ cohort, onOpen, canEdit }) {
  return h('section', { className: 'cu-card wp-week', 'aria-label': `${cohort.label}` },
    h('div', { className: 'wp-week-head' }, h('button', { type: 'button', className: 'cu-link wp-open', 'aria-label': `Xem chi tiết ${cohort.label}`, onClick: () => onOpen(cohort) }, cohort.label), h(StatusBadge, { status: cohort.status }), h('span', { className: 'cu-grow' }), h('span', { className: 'cu-sub cu-tabular' }, `Học ${evenings(cohort)} · ${cohort.sessions[0] ? hm(cohort.sessions[0].at) : ''}`)),
    h('div', { className: 'wp-numbers' },
      [['Số người', cohort.people], ['Từ landing', cohort.flows?.landing.people ?? '—'], ['Từ link vào học', cohort.flows?.link.people ?? '—'], ['Vào nhóm Zalo', cohort.zalo_clicks || 0]].map(([label, value]) => h('div', { key: label }, h('small', null, label), h('strong', { className: 'cu-tabular' }, value)))),
    h('p', { className: 'cu-sub cu-tabular wp-joins' }, `Vào từng buổi: ${joinsText(cohort)}`),
    h('div', { className: 'wp-week-row' }, h('span', { className: 'cu-min0' }, h('small', { className: 'cu-sub' }, 'Link vào học '), h('code', { className: 'wp-path' }, STUDY_LINK)), h('button', { type: 'button', className: 'cu-btn cu-btn-secondary cu-btn-sm', onClick: () => copyLink(STUDY_LINK) }, 'Chép link')),
    h('div', { className: 'wp-week-row' },
      h('span', { className: cohort.zalo_url ? 'wp-zalo-name' : 'wp-zalo-name cu-error' }, cohort.zalo_url ? (cohort.zalo_name || cohort.zalo_url) : 'Chưa có link nhóm Zalo'),
      h('button', { type: 'button', className: 'cu-btn cu-btn-secondary cu-btn-sm', onClick: () => onOpen(cohort, canEdit && !cohort.zalo_url) }, canEdit && !cohort.zalo_url ? 'Nhập link Zalo' : 'Xem chi tiết')));
}

function CohortRow({ cohort, onOpen, canEdit }) {
  return h('tr', { className: 'cu-row wp-row', 'data-cohort': cohort.starts_on, onClick: e => { if (!e.target.closest('button, a')) onOpen(cohort); } },
    h('td', null, h('button', { type: 'button', className: 'cu-link wp-open', 'aria-label': `Xem chi tiết ${cohort.label}`, onClick: () => onOpen(cohort) }, cohort.label)),
    h('td', null, h(StatusBadge, { status: cohort.status })),
    h('td', { className: 'cu-nowrap cu-tabular' }, evenings(cohort), h('div', { className: 'cu-sub' }, `Nhận đến ${stamp(lastMinute(cohort.closes_at))}`)),
    h('td', { className: 'cu-right cu-tabular' }, cohort.people, cohort.flows ? h('div', { className: 'cu-sub cu-nowrap' }, `LP ${cohort.flows.landing.people} · Link ${cohort.flows.link.people}`) : null),
    h('td', { className: 'cu-right cu-tabular' }, cohort.zalo_clicks || 0),
    h('td', { className: 'cu-nowrap cu-sub cu-tabular' }, joinsText(cohort)),
    h('td', null, cohort.zalo_url ? h('span', { className: 'wp-zalo-name' }, cohort.zalo_name || 'Đã có link') : h('span', { className: ['collecting', 'running'].includes(cohort.status) ? 'cu-error' : 'cu-muted' }, 'Chưa có')),
    h('td', { className: 'cu-right' }, h('button', { type: 'button', className: 'cu-btn cu-btn-secondary cu-btn-sm cu-nowrap', 'aria-label': `Nhóm Zalo ${cohort.label}`, onClick: () => onOpen(cohort, canEdit && !cohort.zalo_url) }, canEdit && !cohort.zalo_url ? 'Nhập link Zalo' : 'Chi tiết')));
}

// The two ways in, side by side: from opening the page to each session.
function FlowTable({ cohort }) {
  const f = cohort.flows;
  if (!f) return null;
  const sum = key => f.landing[key] + f.link[key];
  const cell = (value, whole) => h('td', { className: 'cu-right cu-tabular' }, value, pct(value, whole) ? h('span', { className: 'wp-share' }, pct(value, whole)) : null);
  const rows = [
    { label: 'Người mở trang', hint: 'Landing: người xem landing trong thời gian khóa nhận đăng ký. Link: người mở link tuần.', a: f.landing.visitors, b: f.link.visitors },
    { label: 'Vào khóa này', a: f.landing.people, b: f.link.people, base: 'visitors' },
    { label: 'Bấm vào nhóm Zalo', a: f.landing.zalo_clicks, b: f.link.zalo_clicks, base: 'people' },
    ...cohort.sessions.map((s, i) => ({ label: `Vào buổi ${s.position} · ${dm(s.at)}`, a: f.landing.session_joins[i] || 0, b: f.link.session_joins[i] || 0, base: 'people' })),
  ];
  return h('section', { className: 'cu-card wp-block', 'aria-label': 'Hành trình theo luồng' },
    h('div', { className: 'wp-block-head' }, h('h2', null, 'Hành trình theo luồng'), h('span', { className: 'cu-sub' }, '% so với "Vào khóa này" của cùng luồng (dòng "Vào khóa này" so với người mở trang)')),
    h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table wp-flows' },
      h('thead', null, h('tr', null, h('th', null, 'Bước'), h('th', { className: 'cu-right' }, FLOW.landing), h('th', { className: 'cu-right' }, FLOW.link), h('th', { className: 'cu-right' }, 'Tổng'))),
      h('tbody', null, rows.map(row => h('tr', { key: row.label, className: 'cu-row', title: row.hint || '' },
        h('td', null, row.label),
        cell(row.a, row.base ? f.landing[row.base] : 0),
        cell(row.b, row.base ? f.link[row.base] : 0),
        h('td', { className: 'cu-right cu-tabular' }, h('strong', null, row.a + row.b), row.base && pct(row.a + row.b, sum(row.base)) ? h('span', { className: 'wp-share' }, pct(row.a + row.b, sum(row.base))) : null)))))),
    h('p', { className: 'cu-sub wp-block-foot' }, `Qua link vào học nhanh có ${f.link.new_leads} người mới (chưa từng đăng ký); còn lại là người đã có, vào học buổi đang diễn ra.`));
}

// /w/dong-tien sends each visit to the day's session link, so the link's numbers fall per session.
function SessionLinksCard({ cohort }) {
  return h('section', { className: 'cu-card wp-block', 'aria-label': 'Theo từng buổi' },
    h('div', { className: 'wp-block-head' }, h('h2', null, 'Theo từng buổi (qua link vào học)'), h('span', { className: 'cu-sub' }, `Đếm theo ngày khách bấm ${STUDY_LINK}, gồm cả người đăng ký từ landing`)),
    h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table wp-session-links' },
      h('thead', null, h('tr', null, ['Buổi', 'Người bấm link', 'Người mới', 'Vào phòng'].map((l, i) => h('th', { key: l, className: i ? 'cu-right' : '' }, l)))),
      h('tbody', null, (cohort.links || []).filter(link => link.position || link.visits || link.entered).map(link => h('tr', { key: link.slug, className: link.path === cohort.next_link ? 'cu-row wp-next' : 'cu-row' },
        h('td', { className: 'cu-nowrap' }, link.position ? `Buổi ${link.position} · ${dm(link.at)}` : 'Ngày khác', link.path === cohort.next_link ? h('span', { className: 'wp-status wp-run wp-next-tag' }, 'Buổi tới') : null),
        h('td', { className: 'cu-right cu-tabular', title: `${link.visits} lượt bấm` }, link.visitors),
        h('td', { className: 'cu-right cu-tabular' }, link.registered),
        h('td', { className: 'cu-right cu-tabular' }, link.entered)))))));
}

function ZaloCard({ cohort, canEdit, focus, apiFetch, onSaved }) {
  const [name, setName] = React.useState(cohort.zalo_name || cohort.zalo_name_suggested || '');
  const [url, setUrl] = React.useState(cohort.zalo_url);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => { if (focus) { ref.current?.scrollIntoView({ block: 'center' }); ref.current?.querySelector('input')?.focus(); } }, [focus]);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`${BASE}/cohorts/${cohort.starts_on}`, { method: 'PUT', body: JSON.stringify({ zalo_name: name, zalo_url: url }) });
      notify(`Đã lưu nhóm Zalo của ${cohort.label}`);
      onSaved();
    } catch { /* shown */ } finally { setBusy(false); }
  }
  return h('section', { className: 'cu-card wp-block', 'aria-label': 'Nhóm Zalo của khóa', ref },
    h('div', { className: 'wp-block-head' }, h('h2', null, 'Nhóm Zalo của khóa'), h('span', { className: 'cu-sub' }, `${cohort.zalo_clicks || 0} người đã bấm vào nhóm`)),
    !canEdit ? h('div', { className: 'wp-block-body' }, cohort.zalo_url ? h('a', { href: cohort.zalo_url, target: '_blank', rel: 'noopener' }, cohort.zalo_name || cohort.zalo_url) : h('p', { className: 'cu-muted' }, 'Chưa có link nhóm Zalo.'))
      : h('form', { className: 'wp-block-body wp-zalo-form', onSubmit: save },
        h('label', null, 'Link nhóm Zalo', h('input', { className: 'ui-input', value: url, placeholder: 'https://zalo.me/g/...', onChange: e => setUrl(e.target.value) })),
        h('label', null, 'Tên nhóm', h('input', { className: 'ui-input', value: name, onChange: e => setName(e.target.value) })),
        h('div', null, h('button', { type: 'submit', className: 'cu-btn cu-btn-primary', disabled: busy || (url === cohort.zalo_url && name === cohort.zalo_name) }, busy ? 'Đang lưu…' : 'Lưu nhóm Zalo'))));
}

// Everyone in the cohort: way in, Zalo, each session; filters, search, CSV.
const PAGE_SIZE = 25;
function PeopleCard({ cohort, people, apiFetch, ui }) {
  const users = useLoad('/admin/crm/users', apiFetch);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState('');
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [query, filter]);
  const sale = Object.fromEntries((users.data?.rows || []).map(u => [u.user_id, u.full_name || u.email]));
  const entered = p => p.joins.length > 0;
  const FILTERS = [['', 'Tất cả', () => true], ['landing', 'Từ landing', p => p.source !== 'link'], ['link', 'Từ link vào học', p => p.source === 'link'], ['zalo', 'Đã vào Zalo', p => p.zalo_clicked_at], ['no-zalo', 'Chưa vào Zalo', p => !p.zalo_clicked_at], ['joined', 'Đã vào học', entered], ['none', 'Chưa vào buổi nào', p => !entered(p)]];
  const needle = query.trim().toLowerCase();
  const matches = FILTERS.find(([id]) => id === filter)[2];
  const rows = people.filter(p => matches(p) && (!needle || [p.name, p.email, p.phone].some(v => String(v).toLowerCase().includes(needle))));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE);
  const joinOf = (p, position) => p.joins.find(j => j.position === position);
  async function openPerson(id) {
    try {
      const { contact_id } = await apiFetch(`/admin/contacts/by-registration/${encodeURIComponent(id)}`);
      await openContact(ui, contact_id);
    } catch { /* shown */ }
  }
  function exportCsv() {
    const head = ['Họ tên', 'Email', 'SĐT', 'Đăng ký', 'Luồng', 'Sale', 'Bấm nhóm Zalo', ...cohort.sessions.map(s => `Buổi ${s.position}`)];
    const quote = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map(p => [p.name, p.email, p.phone, stamp(p.registered_at), FLOW[p.source === 'link' ? 'link' : 'landing'], sale[p.assigned_to] || '', p.zalo_clicked_at ? stamp(p.zalo_clicked_at) : '', ...cohort.sessions.map(s => joinOf(p, s.position) ? stamp(joinOf(p, s.position).first_at) : '')]);
    const blob = new Blob(['﻿' + [head, ...lines].map(line => line.map(quote).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `webinar-${cohort.starts_on}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return h('section', { className: 'cu-card cu-list-card', 'aria-label': `Danh sách ${cohort.label}` },
    h('div', { className: 'wp-block-head wp-people-head' }, h('h2', null, `Học viên · ${people.length}`),
      h('label', { className: 'cu-search wp-search' }, h('input', { type: 'search', value: query, onChange: e => setQuery(e.target.value), placeholder: 'Tìm theo tên, SĐT hoặc email', 'aria-label': 'Tìm người trong khóa' })),
      h('button', { type: 'button', className: 'cu-btn cu-btn-secondary cu-btn-sm', disabled: !rows.length, onClick: exportCsv }, 'Xuất CSV')),
    h('div', { className: 'cu-chips wp-people-filters' }, FILTERS.map(([id, label, test]) => h('button', { key: id, type: 'button', 'aria-pressed': filter === id, className: filter === id ? 'cu-chip on' : 'cu-chip', onClick: () => setFilter(id) }, `${label} · ${people.filter(test).length}`))),
    shown.length ? h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table' },
      h('thead', null, h('tr', null, h('th', null, 'Học viên'), h('th', null, 'SĐT'), h('th', null, 'Đăng ký'), h('th', null, 'Luồng'), h('th', null, 'Sale'), h('th', null, 'Nhóm Zalo'), cohort.sessions.map(s => h('th', { key: s.position, className: 'wp-center' }, `Buổi ${s.position}`)), h('th', { className: 'wp-center' }, 'Đã vào'))),
      h('tbody', null, shown.map(p => h('tr', { key: p.registration_id, className: 'cu-row', 'data-person': p.email },
        h('td', null, h('button', { type: 'button', className: 'cu-link fu-person', onClick: () => openPerson(p.registration_id) }, p.name || 'Chưa có tên'), h('div', { className: 'cu-sub' }, p.email)),
        h('td', { className: 'cu-nowrap cu-tabular' }, p.phone || '—'),
        h('td', { className: 'cu-nowrap cu-tabular' }, stamp(p.registered_at)),
        h('td', { className: 'cu-nowrap' }, h('span', { className: p.source === 'link' ? 'wp-tag wp-tag-link' : 'wp-tag wp-tag-lp' }, p.source === 'link' ? 'Link vào học' : 'Landing')),
        h('td', { className: 'cu-nowrap' }, sale[p.assigned_to] || h('span', { className: 'cu-muted' }, 'Chưa giao')),
        h('td', { className: 'cu-nowrap' }, p.zalo_clicked_at ? h('span', { className: 'wp-status wp-on' }, 'Đã bấm') : h('span', { className: 'cu-muted' }, 'Chưa')),
        cohort.sessions.map(s => { const join = joinOf(p, s.position); return h('td', { key: s.position, className: 'wp-center cu-tabular' }, join ? h('span', { className: 'wp-status wp-on', title: `Vào lúc ${stamp(join.first_at)}, ${join.clicks} lần bấm` }, hm(join.first_at)) : h('span', { className: 'cu-muted' }, '—')); }),
        h('td', { className: 'wp-center cu-tabular' }, `${p.joins.length}/${cohort.sessions.length}`)))))) : h('p', { className: 'cu-empty' }, people.length ? 'Không có người khớp bộ lọc.' : 'Khóa này chưa có người đăng ký.'),
    h('div', { className: 'cu-footer' }, h('span', null, `${rows.length} người`),
      h('div', { className: 'cu-row-gap' },
        h('button', { type: 'button', className: 'cu-page-btn', 'aria-label': 'Trang trước', disabled: page <= 1, onClick: () => setPage(p => p - 1) }, '‹'),
        h('button', { type: 'button', className: 'cu-page-btn', 'aria-label': 'Trang sau', disabled: page >= pages, onClick: () => setPage(p => p + 1) }, '›'))));
}

// One cohort's page.
function CohortDetail({ cohort, focusZalo, canEdit, apiFetch, ui, onBack, onSaved }) {
  const list = useLoad(`${BASE}/cohorts/${cohort.starts_on}/people`, apiFetch);
  const people = list.data?.people || [];
  const anySession = people.filter(p => p.joins.length > 0).length;
  const allSessions = cohort.sessions.length ? people.filter(p => p.joins.length >= cohort.sessions.length).length : 0;
  const f = cohort.flows;
  return h('div', { className: 'cu-page wp-page wp-detail' },
    h('div', { className: 'wp-detail-head' },
      h('button', { type: 'button', className: 'cu-icon-btn cu-icon-32', onClick: onBack, 'aria-label': 'Quay lại các khóa' }, '‹'),
      h('div', { className: 'cu-grow' },
        h('div', { className: 'wp-week-head' }, h('h1', { className: 'wp-people-title' }, cohort.label), h(StatusBadge, { status: cohort.status })),
        h('p', { className: 'cu-sub' }, `Nhận đăng ký ${stamp(cohort.opens_at)} → ${stamp(lastMinute(cohort.closes_at))} · Học các tối ${evenings(cohort)}${cohort.sessions[0] ? ` lúc ${hm(cohort.sessions[0].at)}` : ''}`)),
      h('button', { type: 'button', className: 'cu-btn cu-btn-secondary', onClick: () => copyLink(STUDY_LINK) }, 'Chép link vào học')),
    h('div', { className: 'wp-stats' },
      h(Stat, { label: 'Số người', value: cohort.people, note: f ? `Landing ${f.landing.people} · Link ${f.link.people}` : '' }),
      h(Stat, { label: 'Vào nhóm Zalo', value: cohort.zalo_clicks || 0, note: pct(cohort.zalo_clicks || 0, cohort.people) ? `${pct(cohort.zalo_clicks || 0, cohort.people)} số người` : '' }),
      h(Stat, { label: 'Vào ít nhất 1 buổi', value: list.data ? anySession : '…', note: pct(anySession, people.length) ? `${pct(anySession, people.length)} số người` : '' }),
      h(Stat, { label: `Vào đủ ${cohort.sessions.length} buổi`, value: list.data ? allSessions : '…', note: pct(allSessions, people.length) ? `${pct(allSessions, people.length)} số người` : '' }),
      h(Stat, { label: 'Người mở landing', value: f?.landing.visitors ?? '—', note: 'trong thời gian nhận đăng ký' }),
      h(Stat, { label: 'Người mở link vào học', value: f?.link.visitors ?? '—', note: f ? `${f.link.visits} lượt bấm ${'/w/dong-tien'}` : '' })),
    h('div', { className: 'wp-detail-main' }, h(FlowTable, { cohort }),
      h('div', { className: 'wp-detail-side' }, h(SessionLinksCard, { cohort }), h(ZaloCard, { key: `${cohort.zalo_url}:${cohort.zalo_name}`, cohort, canEdit, focus: focusZalo, apiFetch, onSaved }))),
    list.error ? h('div', { className: 'cu-card cu-empty cu-error', role: 'alert' }, list.error)
      : list.data ? h(PeopleCard, { cohort, people, apiFetch, ui }) : h('div', { className: 'cu-card cu-pad' }, h(Skeleton)));
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
      h('thead', null, h('tr', null, ['Buổi', 'Bật', 'Thứ', 'Giờ', 'Tên buổi', 'Webinar ID', 'Link vào thẳng (dự phòng)', 'Kiểm tra'].map(l => h('th', { key: l }, l)))),
      h('tbody', null, form.sessions.map((s, i) => h('tr', { key: i, className: 'cu-row' },
        h('td', null, h('strong', null, `Buổi ${i + 1}`)),
        h('td', null, h('input', { type: 'checkbox', checked: s.enabled, 'aria-label': `Bật buổi ${i + 1}`, onChange: e => setSession(i, { enabled: e.target.checked }) })),
        h('td', null, h(Select, { value: String(s.weekday), 'aria-label': `Thứ của buổi ${i + 1}`, onChange: e => setSession(i, { weekday: Number(e.target.value) }) }, WEEKDAYS.map(([id, label]) => h('option', { key: id, value: String(id) }, label)))),
        h('td', null, h('input', { className: 'ui-input', type: 'time', value: s.time, 'aria-label': `Giờ buổi ${i + 1}`, onChange: e => setSession(i, { time: e.target.value }) })),
        h('td', null, h('input', { className: 'ui-input wp-title-input', value: s.title || '', placeholder: 'Nội dung buổi học', 'aria-label': `Tên buổi ${i + 1}`, onChange: e => setSession(i, { title: e.target.value }) })),
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

// ?khoa=YYYY-MM-DD keeps the open cohort across reloads and the browser's back button.
const openedFromUrl = () => new URLSearchParams(location.search).get('khoa') || '';
function setUrlCohort(startsOn) {
  const params = new URLSearchParams(location.search);
  if (startsOn) params.set('khoa', startsOn); else params.delete('khoa');
  history.replaceState(history.state, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
}

export default function WebinarProgramPage({ apiFetch, ui, canEdit = false }) {
  const [revision, setRevision] = React.useState(0);
  const state = useLoad(BASE, apiFetch, revision);
  const [open, setOpen] = React.useState({ startsOn: openedFromUrl(), focusZalo: false });
  const [tab, setTab] = React.useState('cohorts');
  const [show, setShow] = React.useState('ahead');
  const reload = () => setRevision(n => n + 1);
  const onOpen = (c, focusZalo = false) => { setUrlCohort(c.starts_on); setOpen({ startsOn: c.starts_on, focusZalo }); window.scrollTo(0, 0); };
  if (!state.data) return h('div', { className: 'cu-page' }, state.error ? h('div', { className: 'cu-card cu-empty cu-error', role: 'alert' }, state.error) : h('div', { className: 'cu-card cu-pad' }, h(Skeleton)));
  const { cohorts, settings } = state.data;
  const opened = open.startsOn && cohorts.find(c => c.starts_on === open.startsOn);
  if (opened) return h(CohortDetail, { key: opened.starts_on, cohort: opened, focusZalo: open.focusZalo, canEdit, apiFetch, ui, onSaved: reload, onBack: () => { setUrlCohort(''); setOpen({ startsOn: '', focusZalo: false }); } });
  const live = cohorts.filter(c => ['running', 'collecting'].includes(c.status));
  const ahead = [...live, ...cohorts.filter(c => c.status === 'upcoming')];
  const earlier = cohorts.filter(c => c.status === 'done').reverse();
  const missing = live.filter(c => !c.zalo_url);
  const rows = show === 'ahead' ? ahead : earlier;
  return h('div', { className: 'cu-page wp-page' },
    h('div', { className: 'cu-title-row' }, h('div', { className: 'cu-grow' }, h('h1', null, `Webinar · ${settings.title}`),
      h('p', null, `Đăng ký từ ${settings.cutoff_time} thứ 2 tuần trước đến trước ${settings.cutoff_time} thứ 2 tuần này vào cùng một khóa, học từ tối thứ 2 đó.`)),
      h('button', { type: 'button', className: 'cu-btn cu-btn-secondary', onClick: () => copyLink(STUDY_LINK) }, 'Chép link vào học')),
    h('div', { className: 'cu-views', role: 'tablist', 'aria-label': 'Mục' },
      [['cohorts', 'Các khóa'], ...(canEdit ? [['settings', 'Lịch học & cài đặt']] : [])].map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': tab === id, className: tab === id ? 'cu-view on' : 'cu-view', onClick: () => setTab(id) }, label))),
    tab === 'settings' && canEdit ? h(Settings, { key: JSON.stringify(settings), initial: settings, apiFetch, onSaved: reload }) : h(React.Fragment, null,
      missing.length ? h('div', { className: 'wp-alert', role: 'alert' }, `Chưa có link nhóm Zalo: ${missing.map(c => c.label).join(', ')}. Khách của khóa này đang chưa thấy nút vào nhóm.`) : null,
      h('div', { className: 'wp-weeks' }, live.map(c => h(WeekCard, { key: c.starts_on, cohort: c, onOpen, canEdit }))),
      h('section', { className: 'cu-card cu-list-card', 'aria-label': 'Tất cả các khóa' },
        h('div', { className: 'wp-list-head' }, h('h2', null, 'Tất cả các khóa'),
          h('div', { className: 'cu-chips' }, [['ahead', `Đang chạy và sắp tới · ${ahead.length}`], ['earlier', `Đã học xong · ${earlier.length}`]].map(([id, label]) => h('button', { key: id, type: 'button', 'aria-pressed': show === id, className: show === id ? 'cu-chip on' : 'cu-chip', onClick: () => setShow(id) }, label)))),
        rows.length ? h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table' },
          h('thead', null, h('tr', null, [['Khóa'], ['Trạng thái'], ['Học các tối'], ['Số người', 1], ['Vào Zalo', 1], ['Vào từng buổi'], ['Nhóm Zalo']].map(([l, right]) => h('th', { key: l, className: right ? 'cu-right' : '' }, l)), h('th', null, h('span', { className: 'sr-only' }, 'Thao tác')))),
          h('tbody', null, rows.map(c => h(CohortRow, { key: c.starts_on, cohort: c, onOpen, canEdit }))))) : h('p', { className: 'cu-empty' }, 'Chưa có khóa nào đã học xong.'))));
}
