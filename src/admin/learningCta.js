import React from 'react';
import { Select, Overlay, confirmAction, notify } from './ui.js';
import { MediaPicker, uploadImage } from './zoomEvent.js';
import './daisy-cta.css';

const h = React.createElement;
// The library is shared; course IDs are shown with these names in the summaries.
const COURSE_NAMES = { 'dong-tien': 'Dòng Tiền', trading: 'Trading' };
const TYPES = [
  ['zalo', 'Tham gia Zalo', 'Tham gia nhóm Zalo', 'https://zalo.me/g/…'],
  ['link', 'Chuyển sang trang / phễu khác', 'Xem ngay', '/hoc-trading hoặc https://…'],
  ['zoom', 'Đăng ký Zoom', 'Đăng ký tham gia Zoom', '/zoom'],
  ['message', 'Chỉ hiện thông điệp', '', ''],
];
const typeOf = id => TYPES.find(t => t[0] === id) || TYPES[3];
const TRIGGERS = [['time', 'Sau một khoảng thời gian'], ['percent', 'Khi xem được % bài'], ['end', 'Khi xem hết bài']];
const REPEATS = [['every_view', 'Mỗi lần mở bài'], ['once_per_lesson', 'Một lần ở mỗi bài'], ['once', 'Một lần trong cả khóa']];
const SCOPES = [['none', 'Không áp dụng'], ['all', 'Tất cả bài'], ['stages', 'Theo chương'], ['lessons', 'Chọn từng bài']];
const DISPLAYS = [
  ['popup', 'Popup giữa màn hình', 'Nổi bật nhất. Tạm dừng video, học viên bấm nút hoặc đóng.'],
  ['card', 'Thẻ ở góc video', 'Nhẹ nhàng, video vẫn chạy. Trên điện thoại thẻ nằm dưới video.'],
  ['overlay', 'Phủ kín video', 'Tạm dừng video, nội dung nằm trong khung video. Trên điện thoại chỉ hiện tiêu đề và nút.'],
];
const displayLabel = id => (DISPLAYS.find(d => d[0] === id) || DISPLAYS[1])[1];
const clock = value => `${Math.floor((value || 0) / 60)}:${String((value || 0) % 60).padStart(2, '0')}`;
const EMPTY = { name: '', enabled: true, type: 'zalo', title: '', body: '', button_label: 'Tham gia nhóm Zalo', url: '', image: '', trigger: 'end', trigger_value: 0, display: 'card', variant: 'basic', size: 'md', color: 'auto', repeat: 'once_per_lesson', hide_after_click: true, targets: {} };

export function triggerLabel(cta) {
  if (cta.trigger === 'time') return `Sau ${clock(cta.trigger_value)}`;
  if (cta.trigger === 'percent') return `Khi xem ${cta.trigger_value}%`;
  return 'Khi xem hết bài';
}
export function lessonCtas(ctas, course, lesson) {
  return (ctas || []).filter(cta => {
    const target = cta.targets?.[course];
    if (!target) return false;
    if (target.scope === 'all') return true;
    if (target.scope === 'lessons') return target.ids.includes(Number(lesson.id));
    return target.scope === 'stages' && !!lesson.stage_id && target.ids.includes(Number(lesson.stage_id));
  });
}
function scopeLabel(target, count) {
  if (!target || target.scope === 'none') return 'Không áp dụng';
  if (target.scope === 'all') return 'Tất cả bài';
  return `${count ?? target.ids.length} ${target.scope === 'stages' ? 'chương' : 'bài'}`;
}

// CTA library of the learning admin: list with statistics, editor and lesson assignment.
export default function CtaPanel({ course, courseTitle, base, apiFetch, ui, canEdit, lessons, stages, stats, ctas, loading, error, onChanged }) {
  const { Button, Card, Badge } = ui;
  const [editing, setEditing] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  async function request(path, method, body) {
    setBusy(true);
    try { await apiFetch(base + '/ctas' + path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }); onChanged(); return true; }
    catch (e) { notify(e.message, true); return false; }
    finally { setBusy(false); }
  }
  async function remove(cta) {
    const elsewhere = Object.entries(cta.targets).filter(([id, t]) => id !== course && t.scope !== 'none').map(([id]) => COURSE_NAMES[id] || id);
    if (!await confirmAction(`Xóa CTA "${cta.name}"?${elsewhere.length ? ` CTA này cũng đang dùng ở khóa ${elsewhere.join(', ')} và sẽ biến mất ở đó.` : ''} Thống kê đã ghi vẫn được giữ.`, true)) return;
    if (await request(`/${cta.id}`, 'DELETE')) notify('Đã xóa CTA');
  }
  async function duplicate(cta) {
    const { id, updated_at, ...copy } = cta;
    if (await request('', 'POST', { ...copy, name: `${cta.name} (bản sao)`.slice(0, 80), enabled: false })) notify('Đã nhân bản CTA (đang tắt). Sửa rồi bật khi sẵn sàng.');
  }
  const validIds = target => target.scope === 'stages' ? target.ids.filter(id => stages.some(s => Number(s.id) === id)).length : target.ids.filter(id => lessons.some(l => Number(l.id) === id)).length;
  const list = loading ? h('p', { className: 'dt-muted' }, 'Đang tải thư viện CTA…') : error ? h('div', { role: 'alert', className: 'state-error' }, error, h(Button, { onClick: onChanged }, 'Thử lại')) : !ctas.length ? h('div', { className: 'dt-cta-empty' },
    h('strong', null, 'Chưa có CTA nào'),
    h('p', null, 'CTA là khung kêu gọi hành động hiện trên trang học, ví dụ mời vào nhóm Zalo khi xem hết bài, mời đăng ký Zoom ở phút thứ 10, hoặc một lời nhắn.'),
    canEdit ? h(Button, { onClick: () => setEditing({ ...EMPTY }) }, '+ Tạo CTA đầu tiên') : null)
    : h('div', { className: 'table-shell' }, h('table', { className: 'react-table dt-cta-table' },
      h('thead', null, h('tr', null, ...['CTA', 'Hiện khi', `Khóa ${courseTitle}`, 'Khóa khác', 'Đã xem / Đã bấm', 'Trạng thái', ''].map(t => h('th', { key: t }, t)))),
      h('tbody', null, ctas.map(cta => {
        const target = cta.targets[course] || { scope: 'none', ids: [] };
        const others = Object.entries(cta.targets).filter(([id, t]) => id !== course && t.scope !== 'none');
        const s = stats[cta.id] || { views: 0, clicks: 0 };
        return h('tr', { key: cta.id },
          h('td', null, h('strong', null, cta.name), h('small', { className: 'dt-contact' }, typeOf(cta.type)[1], cta.type !== 'message' ? ` · ${cta.url}` : '')),
          h('td', null, triggerLabel(cta), h('small', { className: 'dt-contact' }, displayLabel(cta.display))),
          h('td', null, h(Badge, { tone: target.scope === 'none' ? 'neutral' : 'success' }, scopeLabel(target, validIds(target)))),
          h('td', null, others.length ? others.map(([id, t]) => h('small', { key: id, className: 'dt-contact' }, `${COURSE_NAMES[id] || id}: ${scopeLabel(t)}`)) : h('small', { className: 'dt-contact' }, '—')),
          h('td', null, `${s.views} / ${cta.type === 'message' ? '—' : s.clicks}`, cta.type !== 'message' && s.views ? h('small', { className: 'dt-contact' }, `Tỷ lệ bấm ${Math.round(s.clicks / s.views * 100)}%`) : null),
          h('td', null, canEdit ? h('label', { className: 'dt-check dt-cta-switch' }, h('input', { type: 'checkbox', checked: cta.enabled, disabled: busy, onChange: e => request(`/${cta.id}`, 'PATCH', { enabled: e.target.checked }) }), cta.enabled ? 'Đang bật' : 'Đang tắt') : h(Badge, { tone: cta.enabled ? 'success' : 'neutral' }, cta.enabled ? 'Đang bật' : 'Đang tắt')),
          h('td', null, canEdit ? h('div', { className: 'dt-actions' },
            h(Button, { variant: 'outline', size: 'sm', onClick: () => setEditing({ ...cta }) }, 'Sửa'),
            h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => duplicate(cta) }, 'Nhân bản'),
            h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => remove(cta) }, 'Xóa')) : null));
      }))));
  return h(React.Fragment, null,
    h(Card, { className: 'dt-panel' },
      h('div', { className: 'dt-row' },
        h('div', null, h('h3', null, `Thư viện CTA (${ctas.length})`), h('p', null, 'Dùng chung cho mọi khóa học. Trong từng CTA, chọn bài nào của khóa này sẽ hiện CTA. Số liệu "Đã xem / Đã bấm" là số học viên của khóa này, theo khoảng ngày đang chọn.')),
        canEdit && ctas.length ? h(Button, { onClick: () => setEditing({ ...EMPTY }) }, '+ Tạo CTA') : null),
      list),
    editing ? h(CtaEditor, { key: editing.id || 'new', initial: editing, course, courseTitle, apiFetch, ui, lessons, stages, busy, onClose: () => setEditing(null),
      onSave: async body => { if (await request(editing.id ? `/${editing.id}` : '', editing.id ? 'PATCH' : 'POST', body)) { setEditing(null); notify('Đã lưu CTA'); } } }) : null);
}

function CtaEditor({ initial, course, courseTitle, apiFetch, ui, lessons, stages, busy, onClose, onSave }) {
  const { Button, Input, Field } = ui;
  const [draft, setDraft] = React.useState(() => ({ ...initial, target: initial.targets?.[course] || { scope: 'none', ids: [] } }));
  const [picking, setPicking] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  const type = typeOf(draft.type);
  function changeType(id) {
    // Keep a button label the admin wrote; replace the default of the previous type.
    const label = TYPES.some(t => t[2] === draft.button_label) || !draft.button_label ? typeOf(id)[2] : draft.button_label;
    set({ type: id, button_label: label, url: id === 'zoom' && !draft.url ? '/zoom' : draft.url });
  }
  function setTarget(patch) { setDraft(d => ({ ...d, target: { ...d.target, ...patch } })); }
  function toggleId(id) { setTarget({ ids: draft.target.ids.includes(id) ? draft.target.ids.filter(v => v !== id) : [...draft.target.ids, id] }); }
  async function upload(file) {
    setUploading(true);
    try { const url = await uploadImage(apiFetch, file, 'learning-cta'); if (url) set({ image: url }); }
    catch (e) { notify(e.message, true); }
    finally { setUploading(false); }
  }
  const minutes = Math.floor(draft.trigger_value / 60), secs = draft.trigger_value % 60;
  const setTime = (m, s) => set({ trigger_value: Math.max(0, (Number(m) || 0) * 60 + (Number(s) || 0)) });
  const others = Object.entries(initial.targets || {}).filter(([id, t]) => id !== course && t.scope !== 'none');
  const grouped = [...stages, { id: 0, title: 'Chưa phân chương' }].map(s => ({ ...s, lessons: lessons.filter(l => Number(l.stage_id || 0) === Number(s.id)) })).filter(s => s.lessons.length);
  function submit(e) {
    e.preventDefault();
    const { target, targets, ...rest } = draft;
    onSave({ ...rest, trigger_value: Number(draft.trigger_value) || 0, targets: { [course]: { scope: target.scope, ids: ['stages', 'lessons'].includes(target.scope) ? target.ids : [] } } });
  }
  return h(Overlay, { className: 'dt-dialog-layer' },
    h('button', { className: 'drawer-backdrop', 'aria-label': 'Đóng', onClick: () => { if (!busy) onClose(); } }),
    h('section', { className: 'ui-card dt-dialog dt-cta-dialog', role: 'dialog', 'aria-labelledby': 'dt-cta-title' },
      h('div', { className: 'dt-row' }, h('h2', { id: 'dt-cta-title' }, initial.id ? `Sửa CTA · ${initial.name}` : 'Tạo CTA'), h(Button, { variant: 'ghost', disabled: busy, onClick: onClose }, 'Đóng')),
      h('form', { onSubmit: submit, className: 'dt-cta-form' },
        h('div', { className: 'dt-cta-main' },
          h('section', { className: 'dt-cta-section' }, h('h3', null, '1. Nội dung'),
            h(Field, { label: 'Tên CTA (chỉ admin thấy)' }, h(Input, { required: true, maxLength: 80, value: draft.name, placeholder: 'VD: Zalo cuối bài', onChange: e => set({ name: e.target.value }) })),
            h('div', { className: 'dt-cta-types', role: 'radiogroup', 'aria-label': 'Loại CTA' }, TYPES.map(([id, label]) =>
              h('button', { key: id, type: 'button', role: 'radio', 'aria-checked': draft.type === id, className: `dt-cta-type${draft.type === id ? ' active' : ''}`, onClick: () => changeType(id) }, label))),
            h(Field, { label: 'Tiêu đề' }, h(Input, { required: true, maxLength: 120, value: draft.title, placeholder: 'VD: Vào nhóm Zalo để nhận tài liệu bài học', onChange: e => set({ title: e.target.value }) })),
            h(Field, { label: 'Mô tả ngắn (không bắt buộc)' }, h('textarea', { className: 'ui-input', rows: 3, maxLength: 600, value: draft.body, onChange: e => set({ body: e.target.value }) })),
            draft.type !== 'message' ? h('div', { className: 'dt-form-grid' },
              h(Field, { label: 'Chữ trên nút' }, h(Input, { required: true, maxLength: 40, value: draft.button_label, onChange: e => set({ button_label: e.target.value }) })),
              h(Field, { label: 'Link khi bấm nút' }, h(Input, { required: true, maxLength: 2048, value: draft.url, placeholder: type[3], onChange: e => set({ url: e.target.value.trim() }) }))) : null,
            draft.type !== 'message' ? h('p', { className: 'dt-muted' }, 'Link mở ở tab mới để học viên không mất bài đang xem. Dùng https://… hoặc đường dẫn trong website như /zoom, /hoc-trading.') : null,
            h('div', { className: 'dt-cta-image' },
              draft.image ? h('img', { src: draft.image, alt: '' }) : h('span', { className: 'dt-muted' }, 'Không có ảnh'),
              h('div', { className: 'dt-actions' },
                h(Button, { type: 'button', variant: 'outline', size: 'sm', onClick: () => setPicking(true) }, 'Chọn từ thư viện'),
                h('label', { className: 'ui-button ui-button-outline ui-button-sm dt-upload' }, uploading ? 'Đang tải…' : 'Tải ảnh mới', h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', disabled: uploading, onChange: e => { upload(e.target.files[0]); e.target.value = ''; } })),
                draft.image ? h(Button, { type: 'button', variant: 'ghost', size: 'sm', onClick: () => set({ image: '' }) }, 'Gỡ ảnh') : null))),
          h('section', { className: 'dt-cta-section' }, h('h3', null, '2. Mẫu card'),
            h('p', { className: 'dt-muted' }, 'Các mẫu card của daisyUI, chỉ khác màu. Bấm một mẫu để xem trước trên điện thoại.'),
            h('div', { className: 'dt-cta-variants', role: 'radiogroup', 'aria-label': 'Mẫu card' }, VARIANTS.map(([id, label]) =>
              h('button', { key: id, type: 'button', role: 'radio', 'aria-checked': draft.variant === id, 'aria-label': label, className: `dt-cta-variant${draft.variant === id ? ' active' : ''}`, onClick: () => set({ variant: id }) },
                h('span', { className: 'dt-cta-variant-stage', 'aria-hidden': 'true' }, h('span', { className: 'dt-cta-variant-scale' }, h(DaisyCard, { cta: { ...draft, variant: id, size: 'md' }, secondaryLabel: secondaryLabelOf(draft) }))),
                h('span', { className: 'dt-cta-variant-name' }, label)))),
            draft.variant === 'pricing' ? h('p', { className: 'dt-muted' }, 'Mẫu "Danh sách lợi ích": mỗi dòng của phần mô tả thành một ý có dấu ✓.') : null,
            h('div', { className: 'dt-form-grid' },
              h(Field, { label: 'Cỡ card' }, h('div', { className: 'dt-cta-sizes', role: 'radiogroup', 'aria-label': 'Cỡ card' }, SIZES.map(([id, label]) =>
                h('button', { key: id, type: 'button', role: 'radio', 'aria-checked': draft.size === id, className: `dt-cta-size${draft.size === id ? ' active' : ''}`, onClick: () => set({ size: id }) }, label)))),
              h(Field, { label: 'Màu' }, h('div', { className: 'dt-cta-colors', role: 'radiogroup', 'aria-label': 'Màu' }, COLORS.map(([id, label, swatch]) =>
                h('button', { key: id, type: 'button', role: 'radio', 'aria-checked': draft.color === id, title: label, 'aria-label': label, className: `dt-cta-color${draft.color === id ? ' active' : ''}`, style: { background: swatch || 'conic-gradient(#0068FF 0 25%, oklch(45% .24 277.023) 0 50%, #F59E0B 0 75%, oklch(14% .005 285.823) 0)' }, onClick: () => set({ color: id }) })))))),
          h('section', { className: 'dt-cta-section' }, h('h3', null, '3. Khi nào hiện'),
            h('div', { className: 'dt-form-grid' },
              h(Field, { label: 'Thời điểm' }, h(Select, { value: draft.trigger, 'aria-label': 'Thời điểm hiện', onChange: e => set({ trigger: e.target.value, trigger_value: e.target.value === 'percent' ? 50 : e.target.value === 'time' ? 60 : 0 }) }, TRIGGERS.map(([id, label]) => h('option', { key: id, value: id }, label)))),
              draft.trigger === 'time' ? h(Field, { label: 'Hiện sau (phút : giây)' }, h('div', { className: 'dt-cta-clock' },
                h(Input, { type: 'number', min: 0, value: minutes, 'aria-label': 'Phút', onChange: e => setTime(e.target.value, secs) }), h('span', null, ':'),
                h(Input, { type: 'number', min: 0, max: 59, value: secs, 'aria-label': 'Giây', onChange: e => setTime(minutes, e.target.value) }))) :
              draft.trigger === 'percent' ? h(Field, { label: 'Đã xem (%)' }, h(Input, { type: 'number', min: 1, max: 100, required: true, value: draft.trigger_value, onChange: e => set({ trigger_value: e.target.value }) })) : h('p', { className: 'dt-muted dt-cta-note' }, 'Hiện khi video chạy hết. Bài tiếp theo không tự chuyển nữa; học viên bấm "Bài tiếp theo" trong CTA.')),
            h('div', { className: 'dt-cta-displays', role: 'radiogroup', 'aria-label': 'Kiểu hiện' }, DISPLAYS.map(([id, label, note]) =>
              h('button', { key: id, type: 'button', role: 'radio', 'aria-checked': draft.display === id, className: `dt-cta-display${draft.display === id ? ' active' : ''}`, onClick: () => set({ display: id }) }, h('strong', null, label), h('span', null, note)))),
            h('div', { className: 'dt-form-grid' },
              h(Field, { label: 'Số lần hiện' }, h(Select, { value: draft.repeat, 'aria-label': 'Số lần hiện', onChange: e => set({ repeat: e.target.value }) }, REPEATS.map(([id, label]) => h('option', { key: id, value: id }, label)))),
              draft.type !== 'message' ? h('label', { className: 'dt-check dt-cta-note' }, h('input', { type: 'checkbox', checked: draft.hide_after_click, onChange: e => set({ hide_after_click: e.target.checked }) }), 'Không hiện lại khi học viên đã bấm nút') : null)),
          h('section', { className: 'dt-cta-section' }, h('h3', null, `4. Áp dụng cho khóa ${courseTitle}`),
            h('div', { className: 'dt-cta-scopes', role: 'radiogroup', 'aria-label': 'Phạm vi áp dụng' }, SCOPES.map(([id, label]) =>
              h('label', { key: id, className: 'dt-check' }, h('input', { type: 'radio', name: 'cta-scope', checked: draft.target.scope === id, onChange: () => setTarget({ scope: id, ids: [] }) }), label))),
            draft.target.scope === 'stages' ? (stages.length ? h('div', { className: 'dt-cta-picks' }, stages.map(s => h('label', { key: s.id, className: 'dt-check' }, h('input', { type: 'checkbox', checked: draft.target.ids.includes(Number(s.id)), onChange: () => toggleId(Number(s.id)) }), s.title))) : h('p', { className: 'dt-muted' }, 'Khóa này chưa có chương.')) : null,
            draft.target.scope === 'lessons' ? h('div', { className: 'dt-cta-picks' }, grouped.map(s => h('div', { key: s.id },
              h('strong', null, s.title),
              s.lessons.map(l => h('label', { key: l.id, className: 'dt-check' }, h('input', { type: 'checkbox', checked: draft.target.ids.includes(Number(l.id)), onChange: () => toggleId(Number(l.id)) }), l.title, l.is_visible === false ? ' (đang ẩn)' : ''))))) : null,
            others.length ? h('p', { className: 'dt-muted' }, 'Thư viện dùng chung — CTA này cũng đang áp dụng ở ', others.map(([id, t]) => `khóa ${COURSE_NAMES[id] || id} (${scopeLabel(t)})`).join(', '), '. Sửa nội dung ở đây sẽ đổi ở cả các khóa đó.') : null,
            h('label', { className: 'dt-check' }, h('input', { type: 'checkbox', checked: draft.enabled, onChange: e => set({ enabled: e.target.checked }) }), 'Bật CTA'))),
        h('aside', { className: 'dt-cta-preview', 'aria-label': 'Xem trước' }, h('small', null, 'Xem trước trên điện thoại'), h(CtaPreview, { cta: draft }), h('p', null, 'Phần lớn học viên học trên điện thoại. Tiêu đề nên ngắn (dưới 60 ký tự), chữ trên nút là một hành động: "Vào nhóm Zalo", "Giữ chỗ Zoom".')),
        h('div', { className: 'dt-dialog-footer' }, h(Button, { type: 'button', variant: 'outline', disabled: busy, onClick: onClose }, 'Hủy'), h(Button, { type: 'submit', disabled: busy }, busy ? 'Đang lưu…' : 'Lưu CTA')))),
    picking ? h(MediaPicker, { apiFetch, ui, folder: 'learning-cta', title: 'Ảnh CTA', current: draft.image, onClose: () => setPicking(false), onPick: url => { set({ image: url }); setPicking(false); } }) : null);
}

// daisyUI card templates (daisyui.com/components/card) with daisyUI's own CSS (daisy-cta.css,
// classes dz-*); only the primary colour changes. Same markup as the learner page
// (pages/dong-tien/src/components/learning/LessonCta.tsx), Tailwind utilities written inline.
const VARIANTS = [['basic', 'Cơ bản'], ['badges', 'Có badge'], ['bottom', 'Ảnh dưới'], ['centered', 'Căn giữa'], ['plain', 'Không ảnh'], ['bordered', 'Viền'], ['dash', 'Viền nét đứt'], ['color', 'Nền màu'], ['neutral', 'Nền tối'], ['close', 'Nút đóng trên'], ['side', 'Ảnh bên cạnh'], ['imagefull', 'Ảnh nền phủ'], ['pricing', 'Danh sách lợi ích']];
const SIZES = [['sm', 'Nhỏ'], ['md', 'Vừa'], ['lg', 'Lớn']];
const PALETTE = { zalo: ['#0068FF', '#FFFFFF'], indigo: ['oklch(45% .24 277.023)', 'oklch(93% .034 272.788)'], amber: ['#F59E0B', '#3B2300'], green: ['oklch(76% .177 163.223)', 'oklch(37% .077 168.94)'], pink: ['oklch(65% .241 354.308)', 'oklch(94% .028 342.258)'], red: ['oklch(58% .22 25)', '#FFFFFF'], neutral: ['oklch(14% .005 285.823)', 'oklch(92% .004 286.32)'] };
const COLORS = [['auto', 'Theo loại CTA', ''], ['zalo', 'Xanh Zalo', PALETTE.zalo[0]], ['indigo', 'Tím', PALETTE.indigo[0]], ['amber', 'Cam', PALETTE.amber[0]], ['green', 'Xanh lá', PALETTE.green[0]], ['pink', 'Hồng', PALETTE.pink[0]], ['red', 'Đỏ', PALETTE.red[0]], ['neutral', 'Đen', PALETTE.neutral[0]]];
const AUTO = { zalo: 'zalo', zoom: 'indigo', link: 'amber', message: 'neutral' };
const LABELS = { zalo: 'Zalo', zoom: 'Zoom', link: 'Ưu đãi', message: 'Lời nhắn' };
const LAYOUTS = {
  basic: { figure: 'top' }, badges: { figure: 'top', titleBadge: true }, bottom: { figure: 'bottom' }, centered: { figure: 'padded', center: true, start: true },
  plain: {}, bordered: { card: 'dz-card-border', flat: true }, dash: { card: 'dz-card-dash', flat: true },
  color: { bg: 'primary', flat: true, plainButton: true }, neutral: { bg: 'neutral', flat: true, center: true }, close: { closeTop: true },
  side: { card: 'dz-card-side', figure: 'side' }, imagefull: { card: 'dz-image-full', figure: 'full' }, pricing: { pricing: true },
};
const SHADOW_SM = '0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1)';
const ctaColors = cta => { const [primary, content] = PALETTE[cta.color && cta.color !== 'auto' ? cta.color : AUTO[cta.type]] || PALETTE.indigo; return { '--color-primary': primary, '--color-primary-content': content }; };
const secondaryLabelOf = cta => { const action = cta.type !== 'message' && !!cta.button_label; return cta.trigger === 'end' ? 'Bài tiếp theo' : cta.display !== 'card' ? (action ? 'Để sau' : 'Xem tiếp bài học') : action ? '' : 'Đã hiểu'; };
const svg = (d, style) => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', style, 'aria-hidden': 'true' }, h('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d }));

function DaisyCard({ cta, secondaryLabel, style }) {
  const layout = LAYOUTS[cta.variant] || LAYOUTS.basic;
  const action = cta.type !== 'message' && cta.button_label;
  const fullFigure = layout.figure === 'full';
  const fallback = radius => h('div', { style: { display: 'grid', placeItems: 'center', width: '100%', ...(layout.figure === 'side' ? { height: '100%', minHeight: '10rem' } : fullFigure ? { height: '100%' } : { aspectRatio: '2 / 1' }), borderRadius: radius, background: fullFigure ? 'linear-gradient(135deg, color-mix(in oklab, var(--color-primary) 45%, #000), #0b0b10)' : 'linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 45%, #fff))' } },
    fullFigure ? null : h('span', { style: { width: 44, height: 44, borderRadius: 12, border: '2px solid var(--color-primary-content)', opacity: .8 } }));
  const figure = layout.figure ? h('figure', { style: layout.figure === 'padded' ? { padding: '2.5rem 2.5rem 0' } : layout.figure === 'side' ? { width: '40%', maxWidth: '10rem', flexShrink: 0 } : undefined },
    cta.image ? h('img', { src: cta.image, alt: '', style: layout.figure === 'padded' ? { borderRadius: '.75rem' } : layout.figure === 'side' ? { width: '100%', height: '100%', objectFit: 'cover' } : { width: '100%' } }) : fallback(layout.figure === 'padded' ? '.75rem' : 0)) : null;
  const primary = action ? h('span', { className: `dz-btn${layout.plainButton ? '' : ' dz-btn-primary'}${layout.pricing ? ' dz-btn-block' : ''}` }, cta.button_label) : null;
  const secondary = secondaryLabel ? h('span', { className: `dz-btn dz-btn-ghost${layout.pricing ? ' dz-btn-block' : ''}` }, secondaryLabel) : null;
  const overImage = layout.figure === 'top' || fullFigure;
  const close = layout.closeTop ? null : h('span', { className: `dz-btn dz-btn-sm dz-btn-circle${overImage ? '' : ' dz-btn-ghost'}`, style: { position: 'absolute', right: '.5rem', top: '.5rem', zIndex: 1 } }, '✕');
  const lines = String(cta.body || '').split('\n').map(line => line.trim()).filter(Boolean);
  const title = cta.title || 'Tiêu đề CTA';
  const body = layout.pricing ? h('div', { className: 'dz-card-body' },
    h('span', { className: 'dz-badge dz-badge-xs dz-badge-warning' }, LABELS[cta.type]),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', paddingInlineEnd: '2rem' } }, h('h3', { style: { fontSize: '1.875rem', lineHeight: 1.2, fontWeight: 700 } }, title)),
    lines.length ? h('ul', { style: { marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '.5rem', fontSize: '.75rem' } }, lines.map((line, i) => h('li', { key: i, style: { display: 'flex', alignItems: 'center' } }, svg('M5 13l4 4L19 7', { width: '1rem', height: '1rem', marginInlineEnd: '.5rem', color: 'var(--color-success)', flexShrink: 0 }), h('span', null, line)))) : null,
    primary || secondary ? h('div', { style: { marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '.25rem' } }, primary, secondary) : null)
    : h('div', { className: 'dz-card-body', style: layout.center ? { alignItems: 'center', textAlign: 'center' } : undefined },
      layout.closeTop ? h('div', { className: 'dz-card-actions', style: { justifyContent: 'flex-end' } }, h('span', { className: 'dz-btn dz-btn-square dz-btn-sm' }, svg('M6 18L18 6M6 6l12 12', { width: '1.5rem', height: '1.5rem' }))) : null,
      h('h3', { className: 'dz-card-title', style: layout.center || layout.closeTop ? undefined : { paddingInlineEnd: '2rem' } }, title, layout.titleBadge ? h('span', { className: 'dz-badge dz-badge-secondary' }, LABELS[cta.type]) : null),
      cta.body ? h('p', { style: { whiteSpace: 'pre-line' } }, cta.body) : null,
      primary || secondary ? h('div', { className: 'dz-card-actions', style: layout.start ? undefined : { justifyContent: 'flex-end' } }, secondary, primary) : null);
  const background = layout.bg === 'primary' ? { background: 'var(--color-primary)', color: 'var(--color-primary-content)' } : layout.bg === 'neutral' ? { background: 'var(--color-neutral)', color: 'var(--color-neutral-content)' } : { background: 'var(--color-base-100)' };
  return h('div', { className: `dz-theme dz-card dz-card-${cta.size || 'md'}${layout.card ? ` ${layout.card}` : ''}`, style: { width: '24rem', maxWidth: '100%', ...ctaColors(cta), ...background, ...(layout.flat ? {} : { boxShadow: SHADOW_SM }), ...style } },
    close, layout.figure === 'bottom' ? [h(React.Fragment, { key: 'b' }, body), h(React.Fragment, { key: 'f' }, figure)] : [h(React.Fragment, { key: 'f' }, figure), h(React.Fragment, { key: 'b' }, body)]);
}

// The learner page on a 375px phone, scaled down: the CTA where and how it appears.
function CtaPreview({ cta }) {
  const secondaryLabel = secondaryLabelOf(cta);
  const action = cta.type !== 'message' && cta.button_label;
  const overlay = h('div', { className: 'dz-theme dt-cta-overlay', style: ctaColors(cta) },
    h('span', { className: 'dz-btn dz-btn-sm dz-btn-circle', style: { position: 'absolute', right: '.5rem', top: '.5rem' } }, '✕'),
    h('div', { className: 'dz-card-body', style: { '--card-p': '1rem', justifyContent: 'flex-end', color: 'var(--color-neutral-content)' } },
      h('h3', { className: 'dz-card-title', style: { '--cardtitle-fs': '1rem', paddingInlineEnd: '2rem' } }, cta.title || 'Tiêu đề CTA'),
      h('div', { className: 'dz-card-actions', style: { justifyContent: 'flex-end' } }, secondaryLabel ? h('span', { className: 'dz-btn dz-btn-ghost', style: { '--size': 'calc(var(--size-field) * 8)' } }, secondaryLabel) : null, action ? h('span', { className: 'dz-btn dz-btn-primary', style: { '--size': 'calc(var(--size-field) * 8)' } }, cta.button_label) : null)));
  return h('div', { className: 'dt-cta-phone-frame' }, h('div', { className: `dt-cta-phone ${cta.display}` },
    h('div', { className: 'dt-cta-stage' }, h('span', { className: 'dt-cta-video' }, '▶'), cta.display === 'overlay' ? overlay : null),
    cta.display === 'card' ? h('div', { className: 'dt-cta-slot' }, h(DaisyCard, { cta, secondaryLabel, style: { width: '100%', boxShadow: '0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1)' } })) : null,
    h('div', { className: 'dt-cta-lines' }, h('span'), h('span'), h('span')),
    cta.display === 'popup' ? h('div', { className: 'dt-cta-popup' }, h(DaisyCard, { cta, secondaryLabel, style: { boxShadow: '0 20px 25px -5px rgb(0 0 0 / .1), 0 8px 10px -6px rgb(0 0 0 / .1)' } })) : null));
}
