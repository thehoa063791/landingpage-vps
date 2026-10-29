import React from 'react';
import { Select, notify } from './ui.js';
import { lessonCtas, triggerLabel } from './learningCta.js';
import { MediaPicker } from './zoomEvent.js';

const h = React.createElement;
const fmt = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value || 0);
export const clock = value => {
  const total = Math.max(0, Math.round(Number(value) || 0)), hours = Math.floor(total / 3600), rest = total % 3600;
  return `${hours ? `${hours}:${String(Math.floor(rest / 60)).padStart(2, '0')}` : Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`;
};
// "12:34", "1:02:03" or plain seconds → seconds (NaN when unreadable).
export function parseDuration(text) {
  const value = String(text ?? '').trim();
  if (/^\d+$/.test(value)) return Number(value);
  if (!/^\d+(?::[0-5]?\d){1,2}$/.test(value)) return NaN;
  return value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
}
// Learner pages load thumbnails through /<course>/api/learning; admin reads the same file directly.
export const thumbSrc = url => url?.replace(/^\/([a-z0-9-]+)\/api\/learning\//, '/api/learning/$1/') || '';

// The browser crops the chosen image to 16:9 and scales it to 640×360 (the learner page shows it
// at 80×48), as WebP when it can, so the server only stores the bytes.
async function cropImage(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Chọn ảnh JPG, PNG hoặc WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Ảnh quá lớn (tối đa 15 MB).');
  const bitmap = await createImageBitmap(file);
  const width = 640, height = 360, scale = Math.max(width / bitmap.width, height / bitmap.height);
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, (width - bitmap.width * scale) / 2, (height - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
  return blob?.type === 'image/webp' ? blob : new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
}

const SOURCE = { upload: 'Ảnh tải lên', vimeo: 'Ảnh bìa Vimeo' };

// Image of one lesson in the edit dialog: preview at both sizes, upload, take the Vimeo cover again.
// Changes are saved at once (they do not wait for "Lưu").
export function ThumbnailPanel({ lesson, draft, base, apiFetch, ui, canEdit, onChanged }) {
  const { Button } = ui;
  const [working, setWorking] = React.useState('');
  const [error, setError] = React.useState('');
  const [picking, setPicking] = React.useState(false);
  const input = React.useRef(null);
  const url = draft.thumbnail_url || '';
  const source = url ? SOURCE[draft.thumbnail_source] || SOURCE.vimeo : '';
  async function run(kind, work) {
    setWorking(kind); setError('');
    try { const saved = await work(); onChanged(saved); notify(kind === 'upload' ? 'Đã đổi ảnh bài học' : 'Đã lấy ảnh bìa mới từ Vimeo'); }
    catch (e) { setError(e.message); }
    finally { setWorking(''); }
  }
  const upload = file => run('upload', async () => {
    const blob = await cropImage(file);
    return apiFetch(`${base}/lessons/${lesson.id}/thumbnail`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type }, quiet: true });
  });
  // A Media Library image: read from this site (its URL is stored absolute), then cropped and
  // stored like an upload, so learner pages keep loading thumbnails from the course path.
  const fromLibrary = address => { setPicking(false); run('upload', async () => {
    let path = address;
    try { const url = new URL(address, location.origin); path = url.pathname + url.search; } catch { /* relative already */ }
    const response = await fetch(path, { credentials: 'include' });
    if (!response.ok) throw new Error(`Không đọc được ảnh trong thư viện (${response.status}).`);
    const blob = await cropImage(await response.blob());
    return apiFetch(`${base}/lessons/${lesson.id}/thumbnail`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type }, quiet: true });
  }); };
  const fromVimeo = () => run('vimeo', () => apiFetch(`${base}/lessons/${lesson.id}/thumbnail/vimeo`, { method: 'POST', quiet: true }));
  return h('section', { className: 'ls-thumb-panel', 'aria-labelledby': 'ls-thumb-title' },
    h('div', { className: 'ls-thumb-head' }, h('h3', { id: 'ls-thumb-title' }, 'Ảnh bài học'), source ? h('span', { className: `ls-source is-${draft.thumbnail_source === 'upload' ? 'upload' : 'vimeo'}` }, source) : null),
    h('div', {
      className: `ls-thumb-large${url ? '' : ' is-empty'}${working ? ' is-working' : ''}`,
      onDragOver: e => { if (canEdit && lesson?.id) e.preventDefault(); },
      onDrop: e => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (canEdit && lesson?.id && file) upload(file); },
    }, url ? h('img', { src: thumbSrc(url), alt: '' }) : h('span', null, 'Chưa có ảnh'), working ? h('span', { className: 'ls-thumb-busy' }, working === 'upload' ? 'Đang tải ảnh lên…' : 'Đang lấy từ Vimeo…') : null),
    h('div', { className: 'ls-thumb-mini', 'aria-label': 'Ảnh trên trang học' },
      h('span', { className: 'ls-mini-img' }, url ? h('img', { src: thumbSrc(url), alt: '' }) : h('span', null, '01')),
      h('span', null, h('small', null, 'Trên trang học'), h('strong', null, draft.title || 'Tên bài giảng'))),
    canEdit ? lesson?.id ? h(React.Fragment, null,
      h('div', { className: 'ls-thumb-actions' },
        h('input', { ref: input, type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true, onChange: e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload(file); } }),
        h(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: !!working, onClick: () => input.current?.click() }, 'Tải ảnh lên'),
        h(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: !!working, onClick: () => setPicking(true) }, 'Chọn từ thư viện'),
        h(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: !!working, onClick: fromVimeo }, draft.thumbnail_source === 'upload' ? 'Dùng ảnh bìa Vimeo' : 'Lấy lại từ Vimeo')),
      h('p', { className: 'dt-muted' }, 'Ảnh tự lấy từ ảnh bìa của video trên Vimeo. Đổi ảnh bìa trên Vimeo rồi bấm "Lấy lại", hoặc tải/kéo thả ảnh riêng hay chọn ảnh trong thư viện: ảnh được cắt về 16:9 và lưu ngay.'),
      picking ? h(MediaPicker, { apiFetch, ui, folder: '', title: `Ảnh bài học · ${draft.title || ''}`, onClose: () => setPicking(false), onPick: fromLibrary }) : null)
      : h('p', { className: 'dt-muted' }, url ? 'Ảnh bìa Vimeo của video này. Sau khi lưu bài có thể tải ảnh riêng.' : 'Bấm "Lấy từ Vimeo" để xem ảnh bìa. Sau khi lưu bài có thể tải ảnh riêng.') : null,
    error ? h('p', { role: 'alert', className: 'state-error' }, error) : null);
}

// Chapters with their lessons in one list: order, visibility, chapter, image, numbers and CTA.
export function LessonList({ lessons, stages, ctas, course, canEdit, busy, ui, onEdit, onRemove, onMove, onToggle, onAssign, onAdd, onQuickAdd, onRefreshAll }) {
  const { Button, Badge, Input } = ui;
  const [selected, setSelected] = React.useState([]);
  const [target, setTarget] = React.useState('');
  const [closed, setClosed] = React.useState({});
  const [dragging, setDragging] = React.useState(null);
  const [over, setOver] = React.useState('');
  const groups = [...stages, { id: 0, title: 'Chưa phân chương', unclassified: true }].map(s => ({ ...s, lessons: lessons.filter(l => Number(l.stage_id || 0) === Number(s.id)) })).filter(s => !s.unclassified || s.lessons.length);
  const selectedIds = lessons.filter(l => selected.includes(l.id)).map(l => l.id);
  const stageOptions = [['unclassified', 'Chưa phân chương'], ...stages.map(s => [String(s.id), s.title])];
  const noImage = lessons.filter(l => !l.thumbnail_url).length;
  const drop = (e, kind, id, stageId) => {
    e.preventDefault(); e.stopPropagation(); setOver('');
    if (!canEdit || !dragging) return;
    if (dragging.kind === 'lessons' && kind === 'chapter') onMove('chapter', dragging.id, 0, stageId);
    else if (dragging.kind === kind && dragging.id !== id) onMove(kind, dragging.id, 0, id);
    setDragging(null);
  };
  const dragProps = (kind, id, stageId) => canEdit ? {
    onDragOver: e => { if (dragging && (dragging.kind === kind || (dragging.kind === 'lessons' && kind === 'chapter'))) { e.preventDefault(); setOver(`${kind}:${id}`); } },
    onDragLeave: () => setOver(o => o === `${kind}:${id}` ? '' : o),
    onDrop: e => drop(e, kind, id, stageId),
  } : {};
  let number = 0;
  return h('div', { className: 'ls-list' },
    h('div', { className: 'ls-toolbar' },
      h('div', null, h('h3', null, 'Chương và bài giảng'),
        h('p', { className: 'dt-muted' }, `${lessons.length} bài · ${stages.length} chương${canEdit ? ' · kéo ⠿ để sắp xếp, thả bài vào tên chương để chuyển chương' : ''}`)),
      canEdit ? h('div', { className: 'dt-actions' },
        h(Button, { variant: 'outline', disabled: busy || !lessons.length, title: 'Tải lại ảnh bìa Vimeo cho các bài không dùng ảnh tải lên', onClick: onRefreshAll }, noImage ? `Cập nhật ảnh từ Vimeo (${noImage} bài chưa có)` : 'Cập nhật ảnh từ Vimeo'),
        h(Button, { variant: 'outline', disabled: busy, onClick: () => onAdd('stage') }, '+ Thêm chương'),
        h(Button, { disabled: busy, onClick: onQuickAdd }, '+ Thêm bài')) : null),
    canEdit && selectedIds.length ? h('div', { className: 'ls-selection', role: 'region', 'aria-label': 'Bài đã chọn' },
      h('strong', null, `Đã chọn ${selectedIds.length} bài`),
      h(Select, { value: target, 'aria-label': 'Chuyển vào chương', onChange: e => setTarget(e.target.value) }, h('option', { value: '' }, 'Chuyển vào chương…'), ...stageOptions.map(([id, text]) => h('option', { key: id, value: id }, text))),
      h(Button, { size: 'sm', disabled: busy || !target, onClick: async () => { if (await onAssign(selectedIds, target === 'unclassified' ? null : target)) { setSelected([]); setTarget(''); } } }, 'Chuyển'),
      h(Button, { size: 'sm', variant: 'ghost', onClick: () => setSelected([]) }, 'Bỏ chọn')) : null,
    groups.length && lessons.length + stages.length ? groups.map((s, stageIndex) => {
      const open = !closed[s.id], seconds = s.lessons.reduce((sum, l) => sum + Number(l.duration || 0), 0);
      const allChosen = s.lessons.length && s.lessons.every(l => selected.includes(l.id));
      return h('section', { key: s.id, className: `ls-chapter${s.is_visible === false ? ' is-hidden' : ''}` },
        h('div', { className: `ls-chapter-head${over === `chapter:${s.id}` ? ' is-over' : ''}`, draggable: canEdit && !busy && !s.unclassified, onDragStart: () => setDragging({ kind: 'stages', id: s.id }), onDragEnd: () => { setDragging(null); setOver(''); }, ...dragProps('chapter', s.id, s.id || null), ...(s.unclassified ? {} : dragProps('stages', s.id)) },
          canEdit && s.lessons.length ? h('input', { type: 'checkbox', className: 'ls-check', 'aria-label': `Chọn các bài của ${s.title}`, checked: !!allChosen, onChange: e => setSelected(ids => e.target.checked ? [...new Set([...ids, ...s.lessons.map(l => l.id)])] : ids.filter(id => !s.lessons.some(l => l.id === id))) }) : h('span', { className: 'ls-check' }),
          canEdit && !s.unclassified ? h('span', { className: 'ls-handle', 'aria-hidden': true }, '⠿') : null,
          h('button', { type: 'button', className: 'ls-chapter-title', 'aria-expanded': open, onClick: () => setClosed(c => ({ ...c, [s.id]: open })) },
            h('span', { 'aria-hidden': true }, open ? '▾' : '▸'), h('strong', null, s.title), h('span', { className: 'dt-muted' }, `${s.lessons.length} bài · ${clock(seconds)}`)),
          s.is_visible === false ? h(Badge, null, 'Chương đang ẩn') : null,
          canEdit && !s.unclassified ? h('div', { className: 'ls-tools' },
            h(Button, { variant: 'ghost', size: 'sm', disabled: busy || !stageIndex, 'aria-label': `Đưa chương ${s.title} lên`, onClick: () => onMove('stages', s.id, -1) }, '↑'),
            h(Button, { variant: 'ghost', size: 'sm', disabled: busy || stageIndex === stages.length - 1, 'aria-label': `Đưa chương ${s.title} xuống`, onClick: () => onMove('stages', s.id, 1) }, '↓'),
            h(Button, { variant: 'ghost', size: 'sm', disabled: busy, onClick: () => onToggle('stages', s, 'is_visible') }, s.is_visible === false ? 'Hiện' : 'Ẩn'),
            h(Button, { variant: 'ghost', size: 'sm', onClick: () => onEdit('stage', s) }, 'Sửa'),
            h(Button, { variant: 'ghost', size: 'sm', className: 'ls-danger', onClick: () => onRemove('stages', s) }, 'Xóa')) : null),
        open ? s.lessons.length ? h('ol', { className: 'ls-rows' }, s.lessons.map((l, i) => {
          number++;
          const hidden = l.is_visible === false, attached = lessonCtas(ctas, course, l);
          return h('li', { key: l.id, className: `ls-row${hidden ? ' is-hidden' : ''}${selected.includes(l.id) ? ' is-selected' : ''}${over === `lessons:${l.id}` ? ' is-over' : ''}`, draggable: canEdit && !busy, onDragStart: e => { e.stopPropagation(); setDragging({ kind: 'lessons', id: l.id }); }, onDragEnd: () => { setDragging(null); setOver(''); }, ...dragProps('lessons', l.id) },
            canEdit ? h('input', { type: 'checkbox', className: 'ls-check', 'aria-label': `Chọn ${l.title}`, checked: selected.includes(l.id), onChange: e => setSelected(ids => e.target.checked ? [...ids, l.id] : ids.filter(id => id !== l.id)) }) : null,
            canEdit ? h('span', { className: 'ls-handle', 'aria-hidden': true }, '⠿') : null,
            h('button', { type: 'button', className: `ls-thumb${l.thumbnail_url ? '' : ' is-empty'}`, disabled: !canEdit, 'aria-label': `Ảnh của ${l.title}${canEdit ? ': bấm để đổi' : ''}`, onClick: () => onEdit('lesson', l, 'image') },
              l.thumbnail_url ? h('img', { src: thumbSrc(l.thumbnail_url), alt: '', loading: 'lazy' }) : h('span', null, 'Chưa có ảnh'),
              l.thumbnail_source === 'upload' && l.thumbnail_url ? h('span', { className: 'ls-thumb-tag' }, 'Ảnh riêng') : null,
              canEdit ? h('span', { className: 'ls-thumb-edit', 'aria-hidden': true }, 'Đổi ảnh') : null),
            h('div', { className: 'ls-main' },
              h('div', { className: 'ls-title' }, h('span', { className: 'ls-number' }, number), h('strong', null, l.title), hidden ? h(Badge, null, 'Đang ẩn') : null),
              h('div', { className: 'ls-meta' }, h('span', null, clock(l.duration)), h('span', null, `Vimeo ${String(l.vimeo_video_id).split('/')[0]}`),
                hidden ? null : h('span', null, `${fmt(l.viewers)} người xem · xem TB ${Math.round(l.avg_watch_percent || 0)}% · hoàn thành ${Math.round(l.completion_rate || 0)}%`)),
              attached.length ? h('div', { className: 'ls-ctas' }, attached.map(cta => h(Badge, { key: cta.id, tone: cta.enabled ? 'info' : 'neutral' }, `CTA: ${cta.name} · ${triggerLabel(cta)}${cta.enabled ? '' : ' (tắt)'}`))) : null),
            canEdit ? h('label', { className: 'ls-switch', title: hidden ? 'Bài đang ẩn khỏi trang học' : 'Bài đang hiện trên trang học' }, h(Input, { type: 'checkbox', role: 'switch', checked: !hidden, disabled: busy, onChange: () => onToggle('lessons', l, 'is_visible'), 'aria-label': `Hiện ${l.title} trên trang học` }), h('span', null, hidden ? 'Ẩn' : 'Hiện')) : null,
            canEdit ? h('div', { className: 'ls-tools' },
              h(Button, { variant: 'ghost', size: 'sm', disabled: busy || !i, 'aria-label': `Đưa bài ${l.title} lên`, onClick: () => onMove('lessons', l.id, -1) }, '↑'),
              h(Button, { variant: 'ghost', size: 'sm', disabled: busy || i === s.lessons.length - 1, 'aria-label': `Đưa bài ${l.title} xuống`, onClick: () => onMove('lessons', l.id, 1) }, '↓'),
              h(Button, { variant: 'outline', size: 'sm', onClick: () => onEdit('lesson', l) }, 'Sửa'),
              h(Button, { variant: 'ghost', size: 'sm', className: 'ls-danger', 'aria-label': `Xóa ${l.title}`, onClick: () => onRemove('lessons', l) }, 'Xóa')) : null);
        })) : h('p', { className: 'ls-empty-chapter' }, canEdit ? 'Chưa có bài. Kéo bài vào đây hoặc chọn bài rồi "Chuyển vào chương".' : 'Chưa có bài.') : null);
    }) : h('div', { className: 'ls-empty' }, h('strong', null, 'Chưa có bài giảng'), h('p', { className: 'dt-muted' }, 'Dán link Vimeo để thêm bài: tên, thời lượng và ảnh bìa được lấy tự động.'), canEdit ? h(Button, { onClick: onQuickAdd }, '+ Thêm bài từ link Vimeo') : null));
}
