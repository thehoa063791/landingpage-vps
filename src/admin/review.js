import React from 'react';
import { Skeleton, notify, confirmAction } from './ui.js';
import './customers.css';

// CRM > Có thể trùng (roadmap 3.3): admins review the people the identity rules could not decide
// on. "Gộp" joins two people (nothing is deleted), "Không phải cùng người" keeps them apart for
// good; both decisions survive the nightly regrouping (src/contacts/service.js decidePair).
const h = React.createElement;
const fmt = n => new Intl.NumberFormat('vi-VN').format(Number(n || 0));
const day = value => value ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const when = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const REASONS = [['', 'Tất cả', 'all'], ['same_phone_other_name', 'Cùng SĐT, khác tên'], ['same_email_other_name', 'Cùng email, khác tên'], ['same_name_similar_email', 'Email gần giống']];
const TITLES = { same_phone_other_name: 'Cùng SĐT, tên khác', same_email_other_name: 'Cùng email, tên khác', same_name_similar_email: 'Cùng tên, email gần giống' };
const CHANGED = 'contacts:candidates';

function detailOf(pair) {
  const names = `"${pair.a.name || '—'}" và "${pair.b.name || '—'}"`;
  if (pair.reason === 'same_name_similar_email') return `"${pair.match_key}" · ${pair.a.email || '—'} và ${pair.b.email || '—'}`;
  return `${pair.match_key} · ${names}`;
}

async function openPerson(ui, id) {
  await ui.openModule?.('customers');
  history.replaceState(null, '', `/admin/view/customers?contact=${encodeURIComponent(id)}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function ReviewPage({ apiFetch, ui }) {
  const [view, setView] = React.useState(() => new URLSearchParams(location.search).get('view') === 'history' ? 'history' : 'review');
  function show(next) {
    setView(next);
    const params = new URLSearchParams(location.search);
    if (next === 'history') params.set('view', 'history'); else params.delete('view');
    history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
  }
  return h('div', { className: 'cu-page rv-page' }, view === 'history' ? h(History, { apiFetch, ui, onBack: () => show('review') }) : h(Review, { apiFetch, ui, onHistory: () => show('history') }));
}

function Review({ apiFetch, ui, onHistory }) {
  const [reason, setReason] = React.useState('');
  const [only, setOnly] = React.useState(() => new URLSearchParams(location.search).get('only') || '');
  const [state, setState] = React.useState({ loading: true, error: '', data: null });
  const [index, setIndex] = React.useState(0);
  const [skipped, setSkipped] = React.useState([]);
  const [picks, setPicks] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [lastAction, setLastAction] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  React.useEffect(() => {
    const sync = () => { const next = new URLSearchParams(location.search).get('only') || ''; if (next) setOnly(next); };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  React.useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    const params = new URLSearchParams({ pageSize: 50, ...(reason ? { reason } : {}), ...(only ? { only } : {}) });
    apiFetch(`/admin/contacts/candidates?${params}`).then(data => { if (live) { setState({ loading: false, error: '', data }); setIndex(0); } })
      .catch(err => { if (live) setState({ loading: false, error: err.message, data: null }); });
    return () => { live = false; };
  }, [apiFetch, reason, only, reloadKey]);
  const key = p => `${p.a.id}|${p.b.id}|${p.reason}`;
  // Skipped pairs ("Để sau") go to the end of this session's queue.
  const queue = (state.data?.rows || []).slice().sort((x, y) => skipped.indexOf(key(x)) - skipped.indexOf(key(y)));
  const pair = queue[Math.min(index, Math.max(0, queue.length - 1))];
  const counts = state.data?.counts || {};
  const remaining = counts.all || 0;
  React.useEffect(() => setPicks({}), [pair && key(pair)]);
  // Name/email/phone to keep: only the primary value of a side can be chosen.
  const value = (field, side) => pair[side][{ display_name: 'name', primary_email: 'email', primary_phone: 'phone' }[field]];

  async function act(decision) {
    if (!pair || busy) return;
    if (decision === 'later') {
      setSkipped(list => [...list.filter(k => k !== key(pair)), key(pair)]);
      setLastAction('Để sau');
      return;
    }
    setBusy(true);
    // Where the two people differ, the value chosen on screen (A by default) is kept.
    const pins = decision === 'same' ? Object.fromEntries(['display_name', 'primary_email', 'primary_phone']
      .filter(field => value(field, 'a') && value(field, 'b') && value(field, 'a') !== value(field, 'b'))
      .map(field => [field, value(field, picks[field] || 'a')])) : {};
    try {
      await apiFetch('/admin/contacts/candidates/decide', { method: 'POST', body: JSON.stringify({ contact_a: pair.a.id, contact_b: pair.b.id, decision, pins }) });
      setLastAction(decision === 'same' ? `Đã gộp ${pair.a.name || ''} và ${pair.b.name || ''}` : 'Đã ghi nhớ: không phải cùng người');
      window.dispatchEvent(new Event(CHANGED));
      if (only) setOnly('');
      setReloadKey(k => k + 1);
    } catch { /* shown */ } finally { setBusy(false); }
  }
  React.useEffect(() => {
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable || document.querySelector('[role="dialog"]')) return;
      const action = { g: 'same', k: 'not_same', s: 'later' }[e.key.toLowerCase()];
      if (action) { e.preventDefault(); act(action); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const fields = pair ? [
    ['display_name', 'Tên', pair.a.name, pair.b.name, true],
    ['primary_email', 'Email', pair.a.emails.join(', ') || pair.a.email, pair.b.emails.join(', ') || pair.b.email, true],
    ['primary_phone', 'SĐT', pair.a.phones.join(', ') || pair.a.phone, pair.b.phones.join(', ') || pair.b.phone, true],
    ['funnels', 'Phễu', pair.a.funnels.join(', '), pair.b.funnels.join(', ')],
    ['owner', 'Sale', pair.a.owner_name || 'Chưa giao', pair.b.owner_name || 'Chưa giao'],
    ['first', 'Đăng ký đầu', day(pair.a.first_registered_at), day(pair.b.first_registered_at)],
    ['count', 'Số lượt', `${pair.a.registrations} lượt`, `${pair.b.registrations} lượt`],
    ['notes', 'Ghi chú', pair.a.notes ? `${pair.a.notes} ghi chú` : 'Chưa có', pair.b.notes ? `${pair.b.notes} ghi chú` : 'Chưa có'],
    ['orders', 'Đơn hàng', pair.a.orders ? `${pair.a.orders} đơn` : 'Chưa có', pair.b.orders ? `${pair.b.orders} đơn` : 'Chưa có'],
  ] : [];

  return h(React.Fragment, null,
    h('div', { className: 'cu-title-row' },
      h('div', { className: 'cu-grow' },
        h('h1', null, 'Có thể trùng'),
        h('p', null, state.data ? `Hệ thống không tự gộp các ca này. Đã duyệt ${fmt(state.data.decided)} ca, còn ${fmt(remaining)}.` : 'Hệ thống không tự gộp các ca này.')),
      h('button', { type: 'button', className: 'cu-btn cu-btn-secondary', onClick: onHistory }, 'Lịch sử gộp')),
    h('div', { className: 'fu-ranges rv-reasons', role: 'tablist', 'aria-label': 'Lý do' },
      REASONS.map(([id, label, countKey]) => h('button', { key: id || 'all', type: 'button', role: 'tab', 'aria-selected': reason === id && !only, className: reason === id && !only ? 'on' : '', onClick: () => { setOnly(''); setReason(id); setSkipped([]); } },
        label, ' ', h('span', { className: 'cu-muted' }, fmt(counts[countKey || id] || 0))))),
    state.error ? h('div', { className: 'cu-card cu-empty cu-error' }, state.error)
      : state.loading && !state.data ? h('div', { className: 'cu-card cu-pad' }, h(Skeleton))
      : !pair ? h('div', { className: 'cu-card cu-empty' }, only ? 'Ca này đã được duyệt.' : 'Không còn ca nào cần duyệt.', lastAction ? h('div', { className: 'cu-sub' }, lastAction) : null)
      : h('section', { className: `cu-card rv-card${busy || state.loading ? ' cu-loading' : ''}`, 'aria-label': 'Ca đang duyệt' },
        h('div', { className: 'rv-reason' },
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true }, h('circle', { cx: 12, cy: 12, r: 9 }), h('path', { d: 'M12 8v5M12 16h.01' })),
          h('strong', null, TITLES[pair.reason] || pair.reason), h('span', null, detailOf(pair)),
          h('span', { className: 'cu-push cu-muted' }, `Ca ${Math.min(index, queue.length - 1) + 1} / ${fmt(only ? queue.length : remaining)}`)),
        h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table rv-table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Trường'),
            ['a', 'b'].map((side, i) => h('th', { key: side, scope: 'col' }, h('button', { type: 'button', className: 'cu-link', onClick: () => openPerson(ui, pair[side].id) }, `Hồ sơ ${i ? 'B' : 'A'}`))))),
          h('tbody', null, fields.map(([field, label, a, b, choose]) => {
            const differs = String(a || '') !== String(b || '');
            const canChoose = choose && differs && value(field, 'a') && value(field, 'b') && value(field, 'a') !== value(field, 'b');
            const picked = picks[field] || 'a';
            const cell = side => h('td', { key: side, className: differs ? 'rv-diff' : '' },
              canChoose ? h('label', { className: 'cu-check' }, h('input', { type: 'radio', name: `rv-${field}`, checked: picked === side, onChange: () => setPicks(p => ({ ...p, [field]: side })) }), side === 'a' ? a : b)
                : (side === 'a' ? a : b) || '—');
            return h('tr', { key: field },
              h('th', { scope: 'row' }, label, differs ? h('span', { className: 'rv-tag' }, 'khác') : null),
              cell('a'), cell('b'));
          })))),
        h('p', { className: 'rv-note' }, 'Gộp không xoá gì: mọi lượt đăng ký, ghi chú, tiến độ học, đơn hàng về chung một hồ sơ; tag lấy hợp; sale giữ theo lượt đăng ký sớm nhất. Gộp nhầm thì Tách trong Lịch sử gộp.'),
        h('div', { className: 'rv-actions' },
          h('button', { type: 'button', className: 'cu-btn cu-btn-primary', disabled: busy, onClick: () => act('same') }, 'Gộp ', h('kbd', null, 'G')),
          h('button', { type: 'button', className: 'cu-btn cu-btn-secondary', disabled: busy, onClick: () => act('not_same') }, 'Không phải cùng người ', h('kbd', null, 'K')),
          h('button', { type: 'button', className: 'cu-btn cu-btn-ghost', disabled: busy, onClick: () => act('later') }, 'Để sau ', h('kbd', null, 'S')),
          h('span', { className: 'cu-muted', role: 'status' }, lastAction))));
}

function History({ apiFetch, ui, onBack }) {
  const [all, setAll] = React.useState(false);
  const [state, setState] = React.useState({ loading: true, error: '', data: null });
  const [reloadKey, setReloadKey] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true }));
    apiFetch(`/admin/contacts/merges${all ? '?all=1' : ''}`).then(data => { if (live) setState({ loading: false, error: '', data }); })
      .catch(err => { if (live) setState({ loading: false, error: err.message, data: null }); });
    return () => { live = false; };
  }, [apiFetch, all, reloadKey]);
  async function undo(row) {
    if (!await confirmAction(`Tách lại ${row.merged_name || 'hồ sơ đã gộp'} khỏi ${row.kept_name || 'hồ sơ giữ lại'}? ${row.registration_ids.length} lượt đăng ký sẽ thành một người riêng và không được gộp lại tự động.`, false)) return;
    try { await apiFetch(`/admin/contacts/merges/${row.id}/undo`, { method: 'POST' }); notify('Đã tách lại'); window.dispatchEvent(new Event(CHANGED)); setReloadKey(k => k + 1); }
    catch { /* shown */ }
  }
  const rows = state.data?.rows || [];
  const reasonText = r => ({ 'manual merge': 'Gộp tay', 'not the same person': 'Không phải cùng người', 'manual split': 'Tách tay', 'undo merge': 'Hoàn tác gộp', 'new registration': 'Lượt đăng ký mới', sync: 'Đồng bộ ban đêm', 'identity rules': 'Luật nhận diện' }[r] || r);
  return h(React.Fragment, null,
    h('div', { className: 'cu-title-row' },
      h('button', { type: 'button', className: 'cu-icon-btn cu-icon-32', onClick: onBack, 'aria-label': 'Quay lại Có thể trùng' }, '‹'),
      h('div', { className: 'cu-grow' }, h('h1', null, 'Lịch sử gộp'), h('p', null, 'Mỗi lần gộp hoặc tách hồ sơ. Gộp nhầm thì bấm Tách lại.')),
      h('label', { className: 'cu-check' }, h('input', { type: 'checkbox', checked: all, onChange: () => setAll(v => !v) }), 'Cả gộp tự động'),
      h('a', { className: 'cu-btn cu-btn-ghost', href: '/admin/view/duplicates', onClick: e => { if (ui.openModule) { e.preventDefault(); ui.openModule('duplicates'); } } }, 'Công cụ cũ: gộp lượt đăng ký')),
    h('section', { className: 'cu-card' },
      state.error ? h('div', { className: 'cu-empty cu-error' }, state.error)
        : state.loading && !state.data ? h('div', { className: 'cu-pad' }, h(Skeleton))
        : !rows.length ? h('div', { className: 'cu-empty' }, all ? 'Chưa có lần gộp nào.' : 'Chưa có lần gộp hoặc tách nào do người duyệt.')
        : h('div', { className: 'cu-table-wrap' }, h('table', { className: 'cu-table fu-table' },
          h('thead', null, h('tr', null, ['Lúc', 'Việc', 'Hồ sơ', 'Lý do', 'Người làm'].map(l => h('th', { key: l }, l)), h('th', null, h('span', { className: 'sr-only' }, 'Thao tác')))),
          h('tbody', null, rows.map(row => h('tr', { key: row.id, className: 'cu-row' },
            h('td', { className: 'cu-nowrap' }, when(row.created_at)),
            h('td', null, h('span', { className: `cu-badge ${row.action === 'merge' ? 'cu-badge-info' : 'cu-badge-neutral'}` }, row.action === 'merge' ? 'Gộp' : 'Tách')),
            h('td', null,
              h('button', { type: 'button', className: 'cu-link', onClick: () => openPerson(ui, row.kept_id) }, row.kept_name || 'Hồ sơ giữ lại'),
              h('span', { className: 'cu-muted' }, row.action === 'merge' ? ' ← ' : ' → '),
              h('span', null, row.merged_name || 'hồ sơ khác'),
              h('div', { className: 'cu-sub' }, `${row.registration_ids.length} lượt đăng ký`)),
            h('td', null, reasonText(row.reason)),
            h('td', { className: 'cu-muted' }, row.by_email || '—'),
            h('td', { className: 'cu-right' }, row.can_undo ? h('button', { type: 'button', className: 'cu-btn cu-btn-plain cu-btn-sm', onClick: () => undo(row) }, 'Tách lại') : null))))))));
}
