import React from 'react';
import { Skeleton, EmptyState, notify } from './ui.js';
import { RANGES, rangeOf, presetOf, rangeQuery, vnDate } from './funnelDetail.js';
import './funnel.css';
import './compare.css';

// Dashboard > Compare: 2 to 6 funnels over one date range, side by side (src/funnelCompare.js).
// By default each funnel has two columns, its landing leads and its chatbot leads (Messenger
// bot links: utm_source ai-cskh / chatbot, fb_id), so two funnels give four columns; "Gộp lead" shows one per funnel.
// One column is the base the others are compared with (the first, or the one clicked).
const h = React.createElement;
const fmt = n => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(n || 0));
const pct = n => n == null ? '—' : `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(n)}%`;
const money = n => n == null ? '—' : `${fmt(n)} ₫`;
const PAIR = ['dong-tien', 'trading'];
const MAX = 6;
const VIEWS = [['split', 'Landing / Chatbot'], ['all', 'Gộp lead']];
const CHANNEL_NAMES = { landing: 'Landing', chatbot: 'Chatbot', all: 'Tất cả lead' };
const CHATBOT_SINCE = '19/10/2026';

// The rows of the table. better: which way is good (for the best cell and the change's colour);
// kind 'rate' compares in percentage points, the others in percent.
const SECTIONS = [
  { title: 'Lưu lượng và đăng ký', rows: [
    { id: 'visits', label: 'Lượt truy cập', hint: 'Phiên vào landing (không tính trang học)', value: c => c.visits, show: fmt, better: 'high' },
    { id: 'registrations', label: 'Đăng ký', hint: 'Lượt đăng ký mới trong kỳ', value: c => c.registrations, show: fmt, better: 'high' },
    { id: 'optin', label: 'Tỷ lệ đăng ký', hint: 'Đăng ký / lượt truy cập', value: c => c.optin_rate, show: pct, better: 'high', kind: 'rate' },
  ] },
  { title: 'Quảng cáo', note: 'Chiến dịch Facebook ghép theo từ khóa trong tên; tên có "message" tính cho Chatbot', rows: [
    { id: 'spend', label: 'Chi tiêu quảng cáo', hint: 'Các chiến dịch Facebook của phễu', value: c => c.ads?.spend ?? null, show: money, spend: true },
    { id: 'per-reg', label: 'Chi phí / đăng ký', value: c => c.ads?.cost_per_registration ?? null, show: money, better: 'low' },
    { id: 'per-new', label: 'Chi phí / người mới', hint: 'Người lần đầu có trong hệ thống', value: c => c.ads?.cost_per_new ?? null, show: money, better: 'low' },
  ] },
  { title: 'Học tập', learning: true, rows: [
    { id: 'activation', label: 'Tỷ lệ kích hoạt', hint: 'Người đăng ký đã mở ít nhất 1 bài', value: c => c.learning?.activation_rate, show: pct, better: 'high', kind: 'rate', count: c => `${fmt(c.learning.activated)} / ${fmt(c.learning.students)} người` },
    { id: 'watch', label: 'Xem trung bình', hint: '% thời lượng chương trình đã xem, tính trên người đã vào học', value: c => c.learning?.avg_watch_percent, show: pct, better: 'high', kind: 'rate' },
    { id: 'completed', label: 'Học hết chương trình', hint: 'Hoàn thành mọi bài đang hiện', value: c => c.learning?.completion_rate, show: pct, better: 'high', kind: 'rate', count: c => `${fmt(c.learning.completed)} người` },
  ] },
];

function change(value, base, row) {
  if (value == null || base == null || row.spend) return null;
  const diff = row.kind === 'rate' ? value - base : base ? (value - base) / base * 100 : null;
  if (diff == null) return null;
  const good = row.better === 'low' ? diff < 0 : diff > 0;
  const text = Math.abs(diff) < 0.05 ? 'bằng mốc' : `${diff > 0 ? '+' : '−'}${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(Math.abs(diff))}${row.kind === 'rate' ? ' điểm' : '%'} so với mốc`;
  return { text, tone: text === 'bằng mốc' ? 'flat' : good ? 'good' : 'bad' };
}
const bestOf = (values, row) => {
  const known = values.filter(v => v != null);
  return row.better && known.length > 1 && new Set(known).size > 1 ? (row.better === 'low' ? Math.min(...known) : Math.max(...known)) : null;
};

function useCompare(path, apiFetch) {
  const [state, setState] = React.useState({ loading: false, error: '', data: null });
  React.useEffect(() => {
    if (!path) { setState({ loading: false, error: '', data: null }); return undefined; }
    let live = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    apiFetch(path).then(data => live && setState({ loading: false, error: '', data }))
      .catch(error => live && setState({ loading: false, error: error.message, data: null }));
    return () => { live = false; };
  }, [path, apiFetch]);
  return state;
}

export default function ComparePage({ apiFetch }) {
  const params = new URLSearchParams(location.search);
  const today = vnDate();
  const [index, setIndex] = React.useState(null);
  const [picked, setPicked] = React.useState(() => params.get('funnels') ? params.get('funnels').split(',').filter(Boolean) : null);
  const [range, setRange] = React.useState(() => ({ from: params.get('dateFrom') || rangeOf('30d').from, to: params.get('dateTo') || today }));
  const [view, setView] = React.useState(() => params.get('view') === 'all' ? 'all' : 'split');
  const [baseKey, setBaseKey] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  React.useEffect(() => { apiFetch('/admin/funnels-index').then(d => setIndex(d.rows || [])).catch(() => setIndex([])); }, [apiFetch]);
  const funnels = index || [];
  const hasPair = PAIR.every(slug => funnels.some(f => f.slug === slug));
  // Opened without a choice: Đồng Tiền vs Trading.
  const chosen = picked ? picked.filter(slug => !index || funnels.some(f => f.slug === slug)) : !index ? [] : hasPair ? PAIR : funnels.slice(0, 2).map(f => f.slug);
  function remember(next) {
    const p = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(next)) value ? p.set(key, value) : p.delete(key);
    history.replaceState({}, '', `${location.pathname}?${p}`);
  }
  function choose(list) { setPicked(list); remember({ funnels: list.join(',') }); }
  function toggle(slug) { choose(chosen.includes(slug) ? chosen.filter(s => s !== slug) : chosen.length < MAX ? [...chosen, slug] : chosen); }
  function pickRange(next) {
    const fixed = next.from > next.to ? { from: next.from, to: next.from > today ? today : next.from } : next;
    setRange(fixed); remember({ dateFrom: fixed.from, dateTo: fixed.to });
  }
  function pickView(id) { setView(id); remember({ view: id === 'all' ? 'all' : '' }); }
  const ready = index && chosen.length >= 2;
  const report = useCompare(ready ? `/admin/funnels-compare?${new URLSearchParams({ funnels: chosen.join(',') })}&${rangeQuery(range)}&r=${reloadKey}` : '', apiFetch);
  const preset = presetOf(range.from, range.to);
  const color = slug => `var(--chart-${chosen.indexOf(slug) % 8 + 1})`;
  const rows = report.data?.funnels || [];
  // The table's columns: each funnel's landing and chatbot leads, or all its leads.
  const columns = rows.flatMap(f => (view === 'split' ? ['landing', 'chatbot'] : ['all']).map((channel, i) => ({ key: `${f.slug}:${channel}`, f, channel, first: i === 0 })));
  const base = columns.find(c => c.key === baseKey) || columns[0];

  return h('div', { className: 'cu-page fu-page cmp-page' },
    h('div', { className: 'cu-card cmp-controls' },
      h('div', { className: 'cmp-control-row' },
        h('span', { className: 'cmp-label', id: 'cmp-funnels' }, 'Phễu'),
        h('div', { className: 'cmp-chips', role: 'group', 'aria-labelledby': 'cmp-funnels' },
          !index ? h('span', { className: 'cu-muted' }, 'Đang tải…')
            : funnels.map(f => {
              const on = chosen.includes(f.slug);
              return h('button', { key: f.slug, type: 'button', className: `cmp-chip${on ? ' on' : ''}`, 'aria-pressed': on, disabled: !on && chosen.length >= MAX, title: !on && chosen.length >= MAX ? `Tối đa ${MAX} phễu` : f.url, onClick: () => toggle(f.slug) },
                h('i', { style: on ? { background: color(f.slug) } : null, 'aria-hidden': true }), f.name);
            })),
        hasPair ? h('button', { type: 'button', className: 'cu-btn cu-btn-sm cu-btn-secondary', onClick: () => choose(PAIR) }, 'Đồng Tiền vs Trading') : null),
      h('div', { className: 'cmp-control-row' },
        h('div', { className: 'fu-ranges', role: 'group', 'aria-label': 'Khoảng thời gian' },
          RANGES.map(([id, label]) => h('button', { key: id, type: 'button', 'aria-pressed': preset === id, className: preset === id ? 'on' : '', onClick: () => pickRange(rangeOf(id)) }, label))),
        h('div', { className: 'fu-dates' },
          h('input', { type: 'date', value: range.from, max: range.to, 'aria-label': 'Từ ngày', onChange: e => e.target.value && pickRange({ ...range, from: e.target.value }) }),
          h('span', { 'aria-hidden': true }, '–'),
          h('input', { type: 'date', value: range.to, min: range.from, max: today, 'aria-label': 'Đến ngày', onChange: e => e.target.value && pickRange({ ...range, to: e.target.value }) })),
        h('span', { className: 'cu-grow' }),
        h('span', { className: 'cmp-label', id: 'cmp-view' }, 'Cột'),
        h('div', { className: 'fu-ranges', role: 'group', 'aria-labelledby': 'cmp-view' },
          VIEWS.map(([id, label]) => h('button', { key: id, type: 'button', 'aria-pressed': view === id, className: view === id ? 'on' : '', onClick: () => pickView(id) }, label)))),
      view === 'split' ? h('p', { className: 'cmp-note' }, `Mỗi phễu chia 2 cột: Landing (tự vào trang) và Chatbot (vào từ link của bot chăm sóc khách hàng, có từ ${CHATBOT_SINCE}). Bấm tiêu đề một cột để đặt làm mốc so sánh.`) : null),
    !index ? h('div', { className: 'cu-card cu-pad' }, h(Skeleton))
      : chosen.length < 2 ? h('div', { className: 'cu-card' }, h(EmptyState, { title: 'Chọn ít nhất 2 phễu', description: `Bấm vào tên phễu ở trên để thêm vào so sánh (tối đa ${MAX}).` }))
      : report.error ? h('div', { className: 'cu-card cu-empty cu-error' }, report.error)
      : !report.data ? h('div', { className: 'cu-card cu-pad' }, h(Skeleton))
      : h('div', { className: `fu-stack${report.loading ? ' cmp-busy' : ''}`, 'aria-busy': report.loading },
        h(MetricsTable, { rows, columns, view, base, color, onBase: setBaseKey }),
        h(Journey, { columns, view, color }),
        h(AdKeywords, { rows, unassigned: report.data.unassigned_campaigns || [], apiFetch, onSaved: () => setReloadKey(k => k + 1) })));
}

// Funnel names over their columns; in the split view a second row names landing / chatbot.
function TableHead({ first, columns, view, base, color, onBase }) {
  const funnels = [...new Map(columns.map(c => [c.f.slug, c.f])).values()];
  const pick = c => onBase && h('button', { type: 'button', className: 'cmp-base-btn', 'aria-pressed': base?.key === c.key, title: 'Đặt làm mốc so sánh', onClick: () => onBase(c.key) },
    view === 'split' ? CHANNEL_NAMES[c.channel] : c.f.url, base?.key === c.key ? h('span', { className: 'cmp-base-tag' }, 'Mốc') : null);
  const name = f => h('span', { className: 'cmp-funnel-name' }, h('i', { style: { background: color(f.slug) }, 'aria-hidden': true }), f.name);
  if (view !== 'split') {
    return h('thead', null, h('tr', null, h('th', { scope: 'col' }, first),
      columns.map(c => h('th', { key: c.key, scope: 'col', className: 'cmp-funnel-col cmp-group-start' }, name(c.f), onBase ? pick(c) : h('span', { className: 'cmp-funnel-sub' }, c.f.url)))));
  }
  return h('thead', null,
    h('tr', null, h('th', { scope: 'col', rowSpan: 2 }, first),
      funnels.map(f => h('th', { key: f.slug, scope: 'colgroup', colSpan: 2, className: 'cmp-group-start cmp-group-head' }, name(f)))),
    h('tr', null, columns.map(c => h('th', { key: c.key, scope: 'col', className: `cmp-funnel-col cmp-channel-col ${c.channel}${c.first ? ' cmp-group-start' : ''}` },
      onBase ? pick(c) : h('span', { className: 'cmp-channel-name' }, CHANNEL_NAMES[c.channel])))));
}

function MetricsTable({ rows, columns, view, base, color, onBase }) {
  return h('div', { className: 'cu-card' },
    h('div', { className: 'cu-table-wrap' },
      h('table', { className: 'cu-table cmp-table' },
        h(TableHead, { first: 'Chỉ số', columns, view, base, color, onBase }),
        SECTIONS.filter(s => !s.learning || rows.some(f => f.learning)).map(section => h('tbody', { key: section.title },
          h('tr', { className: 'cmp-section' }, h('th', { scope: 'rowgroup', colSpan: columns.length + 1 }, section.title, section.note && view === 'split' ? h('span', null, ` · ${section.note}`) : null)),
          section.rows.map(row => h(ChannelRow, { key: row.id, row, section, columns, base })))))));
}

function Label({ row }) {
  return h('th', { scope: 'row', className: 'cmp-metric' }, h('span', null, row.label), row.hint ? h('small', null, row.hint) : null);
}

// One value per column (funnel × landing / chatbot).
function ChannelRow({ row, section, columns, base }) {
  const valueOf = c => section.learning && !c.f.learning ? null : row.value(c.f.channels[c.channel]);
  const values = columns.map(valueOf);
  const best = bestOf(values, row), baseValue = base ? valueOf(base) : null;
  return h('tr', null, h(Label, { row }),
    columns.map((c, i) => {
      const v = values[i], data = c.f.channels[c.channel];
      const delta = c.key !== base?.key ? change(v, baseValue, row) : null;
      return h('td', { key: c.key, className: `cmp-cell${c.first ? ' cmp-group-start' : ''}${v != null && v === best ? ' best' : ''}${c.key === base?.key ? ' base' : ''}` },
        h('div', { className: 'cmp-value' }, h('strong', null, v == null ? '—' : row.show(v)),
          v != null && v === best ? h('span', { className: 'cu-badge cu-badge-success' }, 'Tốt nhất') : null),
        delta ? h('span', { className: `fu-delta ${delta.tone}` }, delta.text) : null,
        row.count && v != null ? h('span', { className: 'cmp-sub' }, row.count(data)) : null,
        row.spend && c.first && c.f.spend.shared ? h('span', { className: 'cmp-sub cmp-warn', title: 'Chiến dịch này cũng được tính ở phễu khác đang so sánh; toàn bộ chi tiêu của nó có ở mỗi phễu.' }, `Có ${money(c.f.spend.shared)} của ${fmt(c.f.spend.shared_campaigns)} chiến dịch dùng chung`) : null,
        section.learning && !c.f.learning ? h('span', { className: 'cmp-sub' }, 'Phễu không có trang học') : null);
    }));
}

// The journey from the ads to each lesson: reach → link clicks → visits → registrations →
// started learning → lesson 1, 2, 3... Each cell: the number, and what share of the step above
// it kept (the bar). Reach and clicks: the column's campaigns (message campaigns = chatbot).
// Funnels have different lessons, so lessons line up by position and the cell names the lesson.
const learnOf = c => c.f.channels[c.channel].learning;
const lessonAt = (c, i) => learnOf(c)?.lessons[i];
const adOf = (c, key) => c.f.channels[c.channel].ads?.[key] ?? null;
function journeySteps(longest) {
  return [
    { id: 'reach', label: 'Tiếp cận', hint: 'Người thấy quảng cáo (cộng theo ngày)', value: c => adOf(c, 'reach') },
    { id: 'clicks', label: 'Click', hint: 'Người bấm quảng cáo (cộng theo ngày)', value: c => adOf(c, 'link_clicks'), prev: c => adOf(c, 'reach') },
    { id: 'visits', label: 'Lượt truy cập', hint: 'Phiên vào landing', value: c => c.f.channels[c.channel].visits, prev: c => adOf(c, 'link_clicks') },
    { id: 'registrations', label: 'Đăng ký', hint: 'Chuyển đổi', value: c => c.f.channels[c.channel].registrations, prev: c => c.f.channels[c.channel].visits },
    { id: 'started', label: 'Vào học', hint: 'Mở ít nhất 1 bài', learning: true, value: c => learnOf(c)?.activated ?? null, prev: c => learnOf(c)?.students ?? null },
    ...Array.from({ length: longest }, (_, i) => ({
      id: `lesson-${i + 1}`, label: `Bài ${i + 1}`, learning: true, lesson: i,
      value: c => lessonAt(c, i)?.viewers ?? null,
      prev: c => i === 0 ? learnOf(c)?.activated ?? null : lessonAt(c, i - 1)?.viewers ?? null,
    })),
  ];
}

function JourneyCell({ c, step, color }) {
  const v = step.value(c), prev = step.prev ? step.prev(c) : null;
  const kept = v != null && prev ? Math.min(100, v / prev * 100) : null;
  const lesson = step.lesson != null ? lessonAt(c, step.lesson) : null;
  const cls = `cmp-cell${c.first ? ' cmp-group-start' : ''}`;
  if (v == null) return h('td', { className: `${cls} cu-muted` }, '—', step.learning && !c.f.learning ? h('span', { className: 'cmp-sub' }, 'Phễu không có trang học') : null);
  return h('td', { className: cls },
    lesson ? h('span', { className: 'cmp-lesson-title', title: lesson.title, 'aria-hidden': !c.first }, c.first ? lesson.title : ' ') : null,
    h('div', { className: 'cmp-reach' },
      h('strong', { className: 'cmp-step-value' }, fmt(v)),
      kept != null ? h('div', { className: 'cmp-reach-track', title: `${pct(kept)} của bước trước` }, h('div', { className: `cmp-reach-${c.channel}`, style: { width: `${kept}%`, background: color(c.f.slug) } })) : h('span', { className: 'cu-grow' })),
    kept != null ? h('span', { className: 'cmp-sub' }, `${pct(kept)} của bước trước`) : null,
    lesson ? h('span', { className: 'cmp-sub' }, `${pct(lesson.rate)} người đăng ký`) : null);
}

function Journey({ columns, view, color }) {
  const longest = Math.max(0, ...columns.map(c => learnOf(c)?.lessons.length || 0));
  const steps = journeySteps(longest).filter(s => !s.learning || columns.some(c => c.f.learning));
  return h('div', { className: 'cu-card' },
    h('div', { className: 'fu-pad fu-stack-12' },
      h('h2', { className: 'cmp-h2' }, 'Hành trình từ tiếp cận đến từng bài'),
      h('p', { className: 'cmp-note' }, 'Mỗi ô: số người ở bước đó và thanh % còn lại so với bước ngay trên. Tiếp cận và click lấy từ quảng cáo Facebook của phễu: chiến dịch "message" ở cột Chatbot, còn lại ở cột Landing. Từ "Vào học" trở xuống tính trên người đăng ký trong kỳ, xem bài lúc nào cũng được.')),
    h('div', { className: 'cu-table-wrap' },
      h('table', { className: 'cu-table cmp-table cmp-lessons' },
        h(TableHead, { first: 'Bước', columns, view, color }),
        h('tbody', null, steps.map(step => h('tr', { key: step.id, className: step.id === 'started' ? 'cmp-step-split' : '' },
          h('th', { scope: 'row', className: 'cmp-metric' }, h('span', null, step.label), step.hint ? h('small', null, step.hint) : null),
          columns.map(c => h(JourneyCell, { key: c.key, c, step, color }))))))));
}

// Which Facebook campaigns are a funnel's: keywords in the campaign name (src/adKeywords.js),
// and the campaigns that spent in the range without any funnel keyword.
function AdKeywords({ rows, unassigned, apiFetch, onSaved }) {
  const [drafts, setDrafts] = React.useState({});
  const [saving, setSaving] = React.useState('');
  async function save(f) {
    setSaving(f.slug);
    try {
      await apiFetch(`/admin/ad-keywords/${encodeURIComponent(f.slug)}`, { method: 'PUT', body: JSON.stringify({ keywords: drafts[f.slug] }) });
      setDrafts(d => { const next = { ...d }; delete next[f.slug]; return next; });
      notify(`Đã lưu từ khóa của ${f.name}`);
      onSaved();
    } catch (error) { notify(error.message, true); } finally { setSaving(''); }
  }
  const count = (f, ch) => f.channels[ch].ads?.campaigns || 0;
  return h('div', { className: 'cu-card fu-pad fu-stack-12' },
    h('h2', { className: 'cmp-h2' }, 'Ghép chiến dịch quảng cáo'),
    h('p', { className: 'cmp-note' }, 'Chiến dịch Facebook thuộc phễu nếu tên có một trong các từ khóa (không phân biệt hoa thường). Tên có "message" tính cho Chatbot, còn lại cho Landing. Ngăn cách các từ khóa bằng dấu phẩy.'),
    h('div', { className: 'cmp-kw-list' }, rows.map(f => {
      const value = drafts[f.slug] ?? (f.keywords || []).join(', ');
      return h('div', { key: f.slug, className: 'cmp-kw-row' },
        h('label', { className: 'cmp-kw-name', htmlFor: `kw-${f.slug}` }, f.name),
        h('input', { id: `kw-${f.slug}`, className: 'ui-input cmp-kw-input', value, placeholder: 'vd. dongtien, htkt', onChange: e => setDrafts(d => ({ ...d, [f.slug]: e.target.value })) }),
        h('button', { type: 'button', className: 'cu-btn cu-btn-sm cu-btn-secondary', disabled: drafts[f.slug] == null || saving === f.slug, onClick: () => save(f) }, saving === f.slug ? 'Đang lưu…' : 'Lưu'),
        h('span', { className: 'cmp-sub' }, `${fmt(count(f, 'landing'))} chiến dịch landing · ${fmt(count(f, 'chatbot'))} chiến dịch chatbot`));
    })),
    unassigned.length ? h('div', { className: 'cmp-unassigned' },
      h('strong', null, 'Chiến dịch có chi tiêu nhưng chưa thuộc phễu nào'),
      h('ul', null, unassigned.map(c => h('li', { key: c.name }, h('span', null, c.name), h('span', { className: 'cmp-sub' }, money(c.spend)))))) : null);
}
