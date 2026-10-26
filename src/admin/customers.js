import React from 'react';
import { Skeleton, notify } from './ui.js';
import './customers.css';

// CRM > Khách hàng (roadmap 3.2): one row per person from the contacts layer. A person's
// registrations keep their own details; "Mở lượt đăng ký" opens the existing lead view.
// Layout follows the approved mockups (design canvas: Main, Mobile, Contact).
const h = React.createElement;
const fmt = n => new Intl.NumberFormat('vi-VN').format(Number(n || 0));
// "15/10 20:00" with time, "15/10/2026" without (Vietnam time).
const date = (value, withTime = true) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return withTime ? `${p.day}/${p.month} ${p.hour}:${p.minute}` : `${p.day}/${p.month}/${p.year}`;
};
function ago(value) {
  if (!value) return '—';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} phút trước`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} giờ trước`;
  const days = Math.floor(minutes / 1440);
  return days === 1 ? 'Hôm qua' : days < 30 ? `${days} ngày trước` : date(value, false);
}
const vnDay = value => value ? new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10) : '';
const isToday = value => value && vnDay(value) === vnDay(new Date());
// Where a touch came from, in words. Contacts built since 26/10 also carry page_id and, for
// forms of the old WordPress site, site: 'wordpress' (src/contacts/service.js summary).
function touchLabel(touch, { short = false } = {}) {
  if (!touch) return '—';
  // Lead rows fill a missing UTM with 'direct' / '(none)' (mapLeadRow): that is "no source".
  const t = { ...touch, source: touch.source === 'direct' ? '' : touch.source, medium: touch.medium === '(none)' && touch.source !== '(direct)' ? '' : touch.medium };
  const utm = [t.source, t.medium, t.campaign].filter(Boolean).join(' · ');
  if (t.site === 'wordpress') {
    const form = t.page_id && t.page_id !== 'wordpress' ? String(t.page_id).replace(/^wp:/, '') : '';
    return short ? `Website cũ${t.source ? ` · ${t.source}` : ''}` : `Website WordPress cũ${form ? ` · form ${form}` : ''} · ${t.source ? [t.source, t.campaign].filter(Boolean).join(' · ') : 'không rõ nguồn'}`;
  }
  // Leads made from a Zoom attendance list (Zoom > Tạo lead) carry zoom / meeting / meeting ID.
  if (t.source === 'zoom' && t.medium === 'meeting') return short ? 'Tham dự Zoom' : `Thêm từ danh sách tham dự Zoom${t.campaign ? ` · phòng ${t.campaign}` : ''}`;
  if (t.source === '(direct)') return 'Vào trực tiếp';
  if (!t.source) return 'Không rõ nguồn';
  return short ? [t.source, t.campaign || t.medium].filter(Boolean).join(' · ') : utm;
}
const touchText = t => touchLabel(t, { short: true });
// Where the touch led: the landing page, else the funnel registered.
const touchPlace = t => t?.landing_path ? `vào ${t.landing_path}` : t?.page_id && t.site !== 'wordpress' ? `đăng ký /${t.page_id}` : '';
// Minutes in a Zoom room from join/leave pieces: overlapping pieces (rejoins, a second device)
// count once.
function zoomMinutes(pieces) {
  const spans = pieces.map(a => { const join = new Date(a.join_time).getTime(); return [join, a.leave_time ? new Date(a.leave_time).getTime() : join + Number(a.duration || 0) * 1000]; })
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((x, y) => x[0] - y[0]);
  let total = 0, start = null, end = null;
  for (const [a, b] of spans) {
    if (start === null || a > end) { if (start !== null) total += end - start; start = a; end = b; } else end = Math.max(end, b);
  }
  if (start !== null) total += end - start;
  return Math.round(total / 60000);
}
const clock = value => date(value).slice(6);
const phoneDigits = phone => String(phone || '').replace(/\D/g, '');
const zaloUrl = phone => phoneDigits(phone) ? `https://zalo.me/${phoneDigits(phone)}` : '';
const initials = name => String(name || '?').trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase() || '?';
const TINTS = ['#e0f0ff', '#cdfee1', '#ffeb78', '#fedad9', '#e3e3e3'];
const tint = id => TINTS[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TINTS.length];
const query = params => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
const VIEWS = [['all', 'Tất cả'], ['mine', 'Của tôi'], ['today', 'Mới hôm nay'], ['no_note', 'Chưa có ghi chú'], ['unassigned', 'Chưa giao'], ['candidates', 'Có thể trùng'], ['multi_email', 'Nhiều email']];
const SORTS = [['recent', 'Đăng ký gần đây'], ['first', 'Đến lần đầu gần đây'], ['name', 'Tên A–Z']];
const NOTE_KINDS = [['call', 'Gọi'], ['message', 'Nhắn tin'], ['meeting', 'Gặp'], ['note', 'Ghi chú']];
const PAGE_SIZE = 50;
const STATE_KEY = 'vinmocCustomerView';
const NO_FILTERS = { page: '', owner: '', tag: '', source: '' };
const readSaved = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; } catch { return {}; } };
const writeSaved = value => { try { localStorage.setItem(STATE_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ } };

const PATHS = {
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14', 'm20 20-3.5-3.5'],
  phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2'],
  chat: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z'],
  sort: ['M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3'],
  back: ['m15 18-6-6 6-6'],
};
const Svg = ({ name, size = 16 }) => h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true }, PATHS[name].map(d => h('path', { key: d, d })));

function useMeta(apiFetch) {
  const [meta, setMeta] = React.useState({ users: [], tags: [], customFields: [] });
  React.useEffect(() => {
    let live = true;
    Promise.all([
      apiFetch('/admin/crm/users').catch(() => ({ rows: [] })),
      apiFetch('/admin/crm/tags?counts=0').catch(() => ({ tags: [] })),
      apiFetch('/admin/crm/custom-fields').catch(() => ({ rows: [] })),
    ]).then(([u, t, f]) => { if (live) setMeta({ users: u.rows || [], tags: t.tags || [], customFields: f.rows || [] }); });
    return () => { live = false; };
  }, [apiFetch]);
  return meta;
}
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
const sales = meta => meta.users.filter(u => u.role === 'sale' && u.active !== false);
const tagLabel = tag => `${tag.category_name ? `${tag.category_name} / ` : ''}${tag.name}`;
const Badge = ({ tone = 'neutral', children, title }) => h('span', { className: `cu-badge cu-badge-${tone}`, title }, children);

function QuickNote({ registrationId, apiFetch, onSaved, rows = 2, autoFocus = false }) {
  const [body, setBody] = React.useState('');
  const [kind, setKind] = React.useState('call');
  const [saving, setSaving] = React.useState(false);
  async function submit() {
    const text = body.trim();
    if (!text || !registrationId || saving) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/leads/${registrationId}/notes`, { method: 'POST', body: JSON.stringify({ body: text, interaction_type: kind }) });
      setBody('');
      onSaved?.();
    } catch { /* apiFetch showed the error */ } finally { setSaving(false); }
  }
  return h('div', { className: 'cu-note' },
    h('textarea', {
      className: 'cu-textarea', rows, value: body, maxLength: 4000, 'aria-label': 'Ghi chú', autoFocus,
      placeholder: 'Ghi chú cuộc gọi, tin nhắn… (Ctrl+Enter để lưu)',
      onChange: e => setBody(e.target.value),
      onKeyDown: e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } },
    }),
    h('div', { className: 'cu-row-gap' },
      NOTE_KINDS.map(([id, label]) => h('button', { key: id, type: 'button', className: kind === id ? 'cu-chip on' : 'cu-chip', 'aria-pressed': kind === id, onClick: () => setKind(id) }, label)),
      h('span', { className: 'cu-grow' }),
      h('button', { type: 'button', className: 'cu-btn cu-btn-plain', disabled: !body.trim() || saving, onClick: submit }, saving ? 'Đang lưu…' : 'Lưu ghi chú')));
}

export default function CustomersPage({ apiFetch, currentUser, ui }) {
  const [contactId, setContactId] = React.useState(() => new URLSearchParams(location.search).get('contact') || '');
  React.useEffect(() => {
    const sync = () => setContactId(new URLSearchParams(location.search).get('contact') || '');
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  function open(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('contact', id); else url.searchParams.delete('contact');
    history.pushState(null, '', url.pathname + url.search);
    setContactId(id);
    window.scrollTo({ top: 0 });
  }
  const meta = useMeta(apiFetch);
  // Opened from another page (openContact): back returns there, with its filters in the URL.
  const back = () => history.state?.returnBack ? history.back() : open('');
  return h('div', { className: 'cu-page' }, contactId
    ? h(CustomerDetail, { id: contactId, apiFetch, currentUser, meta, ui, onBack: back, onOpen: open })
    : h(CustomerList, { apiFetch, currentUser, meta, ui, onOpen: open }));
}

// A gray filter button holding a Select: shows its name until something is chosen.
function FilterSelect({ ui, label, value, onChange, options }) {
  return h(ui.Select, { className: value ? 'cu-filter on' : 'cu-filter', value, 'aria-label': label, onChange: e => onChange(e.target.value) },
    h('option', { value: '' }, label), options.map(([id, text]) => h('option', { key: id, value: id }, text)));
}

function SortMenu({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return h('div', { className: 'cu-menu-wrap', ref },
    h('button', { type: 'button', className: 'cu-icon-btn cu-filter-icon', 'aria-label': `Sắp xếp: ${SORTS.find(s => s[0] === value)?.[1]}`, 'aria-expanded': open, onClick: () => setOpen(o => !o) }, h(Svg, { name: 'sort' })),
    open ? h('div', { className: 'cu-menu', role: 'menu' }, SORTS.map(([id, label]) => h('button', { key: id, type: 'button', role: 'menuitemradio', 'aria-checked': value === id, className: value === id ? 'on' : '', onClick: () => { onChange(id); setOpen(false); } }, label))) : null);
}

function exportRows(rows, meta) {
  const tagById = Object.fromEntries(meta.tags.map(t => [t.id, t.name]));
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Tên', 'SĐT', 'Email', 'Phễu', 'Sale', 'Tag', 'Đến từ', 'Đăng ký nhờ', 'Đến lần đầu', 'Đăng ký gần nhất', 'Ghi chú gần nhất'];
  const lines = [head.map(cell).join(',')].concat(rows.map(r => [r.name, r.phone, r.email, r.funnels.join(' '), r.owner_name, r.tag_ids.map(id => tagById[id]).filter(Boolean).join(', '), touchText(r.first_touch), touchText(r.last_touch), date(r.first_registered_at), date(r.last_registered_at), r.latest_note].map(cell).join(',')));
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `khach-hang-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

// Opens a person in CRM > Khách hàng from another page. The page left stays one step back
// in the browser history, and the person's back button returns to it.
export async function openContact(ui, id) {
  await ui.openModule?.('customers');
  if (!location.pathname.endsWith('/customers')) return; // unsaved changes kept the user here
  history.replaceState({ returnBack: true }, '', `/admin/view/customers?contact=${encodeURIComponent(id)}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// The people of one funnel (funnel page > "Khách hàng"): opens the person in CRM > Khách hàng.
export function FunnelCustomers({ apiFetch, currentUser, ui, pages }) {
  const meta = useMeta(apiFetch);
  return h('div', { className: 'cu-page cu-embedded' }, h(CustomerList, { apiFetch, currentUser, meta, ui, onOpen: id => openContact(ui, id), fixedPage: pages.join(',') }));
}

function CustomerList({ apiFetch, currentUser, meta, ui, onOpen, fixedPage = '' }) {
  const saved = React.useMemo(() => fixedPage ? {} : readSaved(), [fixedPage]);
  const isAdmin = currentUser?.role === 'admin';
  const [view, setView] = React.useState(VIEWS.some(v => v[0] === saved.view) ? saved.view : 'all');
  const [q, setQ] = React.useState('');
  const [term, setTerm] = React.useState('');
  // Only the view and the sort are remembered; filters start empty, so nobody returns to a
  // filtered list without noticing.
  const [filters, setFilters] = React.useState(NO_FILTERS);
  const [sort, setSort] = React.useState(saved.sort || 'recent');
  const [pageNum, setPageNum] = React.useState(1);
  const [selected, setSelected] = React.useState([]);
  const [noteFor, setNoteFor] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  React.useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPageNum(1); }, 300); return () => clearTimeout(t); }, [q]);
  React.useEffect(() => { if (!fixedPage) writeSaved({ view, sort }); }, [view, sort]);
  React.useEffect(() => setSelected([]), [view, term, filters, sort, pageNum]);
  const params = { q: term, quick: view === 'all' ? '' : view, ...filters, ...(fixedPage ? { page: fixedPage } : {}), sort };
  const list = useLoad(`/admin/contacts?${query({ ...params, pageNum, pageSize: PAGE_SIZE })}`, apiFetch, reloadKey);
  const views = useLoad(`/admin/contacts/views${fixedPage ? `?page=${encodeURIComponent(fixedPage)}` : ''}`, apiFetch, reloadKey);
  const reload = () => setReloadKey(k => k + 1);
  const setFilter = key => value => { setPageNum(1); setFilters(f => ({ ...f, [key]: value })); };
  const rows = list.data?.rows || [];
  const total = list.data?.total || 0;
  const counts = views.data?.views || {};
  const unavailable = /database/i.test(list.error || '');
  const allOnPage = rows.length > 0 && rows.every(r => selected.includes(r.id));
  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  async function bulk(body) {
    setBusy(true);
    try { await apiFetch('/admin/contacts/bulk', { method: 'POST', body: JSON.stringify({ ids: selected, ...body }) }); setSelected([]); reload(); }
    catch { /* shown */ } finally { setBusy(false); }
  }
  async function exportAll() {
    setBusy(true);
    try {
      const data = await apiFetch(`/admin/contacts?${query({ ...params, all: 1, pageSize: 5000 })}`);
      exportRows(data.rows || [], meta);
      if ((data.total || 0) > (data.rows || []).length) notify(`Đã xuất ${fmt(data.rows.length)}/${fmt(data.total)} người. Lọc hẹp hơn để xuất phần còn lại.`);
    } catch { /* shown */ } finally { setBusy(false); }
  }
  const first = total ? (pageNum - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(total, pageNum * PAGE_SIZE);
  const viewItems = VIEWS.filter(([id]) => id !== 'candidates' || isAdmin);
  const clearFilters = () => { setQ(''); setFilters(NO_FILTERS); setPageNum(1); };
  const filtering = [
    term ? `“${term}”` : '',
    filters.page ? `Phễu ${filters.page}` : '',
    filters.owner ? `Sale: ${filters.owner === 'none' ? 'Chưa giao' : (sales(meta).find(u => u.user_id === filters.owner) || {}).full_name || 'đã chọn'}` : '',
    filters.tag ? `Tag: ${(t => t ? tagLabel(t) : 'đã chọn')(meta.tags.find(t => t.id === filters.tag))}` : '',
    filters.source ? `Nguồn ${filters.source}` : '',
  ].filter(Boolean);

  return h(React.Fragment, null,
    fixedPage ? null : h('div', { className: 'cu-title-row' },
      h('div', { className: 'cu-grow' },
        h('h1', null, 'Khách hàng'),
        h('p', null, views.data ? `${fmt(counts.all)} khách hàng · ${fmt(views.data.multi_funnel)} người tham gia từ 2 phễu trở lên` : 'Mỗi người một dòng, gộp mọi lượt đăng ký của họ.')),
      h('button', { type: 'button', className: 'cu-btn cu-btn-secondary', disabled: busy || unavailable, onClick: exportAll }, 'Xuất CSV'),
      h('button', { type: 'button', className: 'cu-btn cu-btn-primary', onClick: () => setAdding(true) }, 'Thêm khách hàng')),
    h('section', { className: 'cu-card cu-list-card', 'aria-label': 'Danh sách khách hàng' },
      h('div', { className: 'cu-views', role: 'tablist', 'aria-label': 'Chế độ xem' },
        viewItems.map(([id, label]) => h('button', { key: id, type: 'button', role: 'tab', 'aria-selected': view === id, className: view === id ? 'cu-view on' : 'cu-view', onClick: () => { setView(id); setPageNum(1); } },
          label, counts[id] != null ? h('span', null, ` ${fmt(counts[id])}`) : null))),
      selected.length ? h('div', { className: 'cu-bar cu-bar-selected' },
        h('strong', null, `Đã chọn ${selected.length}`),
        h(ui.Select, { className: 'cu-filter cu-filter-white', value: '', 'aria-label': 'Giao sale', disabled: busy, onChange: e => e.target.value && bulk({ owner_id: e.target.value === 'none' ? null : e.target.value }) },
          h('option', { value: '' }, 'Giao sale'), ...(isAdmin ? [h('option', { key: 'none', value: 'none' }, 'Bỏ giao')] : []), ...sales(meta).map(u => h('option', { key: u.user_id, value: u.user_id }, u.full_name || u.email))),
        h(ui.Select, { className: 'cu-filter cu-filter-white', value: '', 'aria-label': 'Gắn tag', disabled: busy, onChange: e => e.target.value && bulk({ add_tag_id: e.target.value }) },
          h('option', { value: '' }, 'Gắn tag'), ...meta.tags.filter(t => t.active !== false).map(t => h('option', { key: t.id, value: t.id }, tagLabel(t)))),
        h('button', { type: 'button', className: 'cu-btn cu-btn-secondary cu-btn-sm', onClick: () => exportRows(rows.filter(r => selected.includes(r.id)), meta) }, 'Xuất CSV'),
        h('button', { type: 'button', className: 'cu-btn cu-btn-ghost cu-btn-sm cu-push', onClick: () => setSelected([]) }, 'Bỏ chọn'))
        : h('div', { className: 'cu-bar' },
          h('label', { className: 'cu-search' }, h(Svg, { name: 'search' }),
            h('input', { type: 'search', value: q, onChange: e => setQ(e.target.value), placeholder: 'Tìm theo tên, SĐT hoặc email', 'aria-label': 'Tìm khách hàng' })),
          fixedPage ? null : h(FilterSelect, { ui, label: 'Phễu', value: filters.page, onChange: setFilter('page'), options: (views.data?.funnels || []).map(f => [f.id, `${f.id} · ${fmt(f.count)}`]) }),
          h(FilterSelect, { ui, label: 'Sale', value: filters.owner, onChange: setFilter('owner'), options: [['none', 'Chưa giao'], ...sales(meta).map(u => [u.user_id, u.full_name || u.email])] }),
          h(FilterSelect, { ui, label: 'Tag', value: filters.tag, onChange: setFilter('tag'), options: meta.tags.map(t => [t.id, tagLabel(t)]) }),
          h(FilterSelect, { ui, label: 'Nguồn', value: filters.source, onChange: setFilter('source'), options: (views.data?.sources || []).map(s => [s.id, `${s.id} · ${fmt(s.count)}`]) }),
          h(SortMenu, { value: sort, onChange: value => { setSort(value); setPageNum(1); } })),
      filtering.length && !selected.length ? h('div', { className: 'cu-filtering', role: 'status' },
        h('span', null, h('strong', null, 'Đang lọc: '), filtering.join(' · '), list.data ? ` — ${fmt(total)} người` : ''),
        h('button', { type: 'button', className: 'cu-link', onClick: clearFilters }, 'Xóa bộ lọc')) : null,
      unavailable ? h('div', { className: 'cu-empty' }, 'Danh sách khách hàng cần database. ', h('a', { href: '/admin/view/leads', onClick: e => { if (ui.openModule) { e.preventDefault(); ui.openModule('leads'); } } }, 'Xem theo lượt đăng ký'), '.')
        : list.error ? h('div', { className: 'cu-empty cu-error' }, list.error)
        : list.loading && !list.data ? h('div', { className: 'cu-pad' }, h(Skeleton))
        : h('div', { className: list.loading ? 'cu-loading' : '' },
          h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table' },
            h('thead', null, h('tr', null,
              h('th', { className: 'cu-check-col' }, h('input', { type: 'checkbox', checked: allOnPage, 'aria-label': 'Chọn cả trang', onChange: () => setSelected(allOnPage ? [] : rows.map(r => r.id)) })),
              ['Khách hàng', 'SĐT', 'Phễu', 'Sale', 'Đến từ → Đăng ký nhờ', 'Tương tác'].map(label => h('th', { key: label, scope: 'col' }, label)),
              h('th', null, h('span', { className: 'sr-only' }, 'Thao tác')))),
            h('tbody', null, rows.map(row => h(React.Fragment, { key: row.id },
              h('tr', { className: selected.includes(row.id) ? 'cu-row on' : 'cu-row' },
                h('td', { className: 'cu-check-col' }, h('input', { type: 'checkbox', checked: selected.includes(row.id), 'aria-label': `Chọn ${row.name || row.email || row.phone}`, onChange: () => toggle(row.id) })),
                h('td', null, h('div', { className: 'cu-person' },
                  h('span', { className: 'cu-avatar', style: { background: tint(row.id) } }, initials(row.name)),
                  h('div', { className: 'cu-person-text' },
                    h('a', { href: `?contact=${row.id}`, className: 'cu-name', onClick: e => { e.preventDefault(); onOpen(row.id); } }, row.name || 'Chưa có tên'),
                    h('div', { className: 'cu-sub' }, row.email || 'Chưa có email', row.emails_count > 1 ? h('span', { className: 'cu-more', title: `${row.emails_count} email trong hồ sơ (xem ở mục Định danh)` }, ` +${row.emails_count - 1} email`) : null)),
                  isToday(row.first_registered_at) ? h(Badge, { tone: 'info' }, 'Mới') : null,
                  row.has_candidates ? h(Badge, { tone: 'warning' }, 'Có thể trùng') : null)),
                h('td', { className: 'cu-nowrap' }, h('div', { className: 'cu-phone' },
                  h('span', { className: 'cu-tabular' }, row.phone || '—'),
                  phoneDigits(row.phone) ? h('a', { className: 'cu-icon-btn', href: `tel:${phoneDigits(row.phone)}`, 'aria-label': `Gọi ${row.name || row.phone}` }, h(Svg, { name: 'phone' })) : null,
                  phoneDigits(row.phone) ? h('a', { className: 'cu-icon-btn', href: zaloUrl(row.phone), target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Mở Zalo ${row.name || row.phone}` }, h(Svg, { name: 'chat' })) : null)),
                h('td', null, h('div', { className: 'cu-chips' }, row.funnels.map(f => h('span', { key: f, className: 'cu-pill' }, f)))),
                h('td', { className: row.owner_name ? 'cu-nowrap' : 'cu-nowrap cu-muted' }, row.owner_name || 'Chưa giao'),
                h('td', { className: 'cu-small' }, h('div', null, touchText(row.first_touch)), h('div', { className: 'cu-muted' }, `→ ${touchText(row.last_touch || row.first_touch)}`)),
                h('td', { className: 'cu-nowrap' }, h('div', null, ago(row.last_interaction_at || row.last_registered_at)), h('div', { className: 'cu-sub' }, row.notes_count ? `${row.notes_count} ghi chú` : 'Chưa có ghi chú')),
                h('td', { className: 'cu-right' }, h('button', { type: 'button', className: 'cu-btn cu-btn-plain cu-btn-sm', 'aria-expanded': noteFor === row.id, onClick: () => setNoteFor(noteFor === row.id ? '' : row.id) }, noteFor === row.id ? 'Đóng' : 'Ghi chú'))),
              noteFor === row.id ? h('tr', { className: 'cu-note-row' }, h('td', { colSpan: 8 },
                row.latest_note ? h('div', { className: 'cu-sub cu-last-note' }, `Gần nhất${row.latest_note_author ? ` (${row.latest_note_author})` : ''}: ${row.latest_note}`) : null,
                h(QuickNote, { registrationId: row.latest_registration_id, apiFetch, autoFocus: true, onSaved: () => { setNoteFor(''); reload(); } }))) : null))))),
          !rows.length ? h('div', { className: 'cu-empty' }, 'Không có khách hàng khớp bộ lọc này.') : null,
          h('ul', { className: 'cu-cards', 'aria-label': 'Khách hàng' }, rows.map(row => h('li', { key: row.id },
            h('article', { className: 'cu-mcard' },
              h('div', { className: 'cu-person' },
                h('span', { className: 'cu-avatar cu-avatar-lg', style: { background: tint(row.id) } }, initials(row.name)),
                h('div', { className: 'cu-person-text cu-grow' },
                  h('a', { href: `?contact=${row.id}`, className: 'cu-name cu-name-lg', onClick: e => { e.preventDefault(); onOpen(row.id); } }, row.name || 'Chưa có tên'),
                  h('div', { className: 'cu-sub' }, `${ago(row.last_interaction_at || row.last_registered_at)} · ${row.owner_name || 'Chưa giao'}`)),
                isToday(row.first_registered_at) ? h(Badge, { tone: 'info' }, 'Mới') : null),
              h('div', { className: 'cu-chips' }, row.funnels.map(f => h('span', { key: f, className: 'cu-pill' }, f))),
              h('div', { className: 'cu-mcard-actions' },
                phoneDigits(row.phone) ? h('a', { className: 'cu-big-btn dark', href: `tel:${phoneDigits(row.phone)}` }, h(Svg, { name: 'phone' }), 'Gọi') : h('span', { className: 'cu-big-btn off' }, 'Gọi'),
                phoneDigits(row.phone) ? h('a', { className: 'cu-big-btn', href: zaloUrl(row.phone), target: '_blank', rel: 'noopener noreferrer' }, h(Svg, { name: 'chat' }), 'Zalo') : h('span', { className: 'cu-big-btn off' }, 'Zalo'),
                h('button', { type: 'button', className: 'cu-big-btn', onClick: () => onOpen(row.id) }, 'Ghi chú'))))))),
      h('div', { className: 'cu-footer' },
        h('span', null, total ? `${fmt(first)}–${fmt(last)} trong ${fmt(total)} khách hàng` : '0 khách hàng'),
        h('div', { className: 'cu-row-gap' },
          h('button', { type: 'button', className: 'cu-page-btn', 'aria-label': 'Trang trước', disabled: pageNum <= 1, onClick: () => setPageNum(p => Math.max(1, p - 1)) }, '‹'),
          h('button', { type: 'button', className: 'cu-page-btn', 'aria-label': 'Trang sau', disabled: last >= total, onClick: () => setPageNum(p => p + 1) }, '›')))),
    adding && ui.ManualLeadModal ? h(ui.ManualLeadModal, { apiFetch, onClose: () => setAdding(false), onCreated: () => { setAdding(false); reload(); } }) : null);
}

// ── Customer detail ──────────────────────────────────────────────────────────
const TABS = [['timeline', 'Dòng thời gian'], ['funnels', 'Phễu'], ['learning', 'Học tập'], ['zoom', 'Zoom'], ['orders', 'Đơn hàng'], ['survey', 'Khảo sát'], ['tech', 'Kỹ thuật']];
const MARKS = { note: ['GC', '#e3e3e3', '#303030'], learn: ['H', '#cdfee1', '#0c5132'], form: ['F', '#e0f0ff', '#00527c'], zoom: ['Z', '#ffeb78', '#4f4700'], order: ['Đ', '#fedad9', '#8e0b21'] };
const FILTERS = [['all', 'Tất cả'], ['form', 'Form'], ['zoom', 'Zoom'], ['learn', 'Học'], ['order', 'Đơn hàng'], ['note', 'Ghi chú']];
const NOTE_LABEL = { call: 'gọi điện', message: 'nhắn tin', meeting: 'gặp', email: 'gửi email', note: 'ghi chú' };
const ORDER_LABEL = { pending: ['Chờ thanh toán', 'warning'], won: ['Đã thanh toán', 'success'], lost: ['Hủy', 'neutral'], refunded: ['Hoàn tiền', 'neutral'] };
const LEARN_LABEL = { completed: ['Học xong', 'success'], in_progress: ['Đang học', 'success'], not_started: ['Chưa vào học', 'neutral'] };
const REASON_LABEL = { same_email_other_name: 'cùng email, khác tên', same_phone_other_name: 'cùng SĐT, khác tên', similar_email: 'cùng tên, email gần giống' };
const money = (amount, currency) => `${fmt(amount)}${currency === 'VND' || !currency ? 'đ' : ` ${currency}`}`;

function timelineOf(data) {
  const items = [];
  const sourceOf = f => [f.utm_source, f.utm_medium === '(none)' ? '' : f.utm_medium, f.utm_campaign].filter(Boolean).join(' · ') || 'Không rõ nguồn';
  for (const r of data.registrations) {
    // The registration itself, then the other forms in its history (newest first in the data).
    const regAt = new Date(r.registered_at).getTime();
    const own = (r.forms || []).find(f => Math.abs(new Date(f.submitted_at).getTime() - regAt) < 1000);
    items.push(own?.source === 'wordpress_import'
      ? { type: 'form', open: { lead: r.id }, at: r.registered_at, title: `Đăng ký trên website WordPress cũ${own.page_id && own.page_id !== 'wordpress' ? ` · form ${own.page_id.replace(/^wp:/, '')}` : ''}`, detail: `${sourceOf(own)} · nhập vào phễu ${r.page_id}.` }
      : { type: 'form', open: { lead: r.id }, at: r.registered_at, title: `Đăng ký /${r.page_id}`, detail: touchLabel(r.first_touch || r.last_touch || { source: r.source, medium: r.medium, campaign: r.campaign }) });
    for (const f of r.forms || []) {
      if (f === own) continue;
      const [title, detail] = f.source === 'wordpress_import' ? [`Đăng ký trên website WordPress cũ${f.page_id && f.page_id !== 'wordpress' ? ` · form ${f.page_id.replace(/^wp:/, '')}` : ''}`, `${sourceOf(f)}. Lịch sử nhập từ website cũ.`]
        : f.source === 'contact_link' ? [`Vào /${r.page_id} qua link chăm sóc`, `${sourceOf(f)}. Đã đăng ký từ trước, không tạo lượt mới.`]
        : f.source === 'repeat_other_email' ? [`Đăng ký lại /${r.page_id} bằng email khác`, `${f.email || ''} · không tạo lượt mới, được hướng đăng nhập bằng email đã đăng ký.`]
        : f.source === 'manual_merge' ? [`Gộp từ lượt đăng ký khác /${r.page_id}`, sourceOf(f)]
        : [`Gửi lại form /${r.page_id}`, `${sourceOf(f)}. Không tạo lượt mới, không gửi webhook.`];
      items.push({ type: 'form', at: f.submitted_at, title, detail });
    }
  }
  for (const n of data.notes) items.push({ type: 'note', at: n.created_at, title: `${n.author_name || n.author_email || 'Hệ thống'} ${NOTE_LABEL[n.interaction_type] || 'ghi chú'}`, detail: n.body });
  for (const r of data.zoom_registrations || []) items.push({ type: 'zoom', open: { zoomEvent: r.event_id }, at: r.created_at, title: `Đăng ký Zoom "${r.title}"`, detail: r.has_link ? 'Đã có link Zoom riêng.' : 'Chưa có link Zoom riêng.' });
  // One row per Zoom session: Zoom logs every rejoin (and a second device) as its own piece.
  const sessions = new Map();
  for (const z of data.zoom_attendances) (sessions.get(z.zoom_meeting_uuid) || sessions.set(z.zoom_meeting_uuid, []).get(z.zoom_meeting_uuid)).push(z);
  for (const pieces of sessions.values()) {
    const z = pieces[0];
    const leftAt = a => a.leave_time ? new Date(a.leave_time).getTime() : new Date(a.join_time).getTime() + Number(a.duration || 0) * 1000;
    const start = Math.min(...pieces.map(a => new Date(a.join_time).getTime())), end = Math.max(...pieces.map(leftAt));
    const minutes = Math.min(zoomMinutes(pieces), z.meeting_duration || Infinity);
    // The session's Zoom event, else the lead made from this attendance list.
    const lead = pieces.find(a => a.registration_id)?.registration_id;
    items.push({ type: 'zoom', open: z.event_id && !z.excluded ? { zoomEvent: z.event_id } : lead ? { lead } : null, at: new Date(start).toISOString(), title: `Tham dự Zoom "${z.event_title || z.topic || z.zoom_meeting_id}"`,
      detail: `Ở lại ${minutes}${z.meeting_duration ? `/${z.meeting_duration}` : ''} phút · ${clock(start)}–${clock(end)}${pieces.length > 1 ? ` · vào phòng ${pieces.length} lần` : ''}.` });
  }
  for (const o of data.orders) items.push({ type: 'order', at: o.sold_at || o.created_at, title: `Đơn ${o.page_id || o.funnel_id} ${money(o.amount, o.currency)}`, detail: `${(ORDER_LABEL[o.status] || [o.status])[0]}${o.note ? ` · ${o.note}` : ''}.` });
  for (const c of data.learning || []) {
    for (const l of c.lessons || []) if (l.completed_at) items.push({ type: 'learn', at: l.completed_at, title: `Học ${c.title} · xong bài ${l.position || l.id}/${c.total_lessons}`, detail: `"${l.title}"` });
    if (c.last_activity_at && c.status !== 'completed') items.push({ type: 'learn', at: c.last_activity_at, title: `Học ${c.title} · bài ${c.current_lesson?.title ? `"${c.current_lesson.title}"` : ''}`, detail: c.current_lesson ? `Xem ${Math.round(c.current_lesson.watch_percent)}%.` : '' });
  }
  return items.filter(i => i.at).sort((a, b) => new Date(b.at) - new Date(a.at));
}

// Every email (or phone) of the person; the main one is marked, another can become the main one.
function IdentityRows({ kind, label, main, identities, onPrimary }) {
  const values = identities.filter(i => i.kind === kind).map(i => i.value);
  if (main && !values.includes(main)) values.unshift(main);
  if (values.length <= 1) return h('div', { className: 'cu-kv' }, h('span', null, label), h('span', { className: kind === 'phone' ? 'cu-tabular' : '' }, values[0] || '—'));
  return h('div', { className: 'cu-ident' },
    h('span', { className: 'cu-ident-label' }, `${label} (${values.length})`),
    h('ul', null, values.map(value => h('li', { key: value },
      h('span', { className: kind === 'phone' ? 'cu-tabular cu-ident-value' : 'cu-ident-value' }, value),
      value === main ? h(Badge, { tone: 'info' }, 'Chính') : h('button', { type: 'button', className: 'cu-link cu-link-sm', onClick: () => onPrimary(value) }, 'Đặt làm chính')))));
}

function TagCard({ data, meta, apiFetch, onSaved, onOpen, onReview }) {
  const [editing, setEditing] = React.useState(false);
  const [chosen, setChosen] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  async function submit() {
    setSaving(true);
    try { await apiFetch(`/admin/contacts/${data.contact.id}/tags`, { method: 'PUT', body: JSON.stringify({ tag_ids: chosen }) }); setEditing(false); onSaved(); }
    catch { /* shown */ } finally { setSaving(false); }
  }
  const identities = data.identities.filter(i => i.kind !== 'email' && i.kind !== 'phone');
  return h('section', { className: 'cu-card cu-side-card', 'aria-label': 'Tag và định danh' },
    h('h2', null, 'Tag'),
    editing ? h('div', { className: 'cu-tag-editor' },
      h('div', { className: 'cu-tag-options' }, meta.tags.filter(t => t.active !== false).map(t => h('label', { key: t.id, className: 'cu-check' },
        h('input', { type: 'checkbox', checked: chosen.includes(t.id), onChange: () => setChosen(list => list.includes(t.id) ? list.filter(x => x !== t.id) : [...list, t.id]) }), tagLabel(t)))),
      h('div', { className: 'cu-row-gap' },
        h('button', { type: 'button', className: 'cu-btn cu-btn-ghost cu-btn-sm', onClick: () => setEditing(false) }, 'Hủy'),
        h('button', { type: 'button', className: 'cu-btn cu-btn-plain cu-btn-sm', disabled: saving, onClick: submit }, saving ? 'Đang lưu…' : 'Lưu tag')))
      : h('div', { className: 'cu-chips' },
        data.tags.map(t => h('span', { key: t.id, className: 'cu-pill cu-tag', style: { '--tag': t.color }, title: t.category_name || '' }, t.name)),
        h('button', { type: 'button', className: 'cu-link cu-link-sm', onClick: () => { setChosen(data.tags.map(t => t.id)); setEditing(true); } }, data.tags.length ? 'Sửa tag' : '+ Thêm tag')),
    // Emails and phones are listed in the contact card; other identities (Zalo, HubCRM...) here.
    identities.length ? h('h2', { className: 'cu-gap-top' }, 'Định danh khác') : null,
    identities.length ? h('ul', { className: 'cu-list' }, identities.map(i => h('li', { key: `${i.kind}:${i.value}` }, `${i.kind}: ${i.value}`))) : null,
    data.candidates.map(k => h('button', { key: k.other_id + k.reason, type: 'button', className: 'cu-link cu-link-sm cu-left', onClick: () => (onReview ? onReview(k.other_id) : onOpen(k.other_id)) }, `Có thể trùng với ${k.other_name || 'một hồ sơ'} (${REASON_LABEL[k.reason] || k.reason}) →`)));
}

function CustomerDetail({ id, apiFetch, currentUser, meta, ui, onBack, onOpen }) {
  const [tab, setTab] = React.useState('timeline');
  const [filter, setFilter] = React.useState('all');
  const [leadId, setLeadId] = React.useState('');
  const [splitOpen, setSplitOpen] = React.useState(false);
  const [splitIds, setSplitIds] = React.useState([]);
  const [reloadKey, setReloadKey] = React.useState(0);
  const state = useLoad(`/admin/contacts/${encodeURIComponent(id)}`, apiFetch, reloadKey);
  const reload = () => setReloadKey(k => k + 1);
  const data = state.data && (state.data.contact.id === id || !state.loading) ? state.data : null;
  // An old link to a merged person opens the kept one.
  const keptId = data?.contact?.id;
  React.useEffect(() => { if (keptId && keptId !== id) onOpen(keptId); }, [keptId, id]);
  // After a registration is deleted the person is recomputed, or removed with their last one.
  const leadDeleted = result => {
    setLeadId('');
    if (result.contact_deleted) { notify('Đã xóa lượt đăng ký cuối cùng, khách hàng này không còn trong danh sách.'); onBack(); return; }
    notify('Đã xóa lượt đăng ký');
    reload();
  };
  if (leadId) return h(ui.LeadDrawer, { leadId, apiFetch, meta, currentUser, full: true, onClose: () => { setLeadId(''); reload(); }, onRefresh: reload, onDeleted: leadDeleted });
  if (!data) return h(React.Fragment, null,
    h('div', { className: 'cu-detail-head' }, h('button', { type: 'button', className: 'cu-icon-btn cu-icon-32', onClick: onBack, 'aria-label': 'Quay lại danh sách khách hàng' }, h(Svg, { name: 'back' })), h('h1', null, 'Khách hàng')),
    state.error ? h('div', { className: 'cu-card cu-empty cu-error' }, state.error) : h('div', { className: 'cu-card cu-pad' }, h(Skeleton)));

  const c = data.contact;
  const regs = data.registrations;
  const latestReg = regs[regs.length - 1];
  const latestWpForm = latestReg && (latestReg.forms || []).find(f => f.source === 'wordpress_import' && Math.abs(new Date(f.submitted_at).getTime() - new Date(latestReg.registered_at).getTime()) < 1000);
  const earliest = regs[0];
  const funnels = [...new Set(regs.map(r => r.page_id))];
  const learning = data.learning || [];
  const learnByPage = Object.fromEntries(learning.map(l => [l.course, l]));
  const learnState = learning.some(l => l.status === 'in_progress') ? 'in_progress' : learning.some(l => l.status === 'completed') ? 'completed' : '';
  const events = timelineOf(data);
  const shown = events.filter(e => filter === 'all' || e.type === filter);
  const fieldById = Object.fromEntries(meta.customFields.map(f => [f.id, f]));
  const pageOfReg = Object.fromEntries(regs.map(r => [r.id, r.page_id]));
  const answers = [
    ...Object.entries(data.custom_values).map(([fieldId, v]) => ({ q: fieldById[fieldId]?.label || 'Trường đã xóa', a: Array.isArray(v.value) ? v.value.join(', ') : String(v.value), from: pageOfReg[v.registration_id] || '' })),
    ...data.surveys.flatMap(s => Object.entries(s).filter(([k, v]) => /^q\d/.test(k) && v).map(([k, v]) => ({ q: `Khảo sát ${k.replace(/^q(\d+)_?/, 'câu $1 ').replace(/_/g, ' ').trim()}`, a: v, from: s.page_id }))),
  ];
  // Zoom by event (roadmap 3.6): sign-up, link clicks and attendances together; meetings outside
  // any event stay on their own row.
  const zoomRows = (() => {
    const rows = new Map();
    for (const r of data.zoom_registrations || []) rows.set(r.event_id, { key: r.event_id, eventId: r.event_id, title: r.title, when: r.starts_at, length: r.duration_minutes, reg: r, att: [] });
    for (const a of data.zoom_attendances) {
      const key = a.event_id && !a.excluded ? a.event_id : `m:${a.zoom_meeting_uuid}`;
      if (!rows.has(key)) rows.set(key, { key, eventId: a.event_id && !a.excluded ? a.event_id : null, title: a.event_title || a.topic || `Zoom ${a.zoom_meeting_id}`, when: a.start_time, length: a.meeting_duration, reg: null, att: [] });
      const row = rows.get(key);
      row.att.push(a);
      if (a.meeting_duration && !row.reg) row.length = a.meeting_duration;
    }
    // Several sessions of one event add up; inside a session, overlapping pieces count once.
    const minutesOf = att => [...new Set(att.map(a => a.zoom_meeting_uuid))].reduce((sum, uuid) => sum + zoomMinutes(att.filter(a => a.zoom_meeting_uuid === uuid)), 0);
    return [...rows.values()].map(row => ({ ...row, minutes: Math.min(row.length || Infinity, minutesOf(row.att)) }))
      .sort((x, y) => new Date(y.when || 0) - new Date(x.when || 0));
  })();
  async function openZoomEvent(eventId) {
    await ui.openModule?.('zoom-events');
    history.replaceState(null, '', `/admin/view/zoom-events?event=${encodeURIComponent(eventId)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  const counts = { funnels: regs.length, learning: learning.length, zoom: zoomRows.length, orders: data.orders.length, survey: answers.length };
  const statusOf = r => {
    const order = data.orders.find(o => o.registration_id === r.id);
    if (order?.status === 'won') return ['Đã mua', 'success'];
    if (order?.status === 'pending') return ['Chờ thanh toán', 'warning'];
    if (learnByPage[r.page_id]) return LEARN_LABEL[learnByPage[r.page_id].status] || ['Đã đăng ký', 'info'];
    return ['Đã đăng ký', 'info'];
  };
  async function changeOwner(userId) {
    try { await apiFetch(`/admin/contacts/${c.id}/owner`, { method: 'PUT', body: JSON.stringify({ user_id: userId || null }) }); reload(); }
    catch { /* shown */ }
  }
  // Có thể trùng: open the review page on this pair.
  async function review(otherId) {
    await ui.openModule?.('review');
    history.replaceState(null, '', `/admin/view/review?only=${encodeURIComponent(`${c.id},${otherId}`)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  async function split() {
    try {
      const result = await apiFetch(`/admin/contacts/${c.id}/split`, { method: 'POST', body: JSON.stringify({ registration_ids: splitIds }) });
      setSplitOpen(false); setSplitIds([]);
      window.dispatchEvent(new Event('contacts:candidates'));
      notify(`Đã tách ${splitIds.length} lượt thành một người riêng`);
      if (result.new_contact_id) onOpen(result.new_contact_id); else reload();
    } catch { /* shown */ }
  }
  async function setPrimary(kind, value) {
    try { await apiFetch(`/admin/contacts/${c.id}/primary`, { method: 'PUT', body: JSON.stringify({ kind, value }) }); reload(); }
    catch { /* shown */ }
  }
  async function copyLink(url) {
    try { await navigator.clipboard.writeText(url); notify('Đã chép link vào học'); }
    catch { notify(url); }
  }
  const tech = latestReg || {};

  return h(React.Fragment, null,
    h('div', { className: 'cu-detail-head' },
      h('button', { type: 'button', className: 'cu-icon-btn cu-icon-32', onClick: onBack, 'aria-label': 'Quay lại danh sách khách hàng' }, h(Svg, { name: 'back' })),
      h('h1', null, c.display_name || 'Chưa có tên'),
      h(Badge, { tone: 'info' }, `${funnels.length} phễu`),
      learnState ? h(Badge, { tone: 'success' }, LEARN_LABEL[learnState][0]) : null,
      h('span', { className: 'cu-grow' }),
      currentUser?.role === 'admin' ? h('button', { type: 'button', className: 'cu-btn cu-btn-ghost', 'aria-expanded': splitOpen, onClick: () => setSplitOpen(v => !v) }, 'Gộp / tách…') : null,
      zaloUrl(c.primary_phone) ? h('a', { className: 'cu-btn cu-btn-secondary', href: zaloUrl(c.primary_phone), target: '_blank', rel: 'noopener noreferrer' }, 'Mở Zalo') : null,
      phoneDigits(c.primary_phone) ? h('a', { className: 'cu-btn cu-btn-primary', href: `tel:${phoneDigits(c.primary_phone)}` }, `Gọi ${c.primary_phone}`) : null),
    splitOpen ? h('section', { className: 'cu-card cu-pad cu-stack-12', 'aria-label': 'Gộp hoặc tách hồ sơ' },
      h('h2', null, 'Tách lượt đăng ký thành người khác'),
      regs.length < 2 ? h('p', { className: 'cu-muted' }, 'Hồ sơ chỉ có một lượt đăng ký, không có gì để tách.') : h(React.Fragment, null,
        h('p', { className: 'cu-muted' }, 'Chọn các lượt không phải của người này. Chúng thành một hồ sơ riêng và sẽ không được gộp lại tự động. Muốn gộp với người khác thì dùng mục "Có thể trùng" ở cột phải hoặc trang Có thể trùng.'),
        h('div', { className: 'rv-split' }, regs.map(r => h('label', { key: r.id },
          h('input', { type: 'checkbox', checked: splitIds.includes(r.id), onChange: () => setSplitIds(list => list.includes(r.id) ? list.filter(x => x !== r.id) : [...list, r.id]) }),
          h('span', null, h('strong', null, `${r.page_id} · ${date(r.registered_at)}`), h('div', { className: 'cu-sub' }, [r.name, r.email, r.phone].filter(Boolean).join(' · ')))))),
        h('div', { className: 'cu-row-gap' },
          h('button', { type: 'button', className: 'cu-btn cu-btn-primary', disabled: !splitIds.length || splitIds.length >= regs.length, onClick: split }, splitIds.length ? `Tách ${splitIds.length} lượt` : 'Tách'),
          h('button', { type: 'button', className: 'cu-btn cu-btn-ghost', onClick: () => { setSplitOpen(false); setSplitIds([]); } }, 'Đóng')))) : null,
    h('div', { className: 'cu-detail-grid' },
      h('div', { className: 'cu-detail-main' },
        h('section', { className: 'cu-card cu-note-card', 'aria-label': 'Ghi chú nhanh' }, h(QuickNote, { registrationId: latestReg?.id, apiFetch, onSaved: () => { setTab('timeline'); reload(); } })),
        h('section', { className: 'cu-card' },
          h('div', { className: 'cu-tabs', role: 'tablist', 'aria-label': 'Thông tin khách hàng' },
            TABS.map(([key, label]) => h('button', { key, type: 'button', role: 'tab', 'aria-selected': tab === key, className: tab === key ? 'cu-tab on' : 'cu-tab', onClick: () => setTab(key) },
              label, counts[key] ? h('span', null, counts[key]) : null))),
          tab === 'timeline' ? h('div', { className: 'cu-tab-body' },
            h('div', { className: 'cu-chips' }, FILTERS.map(([key, label]) => h('button', { key, type: 'button', className: filter === key ? 'cu-chip on' : 'cu-chip', 'aria-pressed': filter === key, onClick: () => setFilter(key) }, label))),
            shown.length ? h('ol', { className: 'cu-timeline' }, shown.map((e, i) => h('li', { key: i },
              h('span', { className: 'cu-mark', style: { background: MARKS[e.type][1], color: MARKS[e.type][2] }, 'aria-hidden': true }, MARKS[e.type][0]),
              h('div', { className: 'cu-grow cu-min0' },
                h('div', { className: 'cu-tl-head' }, h('strong', null, e.title), h('span', { className: 'cu-sub' }, date(e.at))),
                e.detail ? h('div', { className: 'cu-muted cu-wrap' }, e.detail) : null),
              // A registration opens in Lượt đăng ký (edit, delete); Zoom rows open their event.
              e.open ? h('button', { type: 'button', className: 'cu-btn cu-btn-secondary cu-btn-sm cu-tl-open', 'aria-label': `Xem chi tiết: ${e.title}`, onClick: () => e.open.lead ? setLeadId(e.open.lead) : openZoomEvent(e.open.zoomEvent) }, 'Xem chi tiết') : null)))
              : h('p', { className: 'cu-muted' }, 'Chưa có hoạt động.')) : null,
          tab === 'funnels' ? h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table' },
            h('thead', null, h('tr', null, ['Phễu', 'Đăng ký', 'Nguồn lượt này', 'Sale', 'Trạng thái'].map(l => h('th', { key: l, scope: 'col' }, l)), h('th', null, h('span', { className: 'sr-only' }, 'Mở')))),
            h('tbody', null, [...regs].reverse().map(r => {
              const [status, tone] = statusOf(r);
              return h('tr', { key: r.id, className: 'cu-row' },
                h('td', null, h('strong', null, r.page_id), h('div', { className: 'cu-sub' }, `Tên: ${r.name || '—'}${r.email ? ` · ${r.email}` : ''}`)),
                h('td', { className: 'cu-nowrap cu-tabular' }, date(r.registered_at), r.forms?.length > 1 ? h('div', { className: 'cu-sub' }, `Gửi lại ${r.forms.length - 1} lần`) : null),
                h('td', null, touchLabel(r.last_touch || { source: r.source, medium: r.medium, campaign: r.campaign })),
                h('td', null, r.assigned_name || h('span', { className: 'cu-muted' }, 'Chưa giao')),
                h('td', null, h(Badge, { tone }, status)),
                h('td', { className: 'cu-right' }, h('button', { type: 'button', className: 'cu-btn cu-btn-ghost cu-btn-sm', onClick: () => setLeadId(r.id) }, 'Mở lượt')));
            })))) : null,
          tab === 'learning' ? (learning.length ? h('div', { className: 'cu-tab-body cu-stack-16' }, learning.map(l => {
            const current = l.next_lesson?.id || l.current_lesson?.id;
            return h('div', { key: l.course, className: 'cu-course' },
              h('div', { className: 'cu-course-head' },
                h('strong', { className: 'cu-grow' }, l.title),
                h('span', { className: 'cu-muted' }, `${l.completed_lessons}/${l.total_lessons} bài · ${l.last_activity_at ? (l.days_since_last_activity ? `${l.days_since_last_activity} ngày chưa quay lại` : 'học hôm nay') : 'chưa vào học'}`),
                h('button', { type: 'button', className: 'cu-btn cu-btn-ghost cu-btn-sm cu-link-color', onClick: () => copyLink(l.resume_url) }, 'Gửi link vào học')),
              h('div', { className: 'cu-cells', role: 'img', 'aria-label': `Tiến độ ${l.title}: ${l.completed_lessons}/${l.total_lessons} bài` },
                (l.lessons || []).map(lesson => h('span', { key: lesson.id, title: `${lesson.title} · ${Math.round(lesson.watch_percent)}%`, className: lesson.completed ? 'done' : lesson.id === current ? 'now' : '' }))));
          }), h('div', { className: 'cu-legend' }, h('span', { className: 'done' }, 'xong'), h('span', { className: 'now' }, 'đang xem'), h('span', null, 'chưa xem')))
            : h('p', { className: 'cu-tab-body cu-muted' }, 'Chưa đăng ký chương trình video nào.')) : null,
          tab === 'zoom' ? (zoomRows.length ? h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table' },
            h('thead', null, h('tr', null, ['Sự kiện', 'Đăng ký', 'Bấm link', 'Tham dự', 'Thời gian ở lại'].map(l => h('th', { key: l, scope: 'col', className: l === 'Thời gian ở lại' ? 'cu-right' : '' }, l)))),
            h('tbody', null, zoomRows.map(z => h('tr', { key: z.key, className: 'cu-row' },
              h('td', null, z.eventId ? h('button', { type: 'button', className: 'cu-link fu-person', onClick: () => openZoomEvent(z.eventId) }, z.title) : h('strong', null, z.title), h('div', { className: 'cu-sub' }, z.when ? date(z.when) : '')),
              h('td', null, z.reg ? `/zoom · ${date(z.reg.created_at, false)}` : h('span', { className: 'cu-muted' }, z.eventId ? 'Không đăng ký' : 'Buổi chưa thuộc sự kiện')),
              h('td', { className: 'cu-nowrap' }, z.reg ? (z.reg.first_click ? date(z.reg.first_click) : 'Chưa bấm') : '—'),
              h('td', null, z.att.length ? h(Badge, { tone: 'success' }, 'Tham dự') : h(Badge, { tone: 'neutral' }, 'Vắng')),
              h('td', { className: 'cu-right cu-tabular' }, z.att.length ? `${z.minutes}${z.length ? `/${z.length}` : ''} phút` : '—')))))) : h('p', { className: 'cu-tab-body cu-muted' }, 'Chưa đăng ký hay tham dự Zoom nào.')) : null,
          tab === 'orders' ? (data.orders.length ? h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table' },
            h('thead', null, h('tr', null, ['Đơn', 'Phễu', 'Số tiền', 'Thanh toán', 'Ngày'].map(l => h('th', { key: l, scope: 'col', className: l === 'Số tiền' ? 'cu-right' : '' }, l)))),
            h('tbody', null, data.orders.map(o => h('tr', { key: o.id, className: 'cu-row' },
              h('td', { className: 'cu-tabular' }, String(o.id).slice(0, 8).toUpperCase()),
              h('td', null, o.page_id || o.funnel_id || '—'),
              h('td', { className: 'cu-right cu-tabular' }, money(o.amount, o.currency)),
              h('td', null, h(Badge, { tone: (ORDER_LABEL[o.status] || [])[1] || 'neutral' }, (ORDER_LABEL[o.status] || [o.status])[0])),
              h('td', { className: 'cu-nowrap' }, date(o.sold_at || o.created_at, false))))))) : h('p', { className: 'cu-tab-body cu-muted' }, 'Chưa có đơn hàng.')) : null,
          tab === 'survey' ? (answers.length ? h('dl', { className: 'cu-dl' }, answers.map((a, i) => h(React.Fragment, { key: i },
            h('dt', null, a.q), h('dd', null, a.a, a.from ? h('span', { className: 'cu-from' }, a.from) : null)))) : h('p', { className: 'cu-tab-body cu-muted' }, 'Chưa có câu trả lời khảo sát hay trường tùy chỉnh.')) : null,
          tab === 'tech' ? h('div', { className: 'cu-tab-body cu-stack-12' },
            h('div', { className: 'cu-chips' },
              h(Badge, { tone: tech.has_fbp ? 'success' : 'warning' }, tech.has_fbp ? 'fbp có' : 'fbp thiếu'),
              h(Badge, { tone: tech.has_fbc ? 'success' : 'warning' }, tech.has_fbc ? 'fbc có' : 'fbc thiếu'),
              h(Badge, { tone: tech.has_gclid ? 'success' : 'neutral' }, tech.has_gclid ? 'gclid có' : 'gclid không có')),
            h('table', { className: 'cu-table cu-table-plain' },
              h('thead', null, h('tr', null, ['Lượt đăng ký', 'Nguồn', 'Thiết bị'].map(l => h('th', { key: l, scope: 'col' }, l)))),
              h('tbody', null, [...regs].reverse().map(r => h('tr', { key: r.id },
                h('td', null, `${date(r.registered_at)} · ${r.page_id}`),
                h('td', null, [r.source, r.medium].filter(Boolean).join(' · '), r.has_fbc ? ' · fbc' : '', r.has_gclid ? ' · gclid' : ''),
                h('td', { className: 'cu-muted' }, [r.device_type, r.os, r.browser, r.city].filter(Boolean).join(' · ') || '—'))))),
            data.merges.length ? h('div', null, h('strong', null, 'Lịch sử gộp / tách'), h('ul', { className: 'cu-list' }, data.merges.map((m, i) => h('li', { key: i }, `${date(m.created_at)} · ${m.action === 'split' ? 'Tách' : 'Gộp'} · ${m.reason}${m.by_email ? ` · ${m.by_email}` : ''}`)))) : null,
            h('span', { className: 'cu-sub' }, `Mã khách hàng ${c.id}`)) : null)),
      h('aside', { className: 'cu-detail-side' },
        h('section', { className: 'cu-card cu-side-card', 'aria-label': 'Liên hệ' },
          h('div', { className: 'cu-side-head' }, h('h2', null, 'Liên hệ'), latestReg ? h('button', { type: 'button', className: 'cu-btn cu-btn-ghost cu-btn-sm cu-link-color', onClick: () => setLeadId(latestReg.id) }, 'Sửa') : null),
          h(IdentityRows, { kind: 'phone', label: 'SĐT', main: c.primary_phone, identities: data.identities, onPrimary: value => setPrimary('phone', value) }),
          h(IdentityRows, { kind: 'email', label: 'Email', main: c.primary_email, identities: data.identities, onPrimary: value => setPrimary('email', value) }),
          h('div', { className: 'cu-kv' }, h('span', null, 'Khu vực'), h('span', null, latestReg?.region || '—')),
          h('label', { className: 'cu-field-label', htmlFor: 'cu-owner' }, 'Sale phụ trách'),
          h(ui.Select, { className: 'ui-input cu-owner', value: c.owner_id || '', 'aria-label': 'Sale phụ trách', onChange: e => changeOwner(e.target.value) },
            h('option', { value: '', disabled: currentUser?.role !== 'admin' }, 'Chưa giao'), sales(meta).map(u => h('option', { key: u.user_id, value: u.user_id }, u.full_name || u.email))),
          earliest ? h('span', { className: 'cu-sub' }, `Theo lượt đăng ký sớm nhất (${earliest.page_id}, ${date(earliest.registered_at, false)}).`) : null),
        h('section', { className: 'cu-card cu-side-card', 'aria-label': 'Nguồn khách' },
          h('h2', null, 'Nguồn khách'),
          h('div', null, h('div', { className: 'cu-sub' }, `Biết đến lần đầu · ${date(c.first_touch?.at || c.first_registered_at, false)}`), h('div', { className: 'cu-strong' }, touchLabel(c.first_touch || { source: '' })), touchPlace(c.first_touch) ? h('div', { className: 'cu-sub' }, touchPlace(c.first_touch)) : null),
          // The latest registration's own source; its date is the registration, not the visit.
          latestReg ? h('div', null, h('div', { className: 'cu-sub' }, `Đăng ký gần nhất · ${date(latestReg.registered_at, false)} · /${latestReg.page_id}`),
            h('div', { className: 'cu-strong' }, touchLabel(latestReg.last_touch || { source: latestReg.source, medium: latestReg.medium, campaign: latestReg.campaign,
              // A lead synced from a form of the old website (WordPress /trading) registered there.
              ...(latestWpForm ? { site: 'wordpress', page_id: latestWpForm.page_id } : {}) })),
            latestReg.last_touch?.landing_path ? h('div', { className: 'cu-sub' }, `vào ${latestReg.last_touch.landing_path}${latestReg.last_touch.at ? ` · ${date(latestReg.last_touch.at, false)}` : ''}`) : null) : null),
        h(TagCard, { data, meta, apiFetch, onSaved: reload, onOpen, onReview: currentUser?.role === 'admin' ? review : null }))));
}
