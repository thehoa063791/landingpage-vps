import React from 'react';
import { Skeleton, notify, confirmAction } from './ui.js';
import { openContact } from './customers.js';
import './customers.css';
import './funnel.css';
import './zoomEvents.css';

// CRM > Sự kiện Zoom (roadmap 3.6, docs/zoom-event-plan.md), laid out as the approved mockups
// (ZoomEvents, ZoomEvent): events and their sessions, the /zoom page, people of an event with
// their presence, attendees not matched to a person. Data: src/zoomEventReports.js.
const h = React.createElement;
const fmt = n => n == null ? '—' : new Intl.NumberFormat('vi-VN').format(Number(n));
const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '';
const parts = value => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(x => [x.type, x.value]));
const when = value => { if (!value) return '—'; const p = parts(value); return `${p.day}/${p.month} ${p.hour}:${p.minute}`; };
const STATUS = { open: ['Đang mở', 'success'], draft: ['Nháp', 'neutral'], closed: ['Đã đóng', 'neutral'] };
const RESULTS = { stayed: ['Ở lại đến cuối', 'success'], attended: ['Tham dự, về sớm', 'info'], clicked: ['Bấm link, không vào', 'warning'], absent: ['Vắng', 'neutral'], walkin: ['Vào không đăng ký', 'info'] };
const Badge = ({ tone = 'neutral', children }) => h('span', { className: `cu-badge cu-badge-${tone}` }, children);
const room = e => `${e.zoom_kind === 'webinar' ? 'Webinar' : 'Meeting'} ${String(e.zoom_id || '').replace(/(\d{3})(\d{3,4})(\d+)/, '$1 $2 $3') || '(chưa có ID)'}`;

function useLoad(path, apiFetch, key) {
  const [state, setState] = React.useState({ loading: true, error: '', data: null });
  React.useEffect(() => {
    if (!path) return undefined;
    let live = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    apiFetch(path).then(data => { if (live) setState({ loading: false, error: '', data }); })
      .catch(err => { if (live) setState(s => ({ loading: false, error: err.message, data: s.data })); });
    return () => { live = false; };
  }, [path, apiFetch, key]);
  return state;
}
const openPerson = openContact;
async function openPageEditor(ui) {
  await ui.openModule?.('funnels');
  history.replaceState(null, '', '/admin/view/funnels?funnel=zoom-event&section=zoom-settings');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function ZoomEventsPage({ apiFetch, currentUser, ui }) {
  const [eventId, setEventId] = React.useState(() => new URLSearchParams(location.search).get('event') || '');
  React.useEffect(() => {
    const sync = () => setEventId(new URLSearchParams(location.search).get('event') || '');
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  function open(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('event', id); else url.searchParams.delete('event');
    history.pushState(null, '', url.pathname + url.search);
    setEventId(id);
    window.scrollTo({ top: 0 });
  }
  const canEdit = currentUser?.role === 'admin';
  return h('div', { className: 'cu-page ze-page' }, eventId
    ? h(EventDetail, { id: eventId, apiFetch, canEdit, ui, onBack: () => open('') })
    : h(EventList, { apiFetch, canEdit, ui, onOpen: open }));
}

function CreatePanel({ apiFetch, rooms, onClose, onCreated }) {
  const [form, setForm] = React.useState({ title: '', room: rooms[0] ? `${rooms[0].zoom_kind}:${rooms[0].zoom_id}` : 'other', zoom_kind: 'meeting', zoom_id: '', starts_at: '', has_page: true });
  const [busy, setBusy] = React.useState(false);
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function submit() {
    const [kind, id] = form.room === 'other' ? [form.zoom_kind, form.zoom_id] : form.room.split(':');
    setBusy(true);
    try {
      const result = await apiFetch('/admin/zoom-events', { method: 'POST', body: JSON.stringify({ title: form.title, zoom_kind: kind, zoom_id: id, starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null, has_page: form.has_page }) });
      onCreated(result.id);
    } catch { /* shown */ } finally { setBusy(false); }
  }
  return h('section', { className: 'cu-card cu-pad ze-create', 'aria-label': 'Tạo sự kiện' },
    h('label', { className: 'ze-field' }, h('span', null, 'Tên sự kiện'), h('input', { className: 'ze-input', value: form.title, onChange: set('title'), placeholder: 'Xu hướng đầu tư 2026 · lần 2' })),
    h('label', { className: 'ze-field' }, h('span', null, 'Phòng Zoom'), h('select', { className: 'ze-input', value: form.room, onChange: set('room') },
      rooms.map(r => h('option', { key: `${r.zoom_kind}:${r.zoom_id}`, value: `${r.zoom_kind}:${r.zoom_id}` }, `${room(r)} · ${r.title}`)), h('option', { value: 'other' }, 'Nhập ID khác…'))),
    form.room === 'other' ? h('label', { className: 'ze-field' }, h('span', null, 'Meeting/Webinar ID'), h('span', { className: 'ze-inline' },
      h('select', { className: 'ze-input ze-narrow', value: form.zoom_kind, onChange: set('zoom_kind'), 'aria-label': 'Loại' }, h('option', { value: 'meeting' }, 'Meeting'), h('option', { value: 'webinar' }, 'Webinar')),
      h('input', { className: 'ze-input', value: form.zoom_id, onChange: set('zoom_id'), inputMode: 'numeric', placeholder: '84211930457' }))) : null,
    h('label', { className: 'ze-field' }, h('span', null, 'Bắt đầu'), h('input', { className: 'ze-input', type: 'datetime-local', value: form.starts_at, onChange: set('starts_at') })),
    h('label', { className: 'cu-check ze-check' }, h('input', { type: 'checkbox', checked: form.has_page, onChange: set('has_page') }), 'Dùng trang /zoom để nhận đăng ký'),
    h('div', { className: 'ze-create-foot' },
      h('span', { className: 'cu-muted cu-grow' }, form.has_page ? 'Sự kiện mới lưu ở dạng nháp. Khi bấm "Mở trên /zoom", sự kiện đang mở sẽ đóng đăng ký, link riêng cũ tự chuyển sang sự kiện mới.' : 'Không dùng trang: chỉ gom buổi và người tham dự để báo cáo (ví dụ Q&A, link nằm trong bài học).'),
      h('button', { type: 'button', className: 'cu-btn cu-btn-ghost', onClick: onClose }, 'Hủy'),
      h('button', { type: 'button', className: 'cu-btn cu-btn-plain', disabled: busy || !form.title.trim(), onClick: submit }, busy ? 'Đang lưu…' : 'Lưu nháp')));
}

function EventList({ apiFetch, canEdit, ui, onOpen }) {
  const [tab, setTab] = React.useState('events');
  const [view, setView] = React.useState('all');
  const [creating, setCreating] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [syncing, setSyncing] = React.useState(false);
  const list = useLoad('/admin/zoom-events', apiFetch, reloadKey);
  const sessions = useLoad(tab === 'sessions' ? `/admin/zoom-events/sessions?view=${view}` : '', apiFetch, reloadKey);
  const sync = useLoad(canEdit ? '/admin/zoom/sync-status' : '', apiFetch, reloadKey);
  const reload = () => setReloadKey(k => k + 1);
  const data = list.data;
  const rows = data?.rows || [];
  const rooms = [...new Map(rows.filter(r => r.zoom_id).map(r => [`${r.zoom_kind}:${r.zoom_id}`, r])).values()];
  const kpis = data?.kpis || {};
  async function runSync() {
    setSyncing(true);
    try { await apiFetch('/admin/zoom/sync', { method: 'POST', body: JSON.stringify({}) }); notify('Đã bắt đầu đồng bộ Zoom. Số liệu cập nhật sau vài phút.'); }
    catch { /* shown */ } finally { setSyncing(false); }
  }
  async function session(uuid, body) {
    try { await apiFetch(`/admin/zoom-events/sessions/${encodeURIComponent(uuid)}`, { method: 'PATCH', body: JSON.stringify(body) }); reload(); }
    catch { /* shown */ }
  }
  async function fromSession(uuid) {
    try { const result = await apiFetch('/admin/zoom-events', { method: 'POST', body: JSON.stringify({ from_session: uuid }) }); onOpen(result.id); }
    catch { /* shown */ }
  }
  const lastSync = sync.data?.finished_at || sync.data?.last_finished_at;
  const counts = sessions.data?.counts || {};

  return h(React.Fragment, null,
    h('div', { className: 'cu-title-row' },
      h('h1', { className: 'cu-grow' }, 'Sự kiện Zoom'),
      lastSync ? h('span', { className: 'cu-muted' }, `Đồng bộ từ Zoom lúc ${when(lastSync)}`) : null,
      canEdit ? h('button', { type: 'button', className: 'cu-btn cu-btn-secondary', disabled: syncing, onClick: runSync }, syncing ? 'Đang gửi…' : 'Đồng bộ ngay') : null,
      canEdit ? h('button', { type: 'button', className: 'cu-btn cu-btn-primary', 'aria-expanded': creating, onClick: () => setCreating(v => !v) }, 'Tạo sự kiện') : null),
    creating ? h(CreatePanel, { apiFetch, rooms, onClose: () => setCreating(false), onCreated: id => { setCreating(false); onOpen(id); } }) : null,
    list.error ? h('div', { className: 'cu-card cu-empty cu-error' }, list.error) : !data ? h('div', { className: 'cu-card cu-pad' }, h(Skeleton)) : h(React.Fragment, null,
      h('section', { className: 'cu-card cu-pad ze-open', 'aria-label': 'Trang /zoom' },
        data.open ? h(React.Fragment, null,
          h('div', { className: 'cu-grow cu-min0' },
            h('div', { className: 'cu-row-gap' }, h(Badge, { tone: 'success' }, '/zoom đang mở'),
              h('button', { type: 'button', className: 'cu-link ze-strong', onClick: () => onOpen(data.open.id) }, data.open.title)),
            h('div', { className: 'cu-muted' }, `${room(data.open)} · ${when(data.open.starts_at)} · ${fmt(data.open.stats.registrations)} đăng ký · ${fmt(data.open.stats.links)} đã có link riêng${data.open.stats.registrations - data.open.stats.links ? ` · ${fmt(data.open.stats.registrations - data.open.stats.links)} đang chờ Zoom cấp` : ''}`)),
          h('a', { className: 'cu-btn cu-btn-plain', href: '/zoom', target: '_blank', rel: 'noopener noreferrer' }, 'Xem trang'),
          h('button', { type: 'button', className: 'cu-btn cu-btn-plain', onClick: () => openPageEditor(ui) }, 'Sửa trang'))
          : h('span', { className: 'cu-muted' }, '/zoom chưa mở sự kiện nào. Tạo sự kiện rồi bấm "Mở trên /zoom".')),
      h('div', { className: 'fu-kpis fu-kpis-4' },
        [['Đăng ký /zoom 30 ngày', fmt(kpis.registrations_30d), 'mọi sự kiện'],
          ['Tỷ lệ tham dự', kpis.attendance_rate == null ? '—' : `${Math.round(kpis.attendance_rate * 100)}%`, 'người đăng ký có vào Zoom'],
          ['Ở lại đến cuối', kpis.stayed_rate == null ? '—' : `${Math.round(kpis.stayed_rate * 100)}%`, 'trong số người tham dự'],
          ['Việc cần xử lý', fmt((kpis.unmatched || 0) + (kpis.unassigned_sessions || 0)), `${fmt(kpis.unmatched)} người tham dự chưa khớp · ${fmt(kpis.unassigned_sessions)} buổi chưa gán`]]
          .map(([label, value, hint]) => h('section', { key: label, className: 'fu-kpi' }, h('h2', null, label), h('div', { className: 'fu-kpi-value' }, h('span', null, value)), h('p', null, hint)))),
      h('section', { className: 'cu-card' },
        h('div', { className: 'cu-tabs', role: 'tablist', 'aria-label': 'Sự kiện hoặc buổi' },
          [['events', 'Sự kiện', rows.length], ['sessions', 'Buổi Zoom', kpis.unassigned_sessions ? `${kpis.unassigned_sessions} chưa gán` : '']].map(([id, label, count]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': tab === id, className: tab === id ? 'cu-tab on' : 'cu-tab', onClick: () => setTab(id) }, label, count ? h('span', null, count) : null))),
        tab === 'events' ? h(React.Fragment, null,
          h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table fu-table' },
            h('thead', null, h('tr', null, ['Sự kiện', 'Thời gian', 'Trạng thái', 'Đăng ký', 'Tham dự', 'Ở lại đến cuối', 'Vào không đăng ký'].map((l, i) => h('th', { key: l, className: i >= 3 ? 'cu-right' : '' }, l)))),
            h('tbody', null, rows.length ? rows.map(e => {
              const [label, tone] = STATUS[e.status] || [e.status, 'neutral'];
              return h('tr', { key: e.id, className: 'cu-row' },
                h('td', null, h('button', { type: 'button', className: 'cu-link fu-person', onClick: () => onOpen(e.id) }, e.title || '(chưa đặt tên)'), h('div', { className: 'cu-sub' }, `${room(e)} · ${e.stats.sessions ? `${e.stats.sessions} buổi` : e.status === 'closed' ? 'chưa có buổi' : 'chưa diễn ra'}`)),
                h('td', { className: 'cu-nowrap' }, when(e.starts_at)),
                h('td', null, h(Badge, { tone }, label), h('div', { className: 'cu-sub' }, e.has_page ? (e.status === 'open' ? 'trên /zoom' : e.status === 'draft' ? 'chờ mở trên /zoom' : 'đã dùng /zoom') : 'không có trang')),
                h('td', { className: 'cu-right cu-tabular' }, e.has_page ? fmt(e.stats.registrations) : '—'),
                h('td', { className: 'cu-right cu-tabular' }, e.stats.sessions ? fmt(e.has_page ? e.stats.attended : e.stats.attendees) : '—', e.has_page && e.stats.sessions ? h('div', { className: 'cu-sub' }, pct(e.stats.attended, e.stats.registrations)) : null),
                h('td', { className: 'cu-right cu-tabular' }, e.stats.sessions ? fmt(e.has_page ? e.stats.stayed : e.stats.stayed_all) : '—', e.stats.sessions ? h('div', { className: 'cu-sub' }, e.has_page ? pct(e.stats.stayed, e.stats.attended) : pct(e.stats.stayed_all, e.stats.attendees)) : null),
                h('td', { className: 'cu-right cu-tabular' }, e.stats.sessions ? fmt(e.stats.walkins) : '—'));
            }) : h('tr', null, h('td', { colSpan: 7, className: 'cu-empty' }, 'Chưa có sự kiện nào.'))))),
          h('div', { className: 'ze-foot' }, 'Tham dự và đăng ký được nối qua hồ sơ khách: đăng ký bằng email này, vào Zoom bằng email khác của cùng người vẫn tính là đã đăng ký. "Ở lại đến cuối" = có mặt từ 2/3 thời lượng buổi.'))
          : h(React.Fragment, null,
            h('div', { className: 'cu-bar' }, [['all', 'Đang hiện', counts.all], ['unassigned', 'Chưa gán', counts.unassigned], ['hidden', 'Đã ẩn', counts.hidden]].map(([id, label, n]) => h('button', { key: id, type: 'button', className: view === id ? 'cu-chip on' : 'cu-chip', 'aria-pressed': view === id, onClick: () => setView(id) }, `${label} `, h('span', { className: 'ze-dim' }, fmt(n))))),
            !sessions.data ? h('div', { className: 'cu-pad' }, h(Skeleton)) : h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table fu-table' },
              h('thead', null, h('tr', null, ['Buổi (chủ đề trên Zoom)', 'Bắt đầu', 'Người vào', 'Là khách', 'Thuộc sự kiện'].map((l, i) => h('th', { key: l, className: i === 2 || i === 3 ? 'cu-right' : '' }, l)), h('th', null, h('span', { className: 'sr-only' }, 'Ẩn')))),
              h('tbody', null, sessions.data.rows.length ? sessions.data.rows.map(s => h('tr', { key: s.zoom_meeting_uuid, className: s.hidden ? 'cu-row fu-dim' : 'cu-row' },
                h('td', null, h('strong', { className: 'cu-strong' }, s.topic || '—'), h('div', { className: 'cu-sub' }, `${s.type === '4' ? 'Phòng cá nhân' : s.type === '8' ? 'Meeting định kỳ' : 'Meeting'} ${s.zoom_meeting_id}`)),
                h('td', { className: 'cu-nowrap' }, when(s.start_time), h('div', { className: 'cu-sub' }, `${fmt(s.duration)} phút${s.excluded ? ' · bỏ khỏi sự kiện' : ''}`)),
                h('td', { className: 'cu-right cu-tabular' }, fmt(s.people)),
                h('td', { className: 'cu-right cu-tabular' }, fmt(s.contacts)),
                h('td', null, s.event_id
                  ? h(React.Fragment, null, h('button', { type: 'button', className: 'cu-link', onClick: () => onOpen(s.event_id) }, s.event_title), h('span', { className: 'cu-sub' }, s.source === 'manual' ? ' · gán tay' : ' · tự gán'))
                  : canEdit ? h('select', { className: 'ze-input ze-select', 'aria-label': 'Gán buổi vào sự kiện', value: '', onChange: e => { const v = e.target.value; if (v === 'new') fromSession(s.zoom_meeting_uuid); else if (v) session(s.zoom_meeting_uuid, { event_id: v }); } },
                    h('option', { value: '' }, 'Chưa gán…'), rows.map(e => h('option', { key: e.id, value: e.id }, e.title)), h('option', { value: 'new' }, '+ Tạo sự kiện từ buổi này')) : h('span', { className: 'cu-muted' }, 'Chưa gán')),
                h('td', { className: 'cu-right cu-nowrap' }, s.hidden && s.hidden_by === 'auto' ? h('span', { className: 'cu-sub' }, 'tự ẩn: nội bộ ') : null,
                  canEdit ? h('button', { type: 'button', className: 'cu-btn cu-btn-ghost cu-btn-sm', onClick: () => session(s.zoom_meeting_uuid, { hidden: !s.hidden }) }, s.hidden ? 'Bỏ ẩn' : 'Ẩn') : null)))
                : h('tr', null, h('td', { colSpan: 6, className: 'cu-empty' }, 'Không có buổi nào.'))))),
            h('div', { className: 'ze-foot' }, 'Buổi tự gán vào sự kiện khi cùng phòng Zoom và đúng khoảng thời gian. Phòng họp cá nhân không tự gán. Buổi tối đa 5 người và không ai là khách thì tự ẩn.')))));
}

const DETAIL_TABS = [['overview', 'Tổng quan'], ['people', 'Khách'], ['unmatched', 'Tham dự chưa khớp'], ['sessions', 'Buổi'], ['page', 'Trang /zoom']];
const PEOPLE_VIEWS = [['all', 'Tất cả'], ['stayed', 'Ở lại đến cuối'], ['attended', 'Tham dự, về sớm'], ['clicked', 'Bấm link, không vào'], ['absent', 'Vắng'], ['walkin', 'Vào không đăng ký']];

function exportPeople(event, people) {
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Tên', 'Email', 'Đăng ký', 'Nguồn', 'Link riêng', 'Bấm link', 'Phút có mặt', 'Kết quả'].map(cell).join(',')].concat(people.map(p => [p.name, p.email, p.registered_at ? when(p.registered_at) : '', p.source, p.has_link ? 'có' : '', p.clicks, p.minutes, RESULTS[p.status][0]].map(cell).join(',')));
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `zoom-${(event.title || 'su-kien').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.csv` });
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

function FindPerson({ apiFetch, onPick }) {
  const [q, setQ] = React.useState('');
  const [rows, setRows] = React.useState([]);
  React.useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return undefined; }
    const t = setTimeout(() => apiFetch(`/admin/contacts?q=${encodeURIComponent(q.trim())}&pageSize=5`).then(d => setRows(d.rows || [])).catch(() => setRows([])), 300);
    return () => clearTimeout(t);
  }, [q, apiFetch]);
  return h('div', { className: 'ze-find' },
    h('input', { className: 'ze-input', value: q, onChange: e => setQ(e.target.value), placeholder: 'Tên, SĐT hoặc email', 'aria-label': 'Tìm hồ sơ khách', autoFocus: true }),
    rows.length ? h('ul', { className: 'ze-find-list' }, rows.map(r => h('li', { key: r.id }, h('button', { type: 'button', onClick: () => onPick(r.id) }, h('strong', null, r.name || 'Chưa có tên'), h('span', { className: 'cu-sub' }, ` ${[r.email, r.phone].filter(Boolean).join(' · ')}`))))) : null);
}

function EventDetail({ id, apiFetch, canEdit, ui, onBack }) {
  const [tab, setTab] = React.useState('overview');
  const [peopleView, setPeopleView] = React.useState('all');
  const [finding, setFinding] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  const state = useLoad(`/admin/zoom-events/${encodeURIComponent(id)}`, apiFetch, reloadKey);
  const unassigned = useLoad(tab === 'sessions' && canEdit ? '/admin/zoom-events/sessions?view=unassigned' : '', apiFetch, reloadKey);
  const reload = () => setReloadKey(k => k + 1);
  const d = state.data;
  if (!d) return h(React.Fragment, null,
    h('div', { className: 'cu-detail-head' }, h('button', { type: 'button', className: 'cu-icon-btn cu-icon-32', onClick: onBack, 'aria-label': 'Quay lại danh sách sự kiện' }, '‹'), h('h1', null, 'Sự kiện Zoom')),
    state.error ? h('div', { className: 'cu-card cu-empty cu-error' }, state.error) : h('div', { className: 'cu-card cu-pad' }, h(Skeleton)));
  const e = d.event, s = d.stats;
  const [statusLabel, statusTone] = STATUS[e.status] || [e.status, 'neutral'];
  async function act(path, method, body, message) {
    try { await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined }); if (message) notify(message); reload(); return true; }
    catch { return false; }
  }
  async function openOnZoom() {
    if (!await confirmAction(`Mở "${e.title}" trên /zoom? Sự kiện đang mở (nếu có) sẽ đóng đăng ký; link riêng khách đã nhận tự chuyển sang sự kiện này.`, false)) return;
    act(`/admin/zoom-events/${e.id}/open`, 'POST', null, 'Đã mở sự kiện trên /zoom');
  }
  async function createPerson(u) {
    try {
      for (const attendanceId of u.attendance_ids.slice(0, 1)) await apiFetch(`/admin/zoom/participants/${encodeURIComponent(attendanceId)}/create-lead`, { method: 'POST' });
      await apiFetch('/admin/zoom-events/refresh', { method: 'POST' });
      if (u.attendance_ids.length > 1) await apiFetch('/admin/zoom-events/refresh', { method: 'POST' });
      notify('Đã tạo hồ sơ'); reload();
    } catch { /* shown */ }
  }
  const total = d.total_minutes;
  const people = d.people.filter(p => peopleView === 'all' || p.status === peopleView);
  const counts = Object.fromEntries(PEOPLE_VIEWS.map(([key]) => [key, key === 'all' ? d.people.length : d.people.filter(p => p.status === key).length]));
  const steps = [
    ['Đăng ký', 'qua /zoom', s.registrations], ['Có link riêng', 'Zoom đã cấp', s.links], ['Bấm link', 'từ trang hoặc email', s.clicked],
    ['Tham dự', 'khớp qua hồ sơ khách', s.attended], ['Ở lại đến cuối', 'có mặt ≥ 2/3 buổi', s.stayed],
  ];
  const peak = Math.max(1, ...d.curve.map(c => c.people));
  const tabCounts = { people: d.people.length, unmatched: d.unmatched.length, sessions: d.sessions.length };

  return h(React.Fragment, null,
    h('div', { className: 'cu-detail-head' },
      h('button', { type: 'button', className: 'cu-icon-btn cu-icon-32', onClick: onBack, 'aria-label': 'Quay lại danh sách sự kiện' }, '‹'),
      h('div', { className: 'cu-grow cu-min0' },
        h('div', { className: 'cu-row-gap' }, h('h1', null, e.title), h(Badge, { tone: statusTone }, `${statusLabel}${e.has_page ? (e.status === 'open' ? ' · trên /zoom' : e.status === 'closed' ? ' · đã dùng /zoom' : '') : ' · không có trang'}`)),
        h('div', { className: 'cu-muted' }, `${room(e)} · ${when(e.starts_at)} · dự kiến ${e.duration_minutes} phút · ${s.sessions} buổi`)),
      canEdit && e.has_page && e.status !== 'open' && e.zoom_id ? h('button', { type: 'button', className: 'cu-btn cu-btn-secondary', onClick: openOnZoom }, 'Mở trên /zoom') : null,
      h('button', { type: 'button', className: 'cu-btn cu-btn-primary', onClick: () => exportPeople(e, d.people) }, 'Xuất danh sách')),
    h('nav', { className: 'fu-tabs', role: 'tablist', 'aria-label': 'Các mục của sự kiện' },
      DETAIL_TABS.filter(([key]) => key !== 'page' || e.has_page || canEdit).map(([key, label]) => h('button', { key, type: 'button', role: 'tab', 'aria-selected': tab === key, className: tab === key ? 'on' : '', onClick: () => setTab(key) }, label, tabCounts[key] ? h('span', null, fmt(tabCounts[key])) : null))),

    tab === 'overview' ? h(React.Fragment, null,
      h('section', { className: 'cu-card fu-pad fu-stack-12', 'aria-label': 'Phễu sự kiện' },
        h('div', { className: 'fu-card-head' }, h('h2', null, 'Từ đăng ký đến ở lại cuối buổi'), h('span', { className: 'cu-sub' }, 'Mỗi bước tính trên số người đăng ký')),
        e.has_page ? steps.map(([label, hint, value]) => h('div', { key: label, className: 'ze-step' },
          h('span', null, label, h('span', { className: 'cu-sub ze-block' }, hint)),
          h('div', { className: 'ze-step-bar' }, h('div', { style: { width: `${s.registrations ? Math.round(value / s.registrations * 100) : 0}%` } })),
          h('span', { className: 'cu-right cu-tabular' }, h('strong', null, fmt(value)), ' ', h('span', { className: 'cu-muted' }, label === 'Đăng ký' ? '' : pct(value, s.registrations)))))
          : h('p', { className: 'cu-muted' }, `Sự kiện không có trang đăng ký: ${fmt(s.attendees)} người tham dự, ${fmt(s.stayed_all)} người ở lại đến cuối.`),
        h('div', { className: 'ze-note' },
          e.has_page ? h('span', null, 'Ngoài ra ', h('strong', null, fmt(s.walkins)), ' người vào bằng link chung, không đăng ký') : null,
          h('span', null, `Thời lượng buổi ${fmt(total)} phút → mốc ở lại đến cuối là `, h('strong', null, `${fmt(s.stay_minutes)} phút`)))),
      h('div', { className: 'fu-row' },
        h('section', { className: 'cu-card fu-chart-card', 'aria-label': 'Có mặt theo thời gian' },
          h('h2', null, 'Số người trong phòng theo phút'),
          d.curve.length ? h('div', { className: 'fu-bars', role: 'img', 'aria-label': `Số người có mặt theo phút, cao nhất ${peak} người` },
            d.curve.map(c => h('div', { key: c.minute, className: 'fu-bar', title: `Phút ${c.minute}: ${c.people} người` }, h('div', { className: c.minute >= s.stay_minutes ? 'new' : 'old', style: { height: `${c.people / peak * 100}%` } }))))
            : h('p', { className: 'cu-muted' }, 'Chưa có buổi nào được tính.'),
          d.curve.length ? h('div', { className: 'fu-axis' }, h('span', null, 'Bắt đầu'), h('span', null, `Phút ${s.stay_minutes} (mốc 2/3)`), h('span', null, `Phút ${d.curve[d.curve.length - 1].minute}`)) : null),
        h('section', { className: 'cu-card fu-who', 'aria-label': 'Nguồn đăng ký' },
          h('h2', null, 'Nguồn đăng ký → tham dự'),
          d.sources.length ? d.sources.slice(0, 6).map(src => h('div', { key: src.source, className: 'cu-kv' }, h('span', null, src.source), h('span', { className: 'cu-tabular' }, `${fmt(src.registrations)} · tham dự ${pct(src.attended, src.registrations) || '0%'}`))) : h('p', { className: 'cu-muted' }, 'Chưa có lượt đăng ký.'),
          e.has_page ? h('div', { className: 'fu-who-foot' },
            h('div', { className: 'cu-kv' }, h('span', null, 'Đã có hồ sơ từ phễu khác'), h('strong', null, fmt(s.known_before))),
            h('div', { className: 'cu-kv' }, h('span', null, 'Khách mới qua /zoom'), h('strong', null, fmt(s.new_people)))) : null))) : null,

    tab === 'people' ? h('section', { className: 'cu-card cu-list-card' },
      h('div', { className: 'cu-bar' }, PEOPLE_VIEWS.map(([key, label]) => h('button', { key, type: 'button', className: peopleView === key ? 'cu-chip on' : 'cu-chip', 'aria-pressed': peopleView === key, onClick: () => setPeopleView(key) }, `${label} `, h('span', { className: 'ze-dim' }, fmt(counts[key]))))),
      h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table fu-table' },
        h('thead', null, h('tr', null, ['Khách', 'Đăng ký', 'Link riêng', 'Bấm link', `Có mặt (mốc ${s.stay_minutes} phút)`, 'Kết quả'].map(l => h('th', { key: l }, l)))),
        h('tbody', null, people.length ? people.slice(0, 500).map(p => {
          const [result, tone] = RESULTS[p.status];
          return h('tr', { key: p.key, className: 'cu-row' },
            h('td', null, p.contact_id ? h('button', { type: 'button', className: 'cu-link fu-person', onClick: () => openPerson(ui, p.contact_id) }, p.name || p.email) : h('strong', { className: 'cu-strong' }, p.name || p.email),
              h('div', { className: 'cu-sub' }, p.email), p.emails_in_zoom.some(x => x && x.toLowerCase() !== String(p.email).toLowerCase()) ? h('div', { className: 'cu-sub ze-dim' }, `vào bằng ${p.emails_in_zoom.filter(x => x.toLowerCase() !== String(p.email).toLowerCase()).join(', ')} (cùng hồ sơ)`) : null),
            h('td', { className: 'cu-nowrap' }, p.registered_at ? when(p.registered_at) : '—', h('div', { className: 'cu-sub' }, p.registered_at ? (p.source || '(direct)') : '')),
            h('td', null, !p.registered_at ? '—' : p.has_link ? h(Badge, { tone: 'success' }, 'Có') : h(Badge, { tone: 'warning' }, p.zoom_error ? 'Zoom từ chối' : 'Chưa có')),
            h('td', { className: 'cu-nowrap' }, p.first_click ? when(p.first_click) : p.registered_at ? 'Chưa bấm' : '—'),
            h('td', null, h('div', { className: 'ze-presence' }, h('div', { style: { width: `${Math.min(100, Math.round(p.minutes / Math.max(1, total) * 100))}%`, background: p.stayed ? '#29845a' : '#91c3f5' } }), h('i', { 'aria-hidden': true })),
              h('div', { className: 'cu-sub' }, p.minutes ? `${p.minutes}/${total} phút` : 'không vào')),
            h('td', null, h(Badge, { tone }, result)));
        }) : h('tr', null, h('td', { colSpan: 6, className: 'cu-empty' }, 'Không có ai trong nhóm này.')))))) : null,

    tab === 'unmatched' ? h('section', { className: 'cu-card' },
      h('div', { className: 'cu-pad cu-muted' }, 'Người vào Zoom nhưng email không thuộc hồ sơ khách nào (hoặc Zoom không có email). Gợi ý theo tên hiển thị, không tự gộp.'),
      d.unmatched.length ? h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table fu-table' },
        h('thead', null, h('tr', null, ['Tên trong Zoom', 'Email Zoom', 'Có mặt', 'Gợi ý'].map((l, i) => h('th', { key: l, className: i === 2 ? 'cu-right' : '' }, l)), h('th', null, h('span', { className: 'sr-only' }, 'Thao tác')))),
        h('tbody', null, d.unmatched.map(u => {
          const key = u.attendance_ids[0];
          const best = u.suggestions[0];
          return h('tr', { key, className: 'cu-row' },
            h('td', { className: 'cu-strong' }, u.name || '—'),
            h('td', { className: 'cu-muted' }, u.email || '—'),
            h('td', { className: 'cu-right cu-tabular' }, `${fmt(u.minutes)} phút`),
            h('td', null, finding === key ? h(FindPerson, { apiFetch, onPick: contactId => { setFinding(''); act('/admin/zoom-events/attendances/link', 'POST', { attendance_ids: u.attendance_ids, contact_id: contactId }, 'Đã gán vào hồ sơ'); } })
              : best ? h('span', null, best.display_name, h('span', { className: 'cu-sub' }, ` · ${best.primary_email || ''}${u.suggestions.length > 1 ? ` · ${u.suggestions.length} hồ sơ cùng tên, chưa chắc` : ''}`)) : h('span', { className: 'cu-muted' }, 'Không có gợi ý')),
            h('td', { className: 'cu-right cu-nowrap' }, canEdit ? h(React.Fragment, null,
              best && u.suggestions.length === 1 ? h('button', { type: 'button', className: 'cu-btn cu-btn-plain cu-btn-sm', onClick: () => act('/admin/zoom-events/attendances/link', 'POST', { attendance_ids: u.attendance_ids, contact_id: best.id }, 'Đã gán vào hồ sơ') }, 'Gán theo gợi ý')
                : h('button', { type: 'button', className: 'cu-btn cu-btn-plain cu-btn-sm', onClick: () => setFinding(finding === key ? '' : key) }, finding === key ? 'Đóng' : 'Tìm hồ sơ…'),
              u.email ? h('button', { type: 'button', className: 'cu-btn cu-btn-ghost cu-btn-sm', onClick: () => createPerson(u) }, 'Tạo hồ sơ') : null) : null));
        })))) : h('div', { className: 'cu-empty' }, 'Mọi người tham dự đã khớp hồ sơ khách.')) : null,

    tab === 'sessions' ? h('section', { className: 'cu-card' },
      h('div', { className: 'cu-bar' },
        h('span', { className: 'cu-muted cu-grow' }, 'Buổi cùng phòng Zoom, bắt đầu từ 12 giờ trước giờ dự kiến đến trước sự kiện kế tiếp, được tự gán. Buổi bị bỏ ra không tính vào tham dự.'),
        canEdit && unassigned.data?.rows?.length ? h('select', { className: 'ze-input ze-select', value: '', 'aria-label': 'Gán thêm buổi', onChange: ev => ev.target.value && act(`/admin/zoom-events/sessions/${encodeURIComponent(ev.target.value)}`, 'PATCH', { event_id: e.id }, 'Đã gán buổi') },
          h('option', { value: '' }, 'Gán thêm buổi chưa gán…'), unassigned.data.rows.map(m => h('option', { key: m.zoom_meeting_uuid, value: m.zoom_meeting_uuid }, `${m.topic || m.zoom_meeting_id} · ${when(m.start_time)} · ${m.people} người`))) : null),
      d.sessions.length ? h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table fu-table' },
        h('thead', null, h('tr', null, ['Buổi', 'Thời lượng thực tế', 'Người vào', 'Gán bởi', 'Tính vào sự kiện'].map((l, i) => h('th', { key: l, className: i === 1 || i === 2 ? 'cu-right' : '' }, l)), canEdit ? h('th', null, h('span', { className: 'sr-only' }, 'Bỏ gán')) : null)),
        h('tbody', null, d.sessions.map(m => h('tr', { key: m.zoom_meeting_uuid, className: m.excluded ? 'cu-row fu-dim' : 'cu-row' },
          h('td', null, h('strong', { className: 'cu-strong' }, when(m.start_time)), h('div', { className: 'cu-sub' }, m.topic)),
          h('td', { className: 'cu-right cu-tabular' }, `${fmt(m.duration)} phút`),
          h('td', { className: 'cu-right cu-tabular' }, fmt(m.people)),
          h('td', null, m.source === 'manual' ? 'Admin' : 'Tự gán'),
          h('td', null, canEdit ? h('label', { className: 'cu-check' }, h('input', { type: 'checkbox', checked: !m.excluded, onChange: () => act(`/admin/zoom-events/sessions/${encodeURIComponent(m.zoom_meeting_uuid)}`, 'PATCH', { excluded: !m.excluded }) }), m.excluded ? 'Bỏ ra (tập dượt)' : 'Có') : (m.excluded ? 'Bỏ ra' : 'Có')),
          canEdit ? h('td', { className: 'cu-right' }, h('button', { type: 'button', className: 'cu-btn cu-btn-ghost cu-btn-sm', onClick: () => act(`/admin/zoom-events/sessions/${encodeURIComponent(m.zoom_meeting_uuid)}`, 'PATCH', { event_id: null }, 'Đã bỏ buổi khỏi sự kiện') }, 'Bỏ gán')) : null))))) : h('div', { className: 'cu-empty' }, 'Chưa có buổi nào. Buổi sẽ tự gán sau khi đồng bộ Zoom.')) : null,

    tab === 'page' ? h('section', { className: 'cu-card cu-pad fu-stack-12' },
      canEdit ? h('label', { className: 'cu-check' }, h('input', { type: 'checkbox', checked: e.has_page, disabled: e.status === 'open', onChange: () => act(`/admin/zoom-events/${e.id}`, 'PATCH', { has_page: !e.has_page }) }), h('strong', null, 'Dùng trang /zoom để nhận đăng ký')) : null,
      e.has_page ? h(React.Fragment, null,
        h('div', { className: 'ze-status-box' },
          h('span', { className: 'cu-grow' }, e.status === 'open' ? 'Sự kiện này đang mở trên /zoom.' : e.status === 'draft' ? 'Sự kiện nháp, chưa nhận đăng ký.' : 'Sự kiện này đã đóng đăng ký.'),
          canEdit && e.status !== 'open' && e.zoom_id ? h('button', { type: 'button', className: 'cu-btn cu-btn-secondary', onClick: openOnZoom }, e.status === 'closed' ? 'Mở lại trên /zoom' : 'Mở trên /zoom') : null,
          canEdit && e.status === 'open' ? h('button', { type: 'button', className: 'cu-btn cu-btn-ghost', onClick: async () => { if (await confirmAction('Đóng đăng ký trên /zoom? Trang sẽ báo "chưa mở đăng ký" cho tới khi mở sự kiện khác.', false)) act(`/admin/zoom-events/${e.id}`, 'PATCH', { status: 'closed' }, 'Đã đóng đăng ký'); } }, 'Đóng đăng ký') : null),
        h('span', { className: 'cu-sub' }, 'Chỉ một sự kiện mở trên /zoom tại một thời điểm. Mở sự kiện này sẽ đóng sự kiện đang mở; link riêng khách đã nhận tự chuyển sang sự kiện đang mở.'),
        h('div', { className: 'ze-cards' },
          h('div', { className: 'ze-mini' }, h('strong', null, 'Nội dung trang'), h('div', { className: 'cu-muted' }, 'Banner, tiêu đề, điểm nổi bật, chân trang, ảnh chia sẻ'), e.status === 'open' ? h('button', { type: 'button', className: 'cu-btn cu-btn-plain cu-btn-sm', onClick: () => openPageEditor(ui) }, 'Mở trình sửa trang') : h('span', { className: 'cu-sub' }, 'Sửa được khi sự kiện đang mở trên /zoom.')),
          h('div', { className: 'ze-mini' }, h('strong', null, 'Link riêng'), h('div', { className: 'cu-muted' }, `${fmt(s.links)}/${fmt(s.registrations)} người đã có link Zoom riêng`), e.status === 'open' && s.registrations > s.links && canEdit ? h('button', { type: 'button', className: 'cu-btn cu-btn-plain cu-btn-sm', onClick: () => act('/admin/zoom-event/retry-links', 'POST', null, 'Đang tạo lại link lỗi') }, 'Tạo lại link lỗi') : null)))
        : h('p', { className: 'cu-muted' }, 'Sự kiện không có trang: chỉ gom buổi và người tham dự để báo cáo. Người vào đều tính là "vào không đăng ký".')) : null);
}
