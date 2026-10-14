import React from 'react';
import { Skeleton, notify } from './ui.js';
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

function KeysPanel({ clients, ui }) {
  const { Card, Badge } = ui;
  return h(Card, { className: 'pa-card' },
    h('h3', null, 'Khóa API đã cấp'),
    h('p', { className: 'pa-muted' }, 'Khóa được tạo và thu hồi trên server (chỉ hiện một lần khi tạo, hệ thống chỉ lưu bản băm). Thu hồi có hiệu lực trong 30 giây.'),
    clients === null
      ? h('p', { className: 'pa-warn' }, 'Chưa đọc được danh sách khóa. Kiểm tra migration 010_partner_api.sql đã chạy chưa.')
      : clients.length
        ? h('div', { className: 'table-shell' }, h('table', { className: 'react-table' },
            h('thead', null, h('tr', null, ['Đối tác', 'Khóa', 'Quyền', 'Khóa học', 'Giới hạn', 'Trạng thái', 'Dùng gần nhất'].map(label => h('th', { key: label }, label)))),
            h('tbody', null, clients.map(c => h('tr', { key: c.id },
              h('td', null, c.name),
              h('td', null, h('code', null, `${c.key_prefix}…`)),
              h('td', null, c.scopes.join(', ')),
              h('td', null, c.courses.length ? c.courses.join(', ') : 'Tất cả'),
              h('td', null, `${c.rate_limit_per_minute}/phút`),
              h('td', null, c.revoked_at ? h(Badge, { tone: 'neutral' }, 'Đã thu hồi') : h(Badge, { tone: 'success' }, 'Đang dùng')),
              h('td', null, date(c.last_used_at)))))))
        : h('p', { className: 'pa-muted' }, 'Chưa có khóa nào.'),
    h('details', { className: 'pa-howto' },
      h('summary', null, 'Cách tạo / thu hồi khóa (chạy trên server, user eventapp, thư mục /opt/event-landingpage)'),
      h(CodeBlock, { language: 'bash', code: [
        '# Tạo khóa (thêm contact:phone nếu đối tác cần số điện thoại)',
        'node scripts/partner-key.cjs create --name "AI CSKH" --scopes contact:basic,learning:read [--courses trading,dong-tien] [--rate 60] [--ips <ip>]',
        '',
        '# Danh sách khóa',
        'node scripts/partner-key.cjs list',
        '',
        '# Thu hồi',
        'node scripts/partner-key.cjs revoke <id>',
      ].join('\n') })));
}

export default function PartnerApiDocs({ apiFetch, ui }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let cancelled = false;
    apiFetch('/admin/partner-api').then(value => { if (!cancelled) setData(value); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [apiFetch]);
  const content = React.useMemo(() => data ? renderMarkdown(data.markdown) : null, [data]);
  const toc = React.useMemo(() => data ? data.markdown.replace(/\r/g, '').split('\n').filter(line => /^##\s/.test(line)).map(line => line.slice(3).trim()) : [], [data]);
  if (error) return h('p', { className: 'pa-warn' }, error);
  if (!data) return h(Skeleton);
  return h('div', { className: 'pa-page' },
    h(KeysPanel, { clients: data.clients, ui }),
    h('div', { className: 'pa-layout' },
      h('nav', { className: 'pa-toc', 'aria-label': 'Mục lục tài liệu' },
        h('strong', null, 'Mục lục'),
        toc.map(title => h('a', { key: title, href: `#pa-${slug(title)}`, onClick: event => { event.preventDefault(); document.getElementById(`pa-${slug(title)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, title.replace(/`/g, '')))),
      h('article', { className: 'pa-doc' }, content)));
}
