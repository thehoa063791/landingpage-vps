import React from 'react';
import { Select, notify, Skeleton, EmptyState } from './ui.js';
import './learning.css';
import './zoomEvent.css';

// Admin for the /zoom funnel (src/zoomEvent.js): sign-ups with their personal Zoom link,
// and the event, banner and landing texts.
const h = React.createElement;
const BASE = '/admin/zoom-event';
const fmt = value => new Intl.NumberFormat('vi-VN').format(value || 0);
const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
// <input type="datetime-local"> holds Vietnam time; settings store ISO instants.
const toLocal = iso => iso ? new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 16) : '';
const fromLocal = value => value ? `${value}:00+07:00` : '';
const BANNERS = {
  composed: { desktop: '1920 × 800 px', mobile: '1080 × 1080 px', note: 'Ảnh nền không chứa chữ. Máy tính: chừa nửa trái tối/trống cho tiêu đề, đặt diễn giả ở nửa phải. Điện thoại: chủ thể nằm ở nửa trên ảnh, nửa dưới bị chữ phủ.' },
  image: { desktop: '1920 × 700 px', mobile: '1080 × 1350 px', note: 'Ảnh đã có đủ tiêu đề và thông tin. Ảnh hiển thị nguyên tỉ lệ, không bị cắt. Giữ chữ cách mép ít nhất 5% và đủ lớn khi xem trên điện thoại.' },
};

export default function ZoomEventAdmin({ section, apiFetch, canEdit, ui }) {
  return section === 'zoom-settings'
    ? h(SettingsPanel, { apiFetch, canEdit, ui })
    : h(RegistrationsPanel, { apiFetch, ui, canEdit });
}

function RegistrationsPanel({ apiFetch, ui, canEdit }) {
  const { Button, Card, Input, Field, Badge, downloadCsv } = ui;
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [revision, setRevision] = React.useState(0);
  const [eventKey, setEventKey] = React.useState(null);
  const [dates, setDates] = React.useState({ from: '', to: '' });
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [retrying, setRetrying] = React.useState(false);
  async function retryLinks() {
    setRetrying(true);
    try {
      const r = await apiFetch(`${BASE}/retry-links`, { method: 'POST', body: '{}' });
      notify(`Đã tạo ${r.ready}/${r.total} link${r.waiting ? ` · ${r.waiting} email chờ Zoom mở lại giới hạn ngày` : ''}${r.failed ? ` · ${r.failed} vẫn lỗi` : ''}`, r.failed > 0);
      setRevision(v => v + 1);
    } catch (e) { notify(e.message, true); }
    finally { setRetrying(false); }
  }
  React.useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (eventKey !== null) params.set('event', eventKey);
    if (dates.from) params.set('dateFrom', `${dates.from}T00:00:00+07:00`);
    if (dates.to) params.set('dateTo', `${dates.to}T23:59:59.999+07:00`);
    setError('');
    apiFetch(`${BASE}/report?${params}`).then(value => { if (!cancelled) setData(value); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [apiFetch, eventKey, dates.from, dates.to, revision]);
  React.useEffect(() => setPage(1), [query, filter, eventKey]);
  if (error) return h('div', { role: 'alert', className: 'state-error' }, error, h(Button, { onClick: () => setRevision(v => v + 1) }, 'Thử lại'));
  if (!data) return h(Skeleton);
  const q = query.trim().toLowerCase();
  const rows = data.rows.filter(row => (!q || [row.name, row.email, row.phone].some(v => String(v || '').toLowerCase().includes(q)))
    && (!filter || (filter === 'new' && row.is_new_lead) || (filter === 'crm' && !row.is_new_lead) || (filter === 'clicked' && row.join_clicks > 0) || (filter === 'not-clicked' && !row.join_clicks) || (filter === 'error' && !row.link_ready)));
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const shown = rows.slice((Math.min(page, pages) - 1) * 20, Math.min(page, pages) * 20);
  const s = data.summary;
  const label = key => key ? key.replace(/^meeting:/, 'Meeting ').replace(/^webinar:/, 'Webinar ') : 'Chưa cấu hình buổi Zoom';
  return h('div', { className: 'page-stack dt-learning' },
    h('div', { className: 'dt-row' },
      h('div', null, h('h2', null, 'Đăng ký Zoom'), h('p', { className: 'ze-muted' }, `${label(data.event_key)} · mỗi email nhận 1 link Zoom riêng.`)),
      h('div', { className: 'dt-actions' },
        data.events.length > 1 ? h(Select, { value: data.event_key, onChange: e => setEventKey(e.target.value), 'aria-label': 'Chọn buổi Zoom' }, ...data.events.map(ev => h('option', { key: ev.id, value: ev.id }, `${label(ev.id)}${ev.current ? ' (hiện tại)' : ''} · ${ev.registrations}`))) : null,
        h(Button, { variant: 'outline', onClick: () => setRevision(v => v + 1) }, 'Làm mới'))),
    h('div', { className: 'dt-stat-grid ze-stats' }, [
      ['Tổng đăng ký', fmt(s.registrations), 'Email đã nhận link Zoom riêng'],
      ['Lead mới', fmt(s.new_leads), 'Chưa có trong CRM, đã điền thông tin'],
      ['Khách đã có', fmt(s.existing_leads), `Vào thẳng trang vào học · ${fmt(s.hubcrm_customers)} có trên HubCRM`],
      ['Đã bấm vào Zoom', fmt(s.clicked), s.registrations ? `${Math.round(s.clicked / s.registrations * 100)}% người đăng ký` : '—'],
    ].map(([title, value, note]) => h(Card, { key: title, className: 'dt-stat' }, h('small', null, title), h('strong', null, value), h('span', { className: 'ze-muted' }, note)))),
    s.link_errors ? h('div', { role: 'alert', className: 'ze-alert ze-alert-row' }, h('span', null, `${fmt(s.link_errors)} người chưa có link Zoom. Hệ thống tự thử lại (sau 30 giây, 10 phút, rồi ngày hôm sau vì Zoom giới hạn 3 lần/ngày mỗi email; lỗi mạng thì thử lại liên tục mỗi 30 giây). Sửa cấu hình ở tab "Cài đặt sự kiện" rồi bấm tạo lại.`), canEdit && data.event_key === data.events.find(ev => ev.current)?.id ? h(Button, { size: 'sm', disabled: retrying, onClick: retryLinks }, retrying ? 'Đang tạo…' : 'Tạo lại link lỗi') : null) : null,
    h(Card, { className: 'dt-panel' },
      h('div', { className: 'dt-date-range' },
        h(Field, { label: 'Đăng ký từ ngày' }, h(Input, { type: 'date', value: dates.from, onChange: e => setDates(d => ({ ...d, from: e.target.value })) })),
        h(Field, { label: 'Đến ngày' }, h(Input, { type: 'date', value: dates.to, onChange: e => setDates(d => ({ ...d, to: e.target.value })) })),
        h(Button, { variant: 'ghost', onClick: () => setDates({ from: '', to: '' }) }, 'Toàn bộ thời gian')),
      h('div', { className: 'dt-filters' },
        h(Input, { placeholder: 'Tìm theo tên, email hoặc số điện thoại', value: query, onChange: e => setQuery(e.target.value), 'aria-label': 'Tìm người đăng ký' }),
        h(Select, { value: filter, onChange: e => setFilter(e.target.value), 'aria-label': 'Lọc' }, h('option', { value: '' }, 'Tất cả'), h('option', { value: 'new' }, 'Lead mới'), h('option', { value: 'crm' }, 'Khách đã có'), h('option', { value: 'clicked' }, 'Đã bấm vào Zoom'), h('option', { value: 'not-clicked' }, 'Chưa bấm vào Zoom'), h('option', { value: 'error' }, 'Chưa có link')),
        h(Button, { variant: 'outline', disabled: !rows.length, onClick: () => downloadCsv('zoom-dang-ky.csv', [
          { label: 'Họ tên', value: r => r.name }, { label: 'Email', value: r => r.email }, { label: 'Số điện thoại', value: r => r.phone }, { label: 'Khu vực', value: r => r.region },
          { label: 'Nguồn', value: r => r.is_new_lead ? 'Lead mới' : 'Khách đã có' }, { label: 'HubCRM ID', value: r => r.hubcrm_customer_id }, { label: 'Đăng ký lúc', value: r => date(r.created_at) },
          { label: 'Link Zoom', value: r => r.link_ready ? 'Sẵn sàng' : r.zoom_error || 'Đang tạo' }, { label: 'Số lần bấm vào Zoom', value: r => r.join_clicks }, { label: 'Lần bấm gần nhất', value: r => date(r.last_join_click_at) },
        ], rows) }, 'Xuất CSV (Excel)')),
      shown.length ? h('div', { className: 'table-shell' }, h('table', { className: 'react-table' },
        h('thead', null, h('tr', null, ...['Người đăng ký', 'Nguồn', 'Đăng ký lúc', 'Link Zoom', 'Bấm vào Zoom'].map(t => h('th', { key: t }, t)))),
        h('tbody', null, shown.map(row => h('tr', { key: row.key },
          h('td', null, h('strong', null, row.name || '—'), h('small', { className: 'dt-contact' }, row.email), h('small', { className: 'dt-contact' }, [row.phone, row.region].filter(Boolean).join(' · ') || '—')),
          h('td', null, h(Badge, { tone: row.is_new_lead ? 'info' : 'neutral' }, row.is_new_lead ? 'Lead mới' : 'Khách đã có'), row.hubcrm_customer_id ? h('small', { className: 'dt-contact' }, `HubCRM #${row.hubcrm_customer_id}`) : null),
          h('td', null, date(row.created_at)),
          h('td', null, row.link_ready ? h(Badge, { tone: 'success' }, 'Sẵn sàng') : h('span', { title: row.zoom_error }, h(Badge, { tone: row.zoom_error ? 'critical' : 'warning' }, row.zoom_error ? 'Lỗi tạo link' : 'Đang tạo'), row.zoom_error ? h('small', { className: 'dt-contact' }, row.zoom_error) : null, row.zoom_retry_at ? h('small', { className: 'dt-contact' }, `Tự thử lại: ${date(row.zoom_retry_at)}`) : null)),
          h('td', null, row.join_clicks ? h(React.Fragment, null, h('strong', null, `${fmt(row.join_clicks)} lần`), h('small', { className: 'dt-contact' }, `Gần nhất: ${date(row.last_join_click_at)}`)) : h('span', { className: 'ze-muted' }, 'Chưa bấm'))
        ))))) : h(EmptyState, { title: data.rows.length ? 'Không có người đăng ký phù hợp' : 'Chưa có người đăng ký', description: data.rows.length ? 'Thử bỏ bớt bộ lọc.' : 'Người đăng ký qua trang /zoom sẽ hiện ở đây.', onClear: data.rows.length ? () => { setQuery(''); setFilter(''); } : undefined }),
      h('div', { className: 'dt-pagination' }, h('span', null, `${fmt(rows.length)} kết quả · Trang ${Math.min(page, pages)}/${pages}`), h(Button, { variant: 'outline', disabled: page <= 1, onClick: () => setPage(p => p - 1) }, 'Trước'), h(Button, { variant: 'outline', disabled: page >= pages, onClick: () => setPage(p => p + 1) }, 'Sau')))
  );
}

function SettingsPanel({ apiFetch, canEdit, ui }) {
  const { Button, Card, Input, Field, Badge } = ui;
  const [saved, setSaved] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState('');
  const [zoomInfo, setZoomInfo] = React.useState(null);
  React.useEffect(() => {
    apiFetch(`${BASE}/settings`).then(value => { setSaved(value.settings); setDraft(value.settings); }).catch(e => setError(e.message));
  }, [apiFetch]);
  if (error && !draft) return h('div', { role: 'alert', className: 'state-error' }, error);
  if (!draft) return h(Skeleton);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const text = (key, label, props = {}) => h(Field, { label }, h(Input, { value: draft[key] || '', disabled: !canEdit, onChange: e => set(key, e.target.value), ...props }));
  const zoomBody = () => ({ zoom_kind: draft.zoom_kind, zoom_id: draft.zoom_id });

  async function save() {
    setBusy('save'); setError('');
    try {
      const value = await apiFetch(`${BASE}/settings`, { method: 'PUT', body: JSON.stringify(draft) });
      setSaved(value.settings); setDraft(value.settings); notify('Đã lưu. Trang /zoom cập nhật ngay.');
    } catch (e) { setError(e.message); notify(e.message, true); }
    finally { setBusy(''); }
  }
  async function zoomCall(path) {
    setBusy(path); setError('');
    try { setZoomInfo(await apiFetch(`${BASE}/${path}`, { method: 'POST', body: JSON.stringify(zoomBody()) })); if (path === 'zoom-enable') notify('Đã bật đăng ký tự duyệt cho buổi Zoom.'); }
    catch (e) { setZoomInfo(null); setError(e.message); notify(e.message, true); }
    finally { setBusy(''); }
  }
  async function upload(key, file, size) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return notify('Chỉ nhận ảnh JPG, PNG hoặc WebP.', true);
    if (file.size > 3 * 1024 * 1024) return notify('Ảnh lớn hơn 3 MB, trang sẽ tải chậm. Hãy nén ảnh (JPG chất lượng ~80%) rồi tải lại.', true);
    setBusy(key);
    try {
      const form = new FormData(); form.append('file', file); form.append('folder', 'zoom-event');
      const result = await apiFetch('/admin/cms/media/upload', { method: 'POST', body: form });
      set(key, result.url);
      const image = new Image();
      image.onload = () => { const [w, hgt] = size.split('×').map(v => parseInt(v, 10)); if (Math.abs(image.naturalWidth / image.naturalHeight - w / hgt) > 0.08) notify(`Ảnh ${image.naturalWidth}×${image.naturalHeight} khác tỉ lệ khuyến nghị ${size}; ảnh có thể bị cắt hoặc lệch bố cục.`, true); };
      image.src = result.url;
    } catch (e) { notify(e.message, true); }
    finally { setBusy(''); }
  }
  const imageField = (key, label, size, hint) => h('div', { className: 'ze-image-field' },
    h('div', { className: 'ze-image-head' }, h('strong', null, label), h(Badge, { tone: 'info' }, size)),
    draft[key] ? h('img', { src: draft[key], alt: label, className: 'ze-preview' }) : h('div', { className: 'ze-preview ze-preview-empty' }, hint),
    canEdit ? h('div', { className: 'dt-actions' },
      h('label', { className: 'ui-button ui-button-outline ui-button-sm ze-upload' }, busy === key ? 'Đang tải…' : draft[key] ? 'Đổi ảnh' : 'Tải ảnh lên', h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', disabled: !!busy, onChange: e => { upload(key, e.target.files[0], size); e.target.value = ''; } })),
      draft[key] ? h(Button, { variant: 'ghost', size: 'sm', onClick: () => set(key, '') }, 'Gỡ ảnh') : null) : null);
  const banner = BANNERS[draft.hero_mode];
  const zoomStart = zoomInfo?.start_time ? new Date(zoomInfo.start_time) : null;

  return h('div', { className: 'page-stack dt-learning ze-settings' },
    h('div', { className: 'dt-row' },
      h('div', null, h('h2', null, 'Cài đặt sự kiện & landing'), h('p', { className: 'ze-muted' }, 'Thay đổi áp dụng ngay cho trang /zoom sau khi lưu.')),
      h('div', { className: 'dt-actions' }, h('a', { className: 'ui-button ui-button-outline', href: '/zoom', target: '_blank', rel: 'noopener' }, 'Xem trang /zoom ↗'), canEdit ? h(Button, { disabled: !dirty || !!busy, onClick: save }, busy === 'save' ? 'Đang lưu…' : dirty ? 'Lưu thay đổi' : 'Đã lưu') : null)),
    error ? h('div', { role: 'alert', className: 'ze-alert' }, error) : null,

    h(Card, { className: 'dt-panel' },
      h('h3', null, '1. Buổi Zoom'),
      h('p', { className: 'ze-muted' }, 'Tạo Meeting (có lịch cố định) hoặc Webinar trên Zoom rồi dán ID vào đây. Hệ thống đăng ký từng người vào buổi này để Zoom cấp link riêng cho mỗi người. Đổi sang buổi khác thì link cũ của khách tự chuyển sang buổi mới khi họ mở lại trang vào học.'),
      h('div', { className: 'dt-form-grid' },
        h(Field, { label: 'Loại' }, h(Select, { value: draft.zoom_kind, disabled: !canEdit, onChange: e => { set('zoom_kind', e.target.value); setZoomInfo(null); }, 'aria-label': 'Loại Zoom' }, h('option', { value: 'meeting' }, 'Meeting'), h('option', { value: 'webinar' }, 'Webinar'))),
        text('zoom_id', 'Meeting / Webinar ID', { placeholder: 'VD: 812 3456 7890', inputMode: 'numeric', onChange: e => { set('zoom_id', e.target.value.replace(/[^\d]/g, '')); setZoomInfo(null); } })),
      canEdit ? h('div', { className: 'dt-actions ze-gap' },
        h(Button, { variant: 'outline', disabled: !draft.zoom_id || !!busy, onClick: () => zoomCall('zoom-check') }, busy === 'zoom-check' ? 'Đang kiểm tra…' : 'Kiểm tra Zoom'),
        zoomInfo && !zoomInfo.auto_approve ? h(Button, { disabled: !!busy || !zoomInfo.can_register, onClick: () => zoomCall('zoom-enable') }, busy === 'zoom-enable' ? 'Đang bật…' : 'Bật đăng ký tự duyệt') : null) : null,
      zoomInfo ? h('div', { className: 'ze-zoom-info' },
        h('strong', null, zoomInfo.topic || '(Không có tên)'),
        h('span', null, zoomStart ? `Giờ trên Zoom: ${date(zoomInfo.start_time)} · ${zoomInfo.duration} phút` : 'Buổi Zoom không có giờ cố định'),
        h('span', null, zoomInfo.auto_approve ? h(Badge, { tone: 'success' }, 'Đăng ký tự duyệt: đã bật') : zoomInfo.registration_enabled ? h(Badge, { tone: 'warning' }, 'Đăng ký cần duyệt tay, nên bật tự duyệt') : h(Badge, { tone: 'critical' }, 'Chưa bật đăng ký')),
        zoomInfo.required_fields?.length ? h('span', null, `Form đăng ký Zoom bắt buộc: ${zoomInfo.required_fields.join(', ')}.`) : null,
        zoomInfo.blocking_fields?.length ? h('span', { className: 'ze-warn' }, `Hệ thống không có dữ liệu cho: ${zoomInfo.blocking_fields.join(', ')}. Vào Zoom › Registration, bỏ bắt buộc các trường này, nếu không link sẽ không tạo được.`) : null,
        !zoomInfo.can_register ? h('span', { className: 'ze-warn' }, 'Meeting không có lịch cố định (tức thì/phòng cá nhân) không hỗ trợ đăng ký. Hãy tạo meeting có lịch.') : null,
        zoomStart && canEdit ? h(Button, { variant: 'ghost', size: 'sm', onClick: () => { set('starts_at', zoomStart.toISOString()); if (zoomInfo.duration) set('duration_minutes', zoomInfo.duration); } }, 'Dùng giờ này cho landing') : null) : null),

    h(Card, { className: 'dt-panel' },
      h('h3', null, '2. Thời gian diễn ra'),
      h('div', { className: 'dt-form-grid' },
        h(Field, { label: 'Bắt đầu (giờ Việt Nam)' }, h(Input, { type: 'datetime-local', value: toLocal(draft.starts_at), disabled: !canEdit, onChange: e => set('starts_at', fromLocal(e.target.value)) })),
        h(Field, { label: 'Thời lượng (phút)' }, h(Input, { type: 'number', min: 15, max: 1440, value: draft.duration_minutes, disabled: !canEdit, onChange: e => set('duration_minutes', e.target.value) }))),
      h('p', { className: 'ze-muted' }, draft.starts_at ? 'Đồng hồ đếm ngược chạy tới giờ bắt đầu, sau đó hiện "Sự kiện đang diễn ra" và hết thời lượng thì hiện "Sự kiện đã kết thúc".' : 'Chưa đặt giờ: khối thời gian và đếm ngược được ẩn trên landing.')),

    h(Card, { className: 'dt-panel' },
      h('h3', null, '3. Banner chính'),
      h('div', { className: 'ze-modes', role: 'radiogroup', 'aria-label': 'Kiểu banner' }, [['composed', 'Ảnh nền + chữ HTML', 'Tiêu đề, mô tả và 3 điểm nổi bật là chữ, sửa ngay bên dưới.'], ['image', 'Ảnh có sẵn chữ', 'Designer làm cả tiêu đề trong ảnh; trang chỉ hiển thị ảnh.']].map(([id, title, note]) =>
        h('label', { key: id, className: `ze-mode${draft.hero_mode === id ? ' active' : ''}` }, h('input', { type: 'radio', name: 'hero_mode', checked: draft.hero_mode === id, disabled: !canEdit, onChange: () => set('hero_mode', id) }), h('strong', null, title), h('span', null, note)))),
      h('p', { className: 'ze-muted' }, `${banner.note} JPG chất lượng ~80%, dưới 500 KB mỗi ảnh để trang tải nhanh.`),
      h('div', { className: 'ze-image-grid' },
        imageField('banner_desktop', 'Banner máy tính', banner.desktop, draft.hero_mode === 'composed' ? 'Đang dùng ảnh lớp học mặc định' : 'Bắt buộc với kiểu "Ảnh có sẵn chữ"'),
        imageField('banner_mobile', 'Banner điện thoại', banner.mobile, 'Để trống: dùng banner máy tính')),
      draft.hero_mode === 'composed' ? h(React.Fragment, null,
        h('div', { className: 'dt-form-grid ze-gap' },
          text('badge', 'Nhãn nhỏ phía trên', { maxLength: 60 }),
          text('subtitle', 'Mô tả ngắn', { maxLength: 240 }),
          text('title_line1', 'Tiêu đề dòng 1 (màu trắng)', { maxLength: 80 }),
          text('title_line2', 'Tiêu đề dòng 2 (màu xanh)', { maxLength: 80 })),
        h('div', { className: 'dt-form-grid ze-three ze-gap' }, [0, 1, 2].map(i => h(Field, { key: i, label: `Điểm nổi bật ${i + 1} (không bắt buộc)` }, h(Input, { value: draft.highlights[i] || '', maxLength: 80, disabled: !canEdit, placeholder: 'Để trống để ẩn', onChange: e => set('highlights', draft.highlights.map((v, j) => j === i ? e.target.value : v)) }))))) : null),

    h(Card, { className: 'dt-panel' },
      h('h3', null, '4. Form đăng ký'),
      h('div', { className: 'dt-form-grid' }, text('button_label', 'Chữ trên nút', { maxLength: 40 }), text('privacy_note', 'Dòng cam kết bảo mật', { maxLength: 240 }))),

    h(Card, { className: 'dt-panel' },
      h('h3', null, '5. Chân trang'),
      h('p', { className: 'ze-muted' }, 'Ô nào để trống sẽ tự ẩn trên trang; xóa hết thì ẩn cả chân trang.'),
      h('div', { className: 'dt-form-grid' },
        text('footer_company', 'Tên công ty'), text('footer_tagline', 'Dòng phụ dưới tên công ty'),
        text('footer_hotline', 'Hotline', { inputMode: 'tel' }), text('footer_email', 'Email', { type: 'email' }),
        text('footer_website', 'Website'), text('footer_address', 'Địa chỉ'))),

    h(Card, { className: 'dt-panel' },
      h('h3', null, '6. Khi chia sẻ link (Zalo, Messenger, Facebook)'),
      h('p', { className: 'ze-muted' }, 'Để trống thì dùng tiêu đề, mô tả và giờ sự kiện ở trên. Zalo lưu tạm bản xem trước theo link, đổi ảnh có thể mất một thời gian mới cập nhật.'),
      h('div', { className: 'dt-form-grid' }, text('share_title', 'Tiêu đề chia sẻ', { maxLength: 160 }), text('share_description', 'Mô tả chia sẻ', { maxLength: 300 })),
      h('div', { className: 'ze-image-grid ze-gap' }, imageField('share_image', 'Ảnh chia sẻ', '1200 × 630 px', draft.hero_mode === 'image' && draft.banner_desktop ? 'Để trống: dùng banner máy tính' : 'Để trống: dùng ảnh mặc định'))),

    canEdit && dirty ? h('div', { className: 'ze-savebar' }, h('span', null, 'Có thay đổi chưa lưu'), h(Button, { variant: 'outline', disabled: !!busy, onClick: () => setDraft(saved) }, 'Hủy'), h(Button, { disabled: !!busy, onClick: save }, busy === 'save' ? 'Đang lưu…' : 'Lưu thay đổi')) : null
  );
}
