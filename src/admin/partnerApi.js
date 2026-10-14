import React from 'react';
import { Skeleton, notify, confirmAction } from './ui.js';
import './partnerApi.css';

// Settings > API đối tác: the issued keys and the partner documentation, rendered from
// docs/PARTNER_API.md so the admin and the partner read the same text.
const h = React.createElement;
const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const slug = text => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Inline markdown: `code`, **bold**, [label](url). Text is never parsed as HTML.
function inline(text) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).filter(Boolean).map((part, i) => {
    if (/^`[^`]+`$/.test(part)) return h('code', { key: i }, part.slice(1, -1));
    if (/^\*\*[^*]+\*\*$/.test(part)) return h('strong', { key: i }, inline(part.slice(2, -2)));
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link && /^(https:\/\/|\/|#)/.test(link[2])) return h('a', { key: i, href: link[2], ...(link[2].startsWith('https://') ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, link[1]);
    return part;
  });
}

function CodeBlock({ code, language }) {
  async function copy() {
    try { await navigator.clipboard.writeText(code); notify('Đã sao chép.'); }
    catch { notify('Trình duyệt không cho sao chép.', true); }
  }
  return h('div', { className: 'pa-code' },
    h('div', { className: 'pa-code-bar' }, h('span', null, language || 'text'), h('button', { type: 'button', onClick: copy }, 'Sao chép')),
    h('pre', null, h('code', null, code)));
}

// Block markdown used by the docs: headings, paragraphs, fenced code, tables and
// (one level nested) lists.
function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r/g, '').split('\n'), out = [];
  const special = line => /^(```|#{1,4}\s|\|)/.test(line) || /^\s*(-|\d+\.)\s/.test(line);
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim(), code = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      i++;
      out.push(h(CodeBlock, { key: out.length, code: code.join('\n'), language }));
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length, text = heading[2];
      out.push(h(`h${Math.min(level + 1, 5)}`, { key: out.length, id: level === 2 ? `pa-${slug(text)}` : undefined, className: `pa-h${level}` }, inline(text)));
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) if (!/^\|[\s:|-]+\|$/.test(lines[i].trim())) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
      const [head, ...body] = rows;
      out.push(h('div', { key: out.length, className: 'pa-table' }, h('table', null,
        h('thead', null, h('tr', null, head.map((cell, c) => h('th', { key: c }, inline(cell))))),
        h('tbody', null, body.map((row, r) => h('tr', { key: r }, row.map((cell, c) => h('td', { key: c }, inline(cell)))))))));
      continue;
    }
    if (/^\s*(-|\d+\.)\s/.test(line)) {
      const ordered = /^\d+\./.test(line.trim()), items = [];
      for (; i < lines.length && /^\s*(-|\d+\.)\s/.test(lines[i]); i++) {
        const text = lines[i].replace(/^\s*(-|\d+\.)\s+/, '');
        if (/^\s{2,}/.test(lines[i]) && items.length) items.at(-1).children.push(text); else items.push({ text, children: [] });
      }
      out.push(h(ordered ? 'ol' : 'ul', { key: out.length }, items.map((item, n) => h('li', { key: n }, inline(item.text),
        item.children.length ? h('ul', null, item.children.map((child, c) => h('li', { key: c }, inline(child)))) : null))));
      continue;
    }
    const paragraph = [];
    for (; i < lines.length && lines[i].trim() && !special(lines[i]); i++) paragraph.push(lines[i].trim());
    out.push(h('p', { key: out.length }, inline(paragraph.join(' '))));
  }
  return out;
}

const SITE = 'https://event.phamthanhbien.com';
const sampleCurl = key => [
  `curl -X POST ${SITE}/api/partner/v1/contacts/lookup \\`,
  `  -H "Authorization: Bearer ${key}" \\`,
  '  -H "Content-Type: application/json" \\',
  `  -d '{"phone":"0912345678"}'`,
].join('\n');
async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); notify(`Đã sao chép ${label}.`); }
  catch { notify('Trình duyệt không cho sao chép. Hãy bôi đen và sao chép thủ công.', true); }
}

// Shown once after creating or rotating: the key is not stored and cannot be shown again.
function RevealKey({ revealed, onClose, ui }) {
  const { Button } = ui;
  return h('div', { className: 'pa-reveal', role: 'alert' },
    h('strong', null, `Khóa mới cho "${revealed.name}"`),
    h('p', null, 'Khóa chỉ hiện MỘT LẦN. Hãy sao chép và lưu ở nơi an toàn ngay, rồi gửi riêng cho người cấu hình bên đối tác. Đóng hộp này là không xem lại được.'),
    h('code', { className: 'pa-reveal-key' }, revealed.key),
    h('div', { className: 'pa-actions' },
      h(Button, { type: 'button', onClick: () => copyText(revealed.key, 'khóa') }, 'Sao chép khóa'),
      h(Button, { type: 'button', variant: 'outline', onClick: () => copyText(sampleCurl(revealed.key), 'cURL') }, 'Sao chép cURL kèm khóa'),
      h(Button, { type: 'button', variant: 'outline', onClick: async () => { if (await confirmAction('Bạn đã lưu khóa này chưa? Đóng lại là không xem lại được.', false)) onClose(); } }, 'Đã lưu, đóng')));
}

function KeyForm({ initial, options, onCancel, onSave, ui }) {
  const { Button, Input, Field } = ui;
  const [form, setForm] = React.useState(() => ({
    name: initial?.name || '',
    scopes: initial?.scopes || ['contact:basic', 'learning:read'],
    allCourses: !initial?.courses?.length,
    courses: initial?.courses || [],
    rate: String(initial?.rate_limit_per_minute || 60),
    ips: (initial?.ip_allowlist || []).join(', '),
  }));
  const [saving, setSaving] = React.useState(false);
  const toggle = (field, value) => setForm(f => ({ ...f, [field]: f[field].includes(value) ? f[field].filter(v => v !== value) : [...f[field], value] }));
  async function submit(event) {
    event.preventDefault();
    if (!form.allCourses && !form.courses.length) return notify('Chọn ít nhất một khóa học, hoặc chọn tất cả.', true);
    setSaving(true);
    try { await onSave({ name: form.name, scopes: form.scopes, courses: form.allCourses ? [] : form.courses, rate_limit_per_minute: form.rate, ip_allowlist: form.ips }); }
    catch { /* apiFetch already showed the error */ }
    finally { setSaving(false); }
  }
  return h('form', { className: 'pa-form', onSubmit: submit },
    h('h4', null, initial ? `Sửa khóa "${initial.name}"` : 'Tạo khóa mới'),
    initial ? h('p', { className: 'pa-muted' }, 'Sửa quyền và giới hạn không đổi chuỗi khóa: đối tác không phải cập nhật gì. Thay đổi có hiệu lực ngay.') : null,
    h(Field, { label: 'Tên đối tác' }, h(Input, { value: form.name, onChange: e => setForm(f => ({ ...f, name: e.target.value })), placeholder: 'Ví dụ: AI CSKH', required: true, maxLength: 200 })),
    h('fieldset', { className: 'pa-fieldset' }, h('legend', null, 'Quyền'),
      options.scopes.map(({ scope, description }) => h('label', { key: scope, className: 'pa-check' },
        h('input', { type: 'checkbox', checked: form.scopes.includes(scope), disabled: scope === 'contact:basic', onChange: () => toggle('scopes', scope) }),
        h('span', null, h('code', null, scope), ' ', description, scope === 'contact:basic' ? ' (bắt buộc)' : '')))),
    h('fieldset', { className: 'pa-fieldset' }, h('legend', null, 'Khóa học được xem'),
      h('label', { className: 'pa-check' }, h('input', { type: 'checkbox', checked: form.allCourses, onChange: e => setForm(f => ({ ...f, allCourses: e.target.checked })) }), h('span', null, 'Tất cả khóa học, kể cả khóa thêm sau này')),
      form.allCourses ? null : options.courses.map(course => h('label', { key: course.id, className: 'pa-check pa-indent' },
        h('input', { type: 'checkbox', checked: form.courses.includes(course.id), onChange: () => toggle('courses', course.id) }), h('span', null, course.title)))),
    h('div', { className: 'pa-form-grid' },
      h(Field, { label: 'Giới hạn lượt gọi mỗi phút' }, h(Input, { type: 'number', min: 1, max: 6000, value: form.rate, onChange: e => setForm(f => ({ ...f, rate: e.target.value })), required: true })),
      h(Field, { label: 'IP được phép gọi (để trống = mọi IP)' }, h(Input, { value: form.ips, onChange: e => setForm(f => ({ ...f, ips: e.target.value })), placeholder: 'Ví dụ: 203.0.113.5, 203.0.113.6' }))),
    h('div', { className: 'pa-actions' },
      h(Button, { type: 'submit', disabled: saving }, saving ? 'Đang lưu...' : initial ? 'Lưu thay đổi' : 'Tạo khóa'),
      h(Button, { type: 'button', variant: 'outline', onClick: onCancel, disabled: saving }, 'Hủy')));
}

function KeysPanel({ clients, options, apiFetch, reload, ui }) {
  const { Card, Badge, Button } = ui;
  const [editing, setEditing] = React.useState(null); // { client } to edit, {} to create
  const [revealed, setRevealed] = React.useState(null);
  const send = (path, method, body) => apiFetch(`/admin/partner-api${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  async function save(values) {
    if (editing.client) await send(`/keys/${editing.client.id}`, 'PUT', values);
    else { const result = await send('/keys', 'POST', values); setRevealed({ name: result.client.name, key: result.key }); }
    setEditing(null);
    reload();
  }
  async function rotate(client) {
    if (!await confirmAction(`Đổi khóa cho "${client.name}"? Khóa đang dùng ngừng hoạt động NGAY, đối tác phải cập nhật khóa mới mới gọi tiếp được.`, false)) return;
    try { const result = await send(`/keys/${client.id}/rotate`, 'POST'); setRevealed({ name: client.name, key: result.key }); reload(); } catch {}
  }
  async function revoke(client) {
    if (!await confirmAction(`Thu hồi khóa của "${client.name}"? Đối tác sẽ không gọi được API nữa. Không mở lại được, chỉ có thể tạo khóa mới.`, false)) return;
    try { await send(`/keys/${client.id}/revoke`, 'POST'); reload(); } catch {}
  }
  async function remove(client) {
    if (!await confirmAction(`Xóa hẳn khóa "${client.name}" khỏi danh sách?`)) return;
    try { await send(`/keys/${client.id}`, 'DELETE'); reload(); } catch {}
  }
  return h(Card, { className: 'pa-card' },
    h('div', { className: 'pa-card-head' },
      h('div', null,
        h('h3', null, 'Khóa API đã cấp'),
        h('p', { className: 'pa-muted' }, 'Mỗi đối tác một khóa. Hệ thống chỉ lưu bản băm nên khóa chỉ hiện một lần khi tạo hoặc đổi. Mất khóa thì bấm "Đổi khóa".')),
      editing || clients === null ? null : h(Button, { type: 'button', onClick: () => setEditing({}) }, 'Tạo khóa mới')),
    revealed ? h(RevealKey, { revealed, onClose: () => setRevealed(null), ui }) : null,
    editing ? h(KeyForm, { key: editing.client?.id || 'new', initial: editing.client, options, onCancel: () => setEditing(null), onSave: save, ui }) : null,
    clients === null
      ? h('p', { className: 'pa-warn' }, 'Chưa đọc được danh sách khóa. Kiểm tra migration 010_partner_api.sql đã chạy chưa.')
      : clients.length
        ? h('div', { className: 'table-shell' }, h('table', { className: 'react-table' },
            h('thead', null, h('tr', null, ['Đối tác', 'Khóa', 'Quyền', 'Khóa học', 'Giới hạn', 'Trạng thái', 'Dùng gần nhất', ''].map((label, i) => h('th', { key: i }, label)))),
            h('tbody', null, clients.map(c => h('tr', { key: c.id, className: c.revoked_at ? 'pa-revoked' : '' },
              h('td', null, h('div', null, c.name), h('div', { className: 'pa-sub' }, `Tạo ${date(c.created_at)}${c.created_by ? ` · ${c.created_by}` : ''}`)),
              h('td', null, h('code', null, `${c.key_prefix}…`), c.rotated_at ? h('div', { className: 'pa-sub' }, `Đổi ${date(c.rotated_at)}`) : null),
              h('td', null, c.scopes.join(', ')),
              h('td', null, c.courses.length ? c.courses.map(id => options.courses.find(course => course.id === id)?.title || id).join(', ') : 'Tất cả'),
              h('td', null, `${c.rate_limit_per_minute}/phút`, c.ip_allowlist.length ? h('div', { className: 'pa-sub' }, `IP: ${c.ip_allowlist.join(', ')}`) : null),
              h('td', null, c.revoked_at ? h(Badge, { tone: 'neutral' }, 'Đã thu hồi') : h(Badge, { tone: 'success' }, 'Đang dùng')),
              h('td', null, date(c.last_used_at)),
              h('td', null, h('div', { className: 'pa-row-actions' }, c.revoked_at
                ? h(Button, { type: 'button', size: 'sm', variant: 'outline', onClick: () => remove(c) }, 'Xóa')
                : [
                    h(Button, { key: 'edit', type: 'button', size: 'sm', variant: 'outline', onClick: () => setEditing({ client: c }) }, 'Sửa'),
                    h(Button, { key: 'rotate', type: 'button', size: 'sm', variant: 'outline', onClick: () => rotate(c) }, 'Đổi khóa'),
                    h(Button, { key: 'revoke', type: 'button', size: 'sm', variant: 'critical', onClick: () => revoke(c) }, 'Thu hồi'),
                  ])))))))
        : h('p', { className: 'pa-muted' }, 'Chưa có khóa nào.'));
}

export default function PartnerApiDocs({ apiFetch, ui }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [revision, setRevision] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    apiFetch('/admin/partner-api').then(value => { if (!cancelled) setData(value); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [apiFetch, revision]);
  const markdown = data?.markdown || '';
  const content = React.useMemo(() => markdown ? renderMarkdown(markdown) : null, [markdown]);
  const toc = React.useMemo(() => markdown.replace(/\r/g, '').split('\n').filter(line => /^##\s/.test(line)).map(line => line.slice(3).trim()), [markdown]);
  if (error) return h('p', { className: 'pa-warn' }, error);
  if (!data) return h(Skeleton);
  return h('div', { className: 'pa-page' },
    h(KeysPanel, { clients: data.clients, options: data.options, apiFetch, reload: () => setRevision(r => r + 1), ui }),
    h('div', { className: 'pa-layout' },
      h('nav', { className: 'pa-toc', 'aria-label': 'Mục lục tài liệu' },
        h('strong', null, 'Mục lục'),
        toc.map(title => h('a', { key: title, href: `#pa-${slug(title)}`, onClick: event => { event.preventDefault(); document.getElementById(`pa-${slug(title)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, title.replace(/`/g, '')))),
      h('article', { className: 'pa-doc' }, content)));
}
