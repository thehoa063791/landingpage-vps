import React from 'react';
import { Skeleton, notify, confirmAction, EmptyState } from './ui.js';
import './redirects.css';

// Growth > Redirect: short links and old WordPress URLs (src/redirects.js). Paths are
// matched without case, trailing slash or query string; a system page always wins.
const h = React.createElement;
const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const fmt = n => new Intl.NumberFormat('vi-VN').format(Number(n || 0));
const QUERY_LABELS = { pass: 'Giữ tham số', ignore: 'Bỏ tham số' };
const PAGE_SIZE = 50;

function RedirectForm({ initial, groups, codes, onCancel, onSave, ui }) {
  const { Button, Input, Field } = ui;
  const [form, setForm] = React.useState(() => ({
    source: initial?.source || '/', target: initial?.target || '', code: String(initial?.code || 301),
    query_mode: initial?.query_mode || 'pass', group_name: initial?.group_name || '', title: initial?.title || '',
    note: initial?.note || '', enabled: initial ? initial.enabled : true,
  }));
  const [saving, setSaving] = React.useState(false);
  const set = field => event => setForm(f => ({ ...f, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try { await onSave({ ...form, code: Number(form.code) }); }
    catch { /* apiFetch already showed the error */ }
    finally { setSaving(false); }
  }
  return h('form', { className: 'rd-form', onSubmit: submit },
    h('h4', null, initial ? `Sửa redirect ${initial.source}` : 'Thêm redirect'),
    h('div', { className: 'rd-form-grid' },
      h(Field, { label: 'Đường dẫn nguồn' }, h(Input, { value: form.source, onChange: set('source'), placeholder: '/zalo', required: true, maxLength: 500 })),
      h(Field, { label: 'Chuyển đến' }, h(Input, { value: form.target, onChange: set('target'), placeholder: 'https://zalo.me/g/... hoặc /trang-khac', required: true, maxLength: 2000 })),
      h(Field, { label: 'Mã chuyển hướng' }, h('select', { className: 'ui-input', value: form.code, onChange: set('code') },
        codes.map(code => h('option', { key: code, value: code }, code === 301 ? '301 · cố định' : code === 302 ? '302 · tạm thời' : String(code))))),
      h(Field, { label: 'Tham số trên link (?utm_...)' }, h('select', { className: 'ui-input', value: form.query_mode, onChange: set('query_mode') },
        h('option', { value: 'pass' }, 'Giữ và chuyển sang đích'), h('option', { value: 'ignore' }, 'Bỏ qua'))),
      h(Field, { label: 'Nhóm' }, h(Input, { value: form.group_name, onChange: set('group_name'), list: 'rd-groups', maxLength: 500 })),
      h(Field, { label: 'Tiêu đề (không bắt buộc)' }, h(Input, { value: form.title, onChange: set('title'), maxLength: 500 }))),
    h('datalist', { id: 'rd-groups' }, groups.map(g => h('option', { key: g, value: g }))),
    h(Field, { label: 'Ghi chú' }, h(Input, { value: form.note, onChange: set('note'), maxLength: 500 })),
    h('label', { className: 'rd-check' }, h('input', { type: 'checkbox', checked: form.enabled, onChange: set('enabled') }), h('span', null, 'Đang bật')),
    h('div', { className: 'rd-actions' },
      h(Button, { type: 'submit', disabled: saving }, saving ? 'Đang lưu...' : initial ? 'Lưu thay đổi' : 'Thêm redirect'),
      h(Button, { type: 'button', variant: 'outline', onClick: onCancel, disabled: saving }, 'Hủy')));
}

export default function RedirectsPage({ apiFetch, ui }) {
  const { Card, Badge, Button, Input } = ui;
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [revision, setRevision] = React.useState(0);
  const [editing, setEditing] = React.useState(null); // { redirect } to edit, {} to add
  const [search, setSearch] = React.useState('');
  const [group, setGroup] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [sort, setSort] = React.useState('hits');
  const [page, setPage] = React.useState(1);
  React.useEffect(() => {
    let cancelled = false;
    apiFetch('/admin/redirects').then(value => { if (!cancelled) setData(value); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [apiFetch, revision]);
  React.useEffect(() => setPage(1), [search, group, status, sort]);
  const reload = () => setRevision(r => r + 1);
  const send = (path, method, body) => apiFetch(`/admin/redirects${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });

  const all = data?.redirects || [];
  const groups = React.useMemo(() => [...new Set(all.map(r => r.group_name).filter(Boolean))].sort(), [all]);
  // The rule that answers each path: the first enabled one (as the server picks it).
  const winners = React.useMemo(() => { const seen = new Map(); for (const r of all) if (r.enabled && !seen.has(r.source_key)) seen.set(r.source_key, r.id); return seen; }, [all]);
  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = all.filter(r => (!group || r.group_name === group)
      && (!status || (status === 'on' ? r.enabled : status === 'off' ? !r.enabled : status === 'note' ? !!r.note : status === 'shadowed' ? r.enabled && winners.get(r.source_key) !== r.id : true))
      && (!q || [r.source, r.target, r.title, r.note].some(v => String(v || '').toLowerCase().includes(q))));
    const by = { hits: (a, b) => b.hits - a.hits, recent: (a, b) => String(b.last_access_at || '').localeCompare(String(a.last_access_at || '')), source: (a, b) => a.source.localeCompare(b.source) };
    return rows.sort(by[sort]);
  }, [all, search, group, status, sort, winners]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const visible = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function save(values) {
    if (editing.redirect) await send(`/${editing.redirect.id}`, 'PUT', values);
    else await send('', 'POST', values);
    notify(editing.redirect ? 'Đã lưu redirect.' : 'Đã thêm redirect.');
    setEditing(null);
    reload();
  }
  async function toggle(r) {
    try { await send(`/${r.id}`, 'PUT', { enabled: !r.enabled }); notify(r.enabled ? `Đã tắt ${r.source}.` : `Đã bật ${r.source}.`); reload(); } catch {}
  }
  async function remove(r) {
    if (!await confirmAction(`Xóa redirect ${r.source} → ${r.target}? Link này sẽ báo không tìm thấy trang. Muốn giữ lại để dùng sau thì bấm Tắt thay vì Xóa.`)) return;
    try { await send(`/${r.id}`, 'DELETE'); notify(`Đã xóa ${r.source}.`); reload(); } catch {}
  }

  if (error) return h('p', { className: 'rd-warn' }, error);
  if (!data) return h(Skeleton);
  const on = all.filter(r => r.enabled).length, noted = all.filter(r => r.note).length;
  return h('div', { className: 'rd-page' },
    h(Card, { className: 'rd-card' },
      h('div', { className: 'rd-head' },
        h('div', null,
          h('h3', null, 'Redirect'),
          h('p', { className: 'rd-muted' }, `${fmt(all.length)} redirect · ${fmt(on)} đang bật · ${fmt(all.reduce((s, r) => s + r.hits, 0))} lượt hit. Đường dẫn không phân biệt hoa thường và dấu "/" ở cuối. Nếu một trang của hệ thống có cùng đường dẫn thì trang đó được ưu tiên.`)),
        editing ? null : h(Button, { type: 'button', onClick: () => setEditing({}) }, 'Thêm redirect')),
      editing ? h(RedirectForm, { key: editing.redirect?.id || 'new', initial: editing.redirect, groups, codes: data.codes, onCancel: () => setEditing(null), onSave: save, ui }) : null,
      noted ? h('p', { className: 'rd-notice' }, `${fmt(noted)} redirect có ghi chú khi nhập từ WordPress (đổi đường dẫn vì trùng trang hệ thống, tắt hoặc đổi đích). `,
        h('button', { type: 'button', className: 'rd-link', onClick: () => setStatus('note') }, 'Xem danh sách')) : null,
      h('div', { className: 'rd-toolbar' },
        h(Input, { value: search, onChange: e => setSearch(e.target.value), placeholder: 'Tìm đường dẫn, đích, ghi chú...', className: 'rd-search' }),
        h('select', { className: 'ui-input', value: group, onChange: e => setGroup(e.target.value), 'aria-label': 'Nhóm' }, h('option', { value: '' }, 'Tất cả nhóm'), groups.map(g => h('option', { key: g, value: g }, g))),
        h('select', { className: 'ui-input', value: status, onChange: e => setStatus(e.target.value), 'aria-label': 'Trạng thái' },
          h('option', { value: '' }, 'Mọi trạng thái'), h('option', { value: 'on' }, 'Đang bật'), h('option', { value: 'off' }, 'Đang tắt'),
          h('option', { value: 'note' }, 'Có ghi chú'), h('option', { value: 'shadowed' }, 'Trùng đường dẫn, không có tác dụng')),
        h('select', { className: 'ui-input', value: sort, onChange: e => setSort(e.target.value), 'aria-label': 'Sắp xếp' },
          h('option', { value: 'hits' }, 'Nhiều lượt hit nhất'), h('option', { value: 'recent' }, 'Truy cập gần nhất'), h('option', { value: 'source' }, 'Đường dẫn A–Z'))),
      visible.length ? h('div', { className: 'table-shell' }, h('table', { className: 'react-table rd-table' },
        h('thead', null, h('tr', null, ['Đường dẫn', 'Chuyển đến', 'Lượt hit', 'Truy cập gần nhất', 'Trạng thái', ''].map((label, i) => h('th', { key: i }, label)))),
        h('tbody', null, visible.map(r => {
          const shadowed = r.enabled && winners.get(r.source_key) !== r.id;
          return h('tr', { key: r.id, className: r.enabled ? '' : 'rd-off' },
            h('td', null,
              h('a', { href: r.source, target: '_blank', rel: 'noopener noreferrer', className: 'rd-source' }, r.source),
              h('div', { className: 'rd-sub' }, [r.code, QUERY_LABELS[r.query_mode], r.group_name, r.title].filter(Boolean).join(' · ')),
              r.note ? h('div', { className: 'rd-note' }, r.note) : null),
            h('td', { className: 'rd-target' }, r.target),
            h('td', null, fmt(r.hits)),
            h('td', null, date(r.last_access_at)),
            h('td', null, shadowed ? h(Badge, { tone: 'warning' }, 'Trùng, không tác dụng') : r.enabled ? h(Badge, { tone: 'success' }, 'Đang bật') : h(Badge, { tone: 'neutral' }, 'Đang tắt')),
            h('td', null, h('div', { className: 'rd-row-actions' },
              h(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: () => { setEditing({ redirect: r }); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Sửa'),
              h(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: () => toggle(r) }, r.enabled ? 'Tắt' : 'Bật'),
              h(Button, { type: 'button', size: 'sm', variant: 'critical', onClick: () => remove(r) }, 'Xóa'))));
        })))) : h(EmptyState, { title: all.length ? 'Không có redirect phù hợp' : 'Chưa có redirect', onClear: all.length ? () => { setSearch(''); setGroup(''); setStatus(''); } : undefined }),
      pages > 1 ? h('div', { className: 'rd-pager' },
        h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: page <= 1, onClick: () => setPage(p => p - 1) }, 'Trước'),
        h('span', null, `Trang ${page}/${pages} · ${fmt(shown.length)} redirect`),
        h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: page >= pages, onClick: () => setPage(p => p + 1) }, 'Sau')) : null));
}
