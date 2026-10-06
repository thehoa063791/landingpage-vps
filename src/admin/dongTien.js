import React from 'react';
import { Select, Overlay, confirmAction, notify, Skeleton, EmptyState } from './ui.js';
import './dongTien.css';

const h = React.createElement;
const BASE = '/admin/funnels/dong-tien/learning';
const fmt = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value || 0);
const pct = value => `${Math.round(value || 0)}%`;
const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const seconds = value => `${Math.floor((value || 0) / 60)}:${String(Math.floor((value || 0) % 60)).padStart(2, '0')}`;

export default function DongTienLearning({ apiFetch, ui, canEdit }) {
  const { Button, Card, Input, Field, Badge, downloadCsv } = ui;
  const [tab, setTab] = React.useState('overview');
  const [userTab, setUserTab] = React.useState('students');
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [revision, setRevision] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [region, setRegion] = React.useState('');
  const [lessonId, setLessonId] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [dates, setDates] = React.useState({ from: '', to: '' });
  const [dialog, setDialog] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [formError, setFormError] = React.useState('');
  const [dragging, setDragging] = React.useState(null);
  const [chapterFilter, setChapterFilter] = React.useState('');
  const [selectedLessons, setSelectedLessons] = React.useState([]);
  const [batchChapter, setBatchChapter] = React.useState('');
  const reload = () => setRevision(value => value + 1);
  React.useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (dates.from) params.set('dateFrom', `${dates.from}T00:00:00+07:00`);
    if (dates.to) params.set('dateTo', `${dates.to}T23:59:59.999+07:00`);
    setLoading(true); setError('');
    apiFetch(`${BASE}?${params}`).then(value => { if (!cancelled) { setData(value); setLoading(false); } }).catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [apiFetch, dates.from, dates.to, revision]);
  React.useEffect(() => setPage(1), [query, region, lessonId, status, userTab]);
  async function mutate(path, method, body, close = true) {
    setBusy(true); setFormError('');
    try {
      await apiFetch(BASE + path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (close) setDialog(null);
      notify('Đã lưu thay đổi'); reload(); return true;
    } catch (e) { setFormError(e.message); notify(e.message, true); return false; }
    finally { setBusy(false); }
  }
  function edit(kind, row) {
    setFormError('');
    setDialog({ kind, id: row?.id });
    setDraft(kind === 'stage' ? { title: '', is_visible: true, position: (data?.stages.length || 0) + 1, ...row } : { title: '', vimeo_video_id: '', duration: '', position: (data?.lessons.length || 0) + 1, stage_id: '', description: '', is_visible: true, show_popup: false, show_unlock_time: false, unlock_after_seconds: 60, ...row, questions: row?.hidden_content ? JSON.parse(row.hidden_content).questions : [] });
  }
  async function remove(kind, row) {
    if (!await confirmAction(kind === 'stages' ? 'Xóa chương? Các bài trong chương sẽ chuyển về chưa phân loại. Tiến độ học được giữ lại.' : 'Xóa bài giảng? Bài sẽ ẩn khỏi trang học. Tiến độ và lịch sử đã lưu được giữ lại.', true)) return;
    await mutate(`/${kind}/${row.id}`, 'DELETE');
  }
  async function move(kind, id, offset, targetId) {
    const chapter = data.lessons.find(l => l.id === id)?.stage_id || null;
    const rows = kind === 'lessons' ? data.lessons.filter(l => (l.stage_id || null) === chapter) : data[kind];
    const ids = rows.map(row => row.id);
    const from = ids.indexOf(id), to = targetId ? ids.indexOf(targetId) : from + offset;
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    ids.splice(from, 1); ids.splice(to, 0, id);
    const members = new Set(ids);
    let index = 0;
    const order = kind === 'lessons' ? data.lessons.map(l => members.has(l.id) ? ids[index++] : l.id) : ids;
    await mutate(`/${kind}/reorder`, 'POST', { ids: order }, false);
  }
  function toggle(kind, row, key) { return mutate(`/${kind}/${row.id}`, 'PATCH', { [key]: !row[key] }, false); }
  async function openVimeo() {
    setBusy(true);
    try { const source = await apiFetch(BASE + '/vimeo-catalog'); setDialog({ kind: 'vimeo', source }); setDraft({ ids: [], stage_id: '', is_visible: true }); setFormError(''); }
    catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  }
  const lessons = data?.lessons || [], stages = data?.stages || [], students = data?.students || [], history = data?.history || [];
  const chapterGroups = [...stages, { id: 0, title: 'Chưa phân chương', is_visible: true }].filter(s => !chapterFilter || String(s.id || 'unclassified') === chapterFilter).map(s => ({ ...s, lessons: lessons.filter(l => Number(l.stage_id || 0) === s.id) }));
  const displayedLessons = chapterGroups.flatMap(s => s.lessons);
  const selectedIds = lessons.filter(l => selectedLessons.includes(l.id)).map(l => l.id);
  const thumb = url => url?.replace('/dong-tien/api/learning/', '/api/dong-tien/');
  const match = row => (!region || row.region === region) && (!query || [row.name, row.email, row.phone].some(value => String(value || '').toLowerCase().includes(query.toLowerCase())));
  const studentRows = students.filter(row => {
    if (!match(row)) return false;
    const progress = lessonId ? row.lessons.find(l => l.lesson_id === Number(lessonId)) : null;
    if (lessonId && !progress) return false;
    if (status === 'completed') return lessonId ? progress.completed : row.total_lessons > 0 && row.completed === row.total_lessons;
    if (status === 'started') return lessonId ? !progress.completed && (progress.opened || progress.watched_seconds > 0) : row.lessons.some(l => l.opened || l.watched_seconds > 0) && row.completed < row.total_lessons;
    if (status === 'not-started') return lessonId ? !progress.opened && !progress.watched_seconds : row.lessons.every(l => !l.opened && !l.watched_seconds);
    return true;
  });
  const historyRows = history.filter(row => match(row) && (!lessonId || row.lesson_id === Number(lessonId)) && (!status || status === 'completed' && row.completed || status === 'started' && !row.completed));
  const tableRows = userTab === 'students' ? studentRows : historyRows;
  const pages = Math.max(1, Math.ceil(tableRows.length / 20));
  const shown = tableRows.slice((Math.min(page, pages) - 1) * 20, Math.min(page, pages) * 20);
  const lessonStats = lessons.filter(l => !lessonId || Number(l.id) === Number(lessonId)).map(l => {
    if (!region) return l;
    const ids = new Set(students.filter(s => s.region === region).map(s => s.id));
    const viewers = l.learner_ids.filter(id => ids.has(id)).length;
    const completed = students.filter(s => ids.has(s.id) && s.lessons.find(p => p.lesson_id === Number(l.id))?.completed).length;
    return { ...l, viewers, completed, completion_rate: viewers ? completed / viewers * 100 : 0 };
  });
  const progressBar = value => h('span', { className: 'dt-progress' }, h('span', { style: { width: `${Math.max(0, Math.min(100, value || 0))}%` } }));
  const select = (value, onChange, label, options) => h(Select, { value, onChange: e => onChange(e.target.value), 'aria-label': label }, h('option', { value: '' }, label), ...options.map(([id, text]) => h('option', { key: id, value: String(id) }, text)));
  const filters = h('div', { className: 'dt-filters' },
    tab === 'students' ? h(Input, { placeholder: 'Tìm theo tên, email hoặc số điện thoại', value: query, onChange: e => setQuery(e.target.value), 'aria-label': 'Tìm học viên' }) : null,
    select(region, setRegion, 'Tất cả khu vực', ['Hà Nội', 'Hồ Chí Minh', 'Khu vực khác'].map(r => [r, r])),
    select(lessonId, setLessonId, 'Tất cả bài học', lessons.map(l => [l.id, l.title])),
    tab === 'students' ? select(status, setStatus, 'Tất cả tiến độ', [['completed', 'Đã hoàn thành'], ['started', 'Đang học'], ['not-started', 'Chưa xem']]) : null,
    h(Button, { variant: 'outline', onClick: () => { setQuery(''); setRegion(''); setLessonId(''); setStatus(''); } }, 'Xóa bộ lọc'),
    tab === 'students' ? h(Button, { variant: 'outline', onClick: () => downloadCsv('dong-tien-hoc-vien.csv', [
      { label: 'Họ tên', value: r => r.name }, { label: 'Email', value: r => r.email }, { label: 'Số điện thoại', value: r => r.phone }, { label: 'Khu vực', value: r => r.region }, { label: 'Đăng ký', value: r => r.registered_at }, { label: 'Bài hoàn thành', value: r => r.completed }, { label: 'Tổng bài', value: r => r.total_lessons }, { label: 'Tỷ lệ', value: r => pct(r.completion_percent) },
    ], studentRows) }, 'Xuất CSV (Excel)') : null);
  function studentTable(rows) {
    return h('div', { className: 'table-shell' }, h('table', { className: 'react-table' },
      h('thead', null, h('tr', null, ...['Học viên', 'Tham gia', 'Hoàn thành bài giảng', 'Hành động'].map(t => h('th', { key: t }, t)))),
      h('tbody', null, rows.map(row => h('tr', { key: row.id },
        h('td', null, h('strong', null, row.name), h('small', { className: 'dt-contact' }, row.email), h('small', { className: 'dt-contact' }, `${row.phone || '—'} · ${row.region}`)),
        h('td', null, date(row.registered_at)), h('td', null, progressBar(row.completion_percent), h('span', null, ` ${row.completed}/${row.total_lessons} (${pct(row.completion_percent)})`)),
        h('td', null, h(Button, { variant: 'outline', size: 'sm', onClick: () => setDialog({ kind: 'student', row }) }, 'Chi tiết'))
      )))));
  }
  const panel = loading ? h(Skeleton) : error ? h('div', { role: 'alert', className: 'state-error' }, error, h(Button, { onClick: reload }, 'Thử lại')) : tab === 'overview' ? h(React.Fragment, null,
    h('div', { className: 'dt-stat-grid' }, [['Tổng học viên', fmt(data.summary.students)], ['Tổng lượt mở bài học', fmt(data.summary.sessions)], ['Hoàn thành tất cả video', pct(data.summary.completion_rate)]].map(([label, value]) => h(Card, { key: label, className: 'dt-stat' }, h('small', null, label), h('strong', null, value))),
      h(Card, { className: 'dt-stat' }, h('small', null, 'Phân bố khu vực'), data.summary.regions.map(r => h('div', { key: r.name }, h('div', { className: 'dt-region' }, h('span', null, r.name), h('span', null, `${fmt(r.count)} (${pct(data.summary.students ? r.count / data.summary.students * 100 : 0)})`)), progressBar(data.summary.students ? r.count / data.summary.students * 100 : 0))))),
    h(Card, { className: 'dt-panel' }, h('div', { className: 'dt-row' }, h('div', null, h('h3', null, 'Dữ liệu xem và hoàn thành bài giảng'), h('p', null, 'Bấm vào bài học để xem danh sách học viên.')), filters),
      h('div', { className: 'table-shell' }, h('table', { className: 'react-table' }, h('thead', null, h('tr', null, ...['#', 'Tên bài học', 'Số người xem', 'Số hoàn thành', 'Tỷ lệ hoàn thành'].map(t => h('th', { key: t }, t)))), h('tbody', null, lessonStats.map((l, i) => h('tr', { key: l.id }, h('td', null, i + 1), h('td', null, h(Button, { variant: 'ghost', onClick: () => setDialog({ kind: 'viewers', row: l }) }, l.title), l.is_visible === false ? h(Badge, null, 'Ẩn') : null), h('td', null, fmt(l.viewers)), h('td', null, fmt(l.completed)), h('td', null, progressBar(l.completion_rate), ` ${pct(l.completion_rate)}`)))))))
  ) : tab === 'students' ? h(React.Fragment, null,
    h('div', { className: 'settings-tabs', role: 'tablist', 'aria-label': 'Thống kê học viên' }, [['students', `Danh sách học viên (${students.length})`], ['history', `Lịch sử mở video (${history.length})`]].map(([id, label]) => h('button', { key: id, role: 'tab', 'aria-selected': userTab === id, className: userTab === id ? 'active' : '', onClick: () => setUserTab(id) }, label))),
    filters,
    h(Card, null, shown.length ? userTab === 'students' ? studentTable(shown) : h('div', { className: 'table-shell' }, h('table', { className: 'react-table' }, h('thead', null, h('tr', null, ...['Học viên', 'Bài học', 'Thời điểm mở', 'Tiến độ hiện tại', 'Hành động'].map(t => h('th', { key: t }, t)))), h('tbody', null, shown.map((row, i) => h('tr', { key: `${row.id}-${i}` }, h('td', null, row.name, h('small', { className: 'dt-contact' }, row.email)), h('td', null, row.title), h('td', null, date(row.opened_at)), h('td', null, progressBar(row.watch_percent), ` ${pct(row.watch_percent)}`, row.completed ? ' · Hoàn thành' : ''), h('td', null, h(Button, { variant: 'outline', size: 'sm', onClick: () => setDialog({ kind: 'student', row: students.find(s => s.id === row.registration_id) }) }, 'Chi tiết'))))))) : h(EmptyState, { title: 'Không có học viên phù hợp', onClear: () => { setQuery(''); setRegion(''); setLessonId(''); setStatus(''); } })),
    h('div', { className: 'dt-pagination' }, h('span', null, `${fmt(tableRows.length)} kết quả · Trang ${Math.min(page, pages)}/${pages}`), h(Button, { variant: 'outline', disabled: page <= 1, onClick: () => setPage(p => p - 1) }, 'Trước'), h(Button, { variant: 'outline', disabled: page >= pages, onClick: () => setPage(p => p + 1) }, 'Sau'))
  ) : h(React.Fragment, null,
    h(Card, { className: 'dt-panel' }, h('div', { className: 'dt-row' }, h('div', null, h('h3', null, 'Quản lý chương'), h('p', null, 'Kéo thả hoặc dùng nút lên/xuống để sắp xếp.')), canEdit ? h(Button, { onClick: () => edit('stage') }, '+ Thêm chương') : null),
      stages.length ? stages.map((s, i) => h('div', { key: s.id, className: 'dt-stage', draggable: canEdit && !busy, onDragStart: () => setDragging({ kind: 'stages', id: s.id }), onDragOver: e => e.preventDefault(), onDrop: e => { e.preventDefault(); if (dragging?.kind === 'stages') move('stages', dragging.id, 0, s.id); setDragging(null); } },
        h('span', null, `⠿ ${i + 1}. ${s.title} (${lessons.filter(l => Number(l.stage_id) === Number(s.id)).length} bài)`), h('div', { className: 'dt-actions' }, h(Badge, { tone: s.is_visible ? 'success' : 'neutral' }, s.is_visible ? 'Hiển thị' : 'Ẩn'), canEdit ? h(React.Fragment, null, h(Button, { variant: 'outline', size: 'sm', disabled: busy || !i, 'aria-label': `Đưa chương ${s.title} lên`, onClick: () => move('stages', s.id, -1) }, '↑'), h(Button, { variant: 'outline', size: 'sm', disabled: busy || i === stages.length - 1, 'aria-label': `Đưa chương ${s.title} xuống`, onClick: () => move('stages', s.id, 1) }, '↓'), h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => toggle('stages', s, 'is_visible') }, s.is_visible ? 'Ẩn chương' : 'Hiện chương'), h(Button, { variant: 'outline', size: 'sm', onClick: () => edit('stage', s) }, 'Sửa'), h(Button, { variant: 'outline', size: 'sm', onClick: () => remove('stages', s) }, 'Xóa')) : null))) : h('p', null, 'Chưa có chương. Các bài hiện tại nằm trong nhóm chưa phân loại.')),
    h('div', { className: 'dt-row' }, h('h3', null, `Danh sách bài giảng (${lessons.length})`), canEdit ? h(Button, { onClick: () => edit('lesson') }, '+ Thêm bài giảng') : null),
    h('div', { className: 'dt-filters' }, select(chapterFilter, setChapterFilter, 'Tất cả chương', [['unclassified', 'Chưa phân chương'], ...stages.map(s => [s.id, s.title])]),
      canEdit ? h(React.Fragment, null,
        h(Button, { variant: 'outline', disabled: busy || !displayedLessons.length, onClick: () => setSelectedLessons(displayedLessons.every(l => selectedLessons.includes(l.id)) ? [] : displayedLessons.map(l => l.id)) }, displayedLessons.length && displayedLessons.every(l => selectedLessons.includes(l.id)) ? 'Bỏ chọn tất cả' : 'Chọn tất cả bài'),
        select(batchChapter, setBatchChapter, 'Chọn chương để phân loại', [['unclassified', 'Chưa phân chương'], ...stages.map(s => [s.id, s.title])]),
        h(Button, { disabled: busy || !selectedIds.length || !batchChapter, onClick: async () => { if (await mutate('/lessons/assign', 'POST', { ids: selectedIds, stage_id: batchChapter === 'unclassified' ? null : batchChapter }, false)) setSelectedLessons([]); } }, `Phân ${selectedIds.length} bài vào chương`)
      ) : null),
    ...chapterGroups.filter(s => s.lessons.length).map(s => h('section', { key: s.id, className: 'dt-chapter' },
      h('div', { className: 'dt-row dt-chapter-heading', onDragOver: e => e.preventDefault(), onDrop: e => { e.preventDefault(); if (canEdit && dragging?.kind === 'lessons') mutate(`/lessons/${dragging.id}`, 'PATCH', { stage_id: s.id || null }, false); setDragging(null); } }, h('h3', null, `${s.title} (${s.lessons.length} bài)`), s.is_visible === false ? h(Badge, null, 'Chương đang ẩn') : null),
    h('div', { className: 'dt-lesson-grid' }, s.lessons.map((l, i) => h(Card, { key: l.id, className: 'dt-lesson', draggable: canEdit && !busy, onDragStart: () => setDragging({ kind: 'lessons', id: l.id }), onDragOver: e => e.preventDefault(), onDrop: e => { e.preventDefault(); e.stopPropagation(); if (dragging?.kind === 'lessons') move('lessons', dragging.id, 0, l.id); setDragging(null); } },
      l.thumbnail_url ? h('img', { src: thumb(l.thumbnail_url), alt: l.title, className: 'dt-lesson-thumbnail', loading: 'lazy' }) : null,
      canEdit ? h('label', { className: 'dt-check' }, h(Input, { type: 'checkbox', checked: selectedLessons.includes(l.id), onChange: e => setSelectedLessons(ids => e.target.checked ? [...ids, l.id] : ids.filter(id => id !== l.id)) }), 'Chọn bài') : null,
      h('small', null, `⠿ ID: ${l.id} · Thứ tự ${i + 1}`), h('h3', null, l.title), h('p', null, `Vimeo ID: ${l.vimeo_video_id}`), h('p', null, `Thời lượng: ${seconds(l.duration)} · Hiện khảo sát: ${seconds(l.unlock_after_seconds)}`),
      h('div', { className: 'dt-actions' }, canEdit ? select(String(l.stage_id || ''), value => mutate(`/lessons/${l.id}`, 'PATCH', { stage_id: value }, false), 'Chưa phân loại', stages.map(s => [s.id, s.title])) : h('span', null, l.stage_title || 'Chưa phân loại'), h(Badge, { tone: l.is_visible ? 'success' : 'neutral' }, l.is_visible ? 'Công khai' : 'Đang ẩn'), h(Badge, null, l.show_popup ? 'Hiện khảo sát' : 'Ẩn khảo sát')),
      canEdit ? h('div', { className: 'dt-actions dt-lesson-tools' }, h(Button, { variant: 'outline', size: 'sm', disabled: busy || !i, 'aria-label': `Đưa bài ${l.title} lên`, onClick: () => move('lessons', l.id, -1) }, '↑'), h(Button, { variant: 'outline', size: 'sm', disabled: busy || i === s.lessons.length - 1, 'aria-label': `Đưa bài ${l.title} xuống`, onClick: () => move('lessons', l.id, 1) }, '↓'), h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => toggle('lessons', l, 'is_visible') }, l.is_visible ? 'Ẩn bài' : 'Hiện bài'), h(Button, { variant: 'outline', size: 'sm', disabled: busy, onClick: () => toggle('lessons', l, 'show_popup') }, l.show_popup ? 'Ẩn khảo sát' : 'Hiện khảo sát'), h(Button, { variant: 'outline', size: 'sm', onClick: () => edit('lesson', l) }, 'Sửa'), h(Button, { variant: 'outline', size: 'sm', onClick: () => remove('lessons', l) }, 'Xóa')) : null
    )))))
  );

  function questionChange(index, key, value) { setDraft(d => ({ ...d, questions: d.questions.map((q, i) => i === index ? { ...q, [key]: value } : q) })); }
  const editor = dialog?.kind === 'stage' || dialog?.kind === 'lesson' ? h('form', { onSubmit: e => {
    e.preventDefault();
    const body = { ...draft, ...(dialog.kind === 'lesson' ? { hidden_content: { questions: draft.questions }, unlock_after_seconds: draft.show_popup ? Number(draft.unlock_after_seconds) : Math.min(Number(draft.unlock_after_seconds || 0), Number(draft.duration)) } : {}) };
    mutate(`/${dialog.kind === 'stage' ? 'stages' : 'lessons'}${dialog.id ? `/${dialog.id}` : ''}`, dialog.id ? 'PATCH' : 'POST', body);
  } },
    h('div', { className: 'dt-form-grid' },
      h(Field, { label: dialog.kind === 'stage' ? 'Tên chương' : 'Tên bài giảng' }, h(Input, { required: true, value: draft.title, onChange: e => setDraft(d => ({ ...d, title: e.target.value })) })),
      h(Field, { label: 'Thứ tự' }, h(Input, { type: 'number', min: 1, required: true, value: draft.position, onChange: e => setDraft(d => ({ ...d, position: e.target.value })) })),
      dialog.kind === 'lesson' ? h(React.Fragment, null,
        h(Field, { label: 'Vimeo ID (kèm /hash nếu riêng tư)' }, h(Input, { required: true, value: draft.vimeo_video_id, onChange: e => setDraft(d => ({ ...d, vimeo_video_id: e.target.value })) })),
        h(Field, { label: 'Thời lượng video (giây)' }, h(Input, { type: 'number', min: 1, required: true, value: draft.duration, onChange: e => setDraft(d => ({ ...d, duration: e.target.value })) })),
        h(Field, { label: 'Chương' }, select(String(draft.stage_id || ''), value => setDraft(d => ({ ...d, stage_id: value })), 'Chưa phân loại', stages.map(s => [s.id, s.title]))),
        h(Field, { label: 'Hiện khảo sát sau (giây)' }, h(Input, { type: 'number', min: 0, max: draft.duration || undefined, value: draft.unlock_after_seconds, onChange: e => setDraft(d => ({ ...d, unlock_after_seconds: e.target.value })) })),
        h(Field, { label: 'Nội dung bài học' }, h('textarea', { className: 'ui-input', rows: 3, value: draft.description, onChange: e => setDraft(d => ({ ...d, description: e.target.value })) }))
      ) : null),
    h('div', { className: 'dt-actions' }, h('label', { className: 'dt-check' }, h(Input, { type: 'checkbox', checked: draft.is_visible, onChange: e => setDraft(d => ({ ...d, is_visible: e.target.checked })) }), 'Hiển thị công khai'), dialog.kind === 'lesson' ? h('label', { className: 'dt-check' }, h(Input, { type: 'checkbox', checked: draft.show_popup, onChange: e => setDraft(d => ({ ...d, show_popup: e.target.checked })) }), 'Hiện khảo sát trong video') : null),
    dialog.kind === 'lesson' ? h('section', { className: 'dt-questions' }, h('div', { className: 'dt-row' }, h('h3', null, 'Câu hỏi khảo sát'), h(Button, { type: 'button', variant: 'outline', onClick: () => setDraft(d => ({ ...d, questions: [...d.questions, { id: `q_${Date.now()}`, type: 'text', text: '', required: true, options: [] }] })) }, '+ Thêm câu hỏi')),
      draft.questions.map((q, i) => h('div', { key: q.id, className: 'dt-question' },
        h(Field, { label: `Câu ${i + 1}` }, h(Input, { required: true, value: q.text, onChange: e => questionChange(i, 'text', e.target.value) })),
        h(Select, { value: q.type, 'aria-label': `Loại câu ${i + 1}`, onChange: e => questionChange(i, 'type', e.target.value) }, h('option', { value: 'text' }, 'Trả lời tự do'), h('option', { value: 'single_choice' }, 'Chọn một đáp án')),
        q.type === 'single_choice' ? h(Field, { label: 'Đáp án (mỗi dòng một đáp án)' }, h('textarea', { required: true, className: 'ui-input', rows: 3, value: (q.options || []).map(o => o.label).join('\n'), onChange: e => questionChange(i, 'options', e.target.value.split('\n').map((label, index) => ({ value: q.options?.[index]?.value || `option_${index + 1}`, label }))) })) : null,
        h('div', { className: 'dt-actions' }, h('label', { className: 'dt-check' }, h(Input, { type: 'checkbox', checked: q.required !== false, onChange: e => questionChange(i, 'required', e.target.checked) }), 'Bắt buộc'), h(Button, { type: 'button', variant: 'outline', onClick: () => setDraft(d => ({ ...d, questions: d.questions.filter((_, index) => index !== i) })) }, 'Xóa câu hỏi'))
      ))) : null,
    formError ? h('p', { role: 'alert', className: 'state-error' }, formError) : null,
    h('div', { className: 'dt-dialog-footer' }, h(Button, { type: 'button', variant: 'outline', onClick: () => setDialog(null), disabled: busy }, 'Hủy'), h(Button, { type: 'submit', disabled: busy }, busy ? 'Đang lưu…' : 'Lưu'))
  ) : null;

  const detail = dialog?.kind === 'student' && dialog.row ? h(React.Fragment, null,
    h('p', null, `${dialog.row.email || ''} · ${dialog.row.phone || ''} · ${dialog.row.region}`), h('p', null, `Tham gia: ${date(dialog.row.registered_at)} · Hoàn thành ${dialog.row.completed}/${dialog.row.total_lessons} bài công khai`),
    h('div', { className: 'table-shell' }, h('table', { className: 'react-table' }, h('thead', null, h('tr', null, ...['Bài giảng', 'Đã xem / Vị trí tiếp tục', 'Tiến độ', 'Hoàn thành'].map(t => h('th', { key: t }, t)))), h('tbody', null, dialog.row.lessons.map(l => h('tr', { key: l.lesson_id }, h('td', null, l.title, !l.is_visible ? h(Badge, null, 'Đang ẩn') : null), h('td', null, `${seconds(l.watched_seconds)} / ${seconds(l.last_position)}`), h('td', null, progressBar(l.watch_percent), ` ${pct(l.watch_percent)}`), h('td', null, l.completed ? date(l.completed_at) : 'Chưa hoàn thành')))))),
    h('h3', null, 'Câu trả lời khảo sát'), dialog.row.lessons.filter(l => l.answers).length ? dialog.row.lessons.filter(l => l.answers).map(l => h('div', { key: l.lesson_id, className: 'dt-question' }, h('strong', null, l.title), ...Object.entries(l.answers).map(([key, answer]) => { let config; try { config = JSON.parse(lessons.find(row => Number(row.id) === l.lesson_id)?.hidden_content || '{}').questions?.find(q => q.id === key); } catch {} return h('p', { key }, `${config?.text || key}: ${config?.options?.find(o => o.value === answer)?.label || String(answer)}`); }))) : h('p', null, 'Chưa có câu trả lời.')
  ) : dialog?.kind === 'viewers' ? studentTable(students.filter(s => dialog.row.learner_ids.includes(s.id) && (!region || s.region === region))) : dialog?.kind === 'vimeo' ? h(React.Fragment, null,
    h('p', null, dialog.source.message || 'Chọn video từ Vimeo để nhập vào khóa học. Các cấu hình đã lưu của bài hiện có được giữ lại.'),
    h('div', { className: 'dt-actions' }, h(Button, { variant: 'outline', onClick: () => setDraft(d => ({ ...d, ids: d.ids.length === dialog.source.rows.length ? [] : dialog.source.rows.map(r => r.id) })) }, draft.ids.length === dialog.source.rows.length ? 'Bỏ chọn tất cả' : `Chọn tất cả ${dialog.source.rows.length} video`),
      select(draft.stage_id, value => setDraft(d => ({ ...d, stage_id: value })), 'Giữ chương hiện có / Chưa phân chương', stages.map(s => [s.id, s.title]))),
    h('label', { className: 'dt-check' }, h(Input, { type: 'checkbox', checked: draft.is_visible, onChange: e => setDraft(d => ({ ...d, is_visible: e.target.checked })) }), 'Hiển thị các bài mới trên trang học'),
    h('div', { className: 'dt-vimeo-list' }, dialog.source.rows.map(row => h('label', { key: row.id, className: 'dt-check' }, h(Input, { type: 'checkbox', checked: draft.ids.includes(row.id), onChange: e => setDraft(d => ({ ...d, ids: e.target.checked ? [...d.ids, row.id] : d.ids.filter(id => id !== row.id) })) }), row.thumbnail_url ? h('img', { src: thumb(row.thumbnail_url), alt: '', className: 'dt-vimeo-thumbnail', loading: 'lazy' }) : null, h('span', null, row.title, h('small', { className: 'dt-contact' }, `${row.vimeo_video_id} · ${seconds(row.duration)}${lessons.some(l => l.vimeo_video_id.split('/')[0] === row.vimeo_video_id.split('/')[0]) ? ' · Đã có' : ''}`))))),
    formError ? h('p', { role: 'alert' }, formError) : null, h('div', { className: 'dt-dialog-footer' }, h(Button, { variant: 'outline', disabled: busy, onClick: () => setDialog(null) }, 'Hủy'), h(Button, { disabled: busy || !draft.ids.length, onClick: () => mutate('/vimeo-import', 'POST', { ids: draft.ids, is_visible: draft.is_visible, ...(draft.stage_id ? { stage_id: draft.stage_id } : {}) }) }, busy ? 'Đang nhập…' : `Nhập ${draft.ids.length} bài`))
  ) : null;
  return h('div', { className: 'page-stack dt-learning' },
    h('div', { className: 'dt-row dt-header' }, h('div', null, h('h2', null, 'Quản lý khảo sát Dòng Tiền'), h('p', null, 'Báo cáo học tập, quản lý chương, bài giảng và khảo sát.')), h('div', { className: 'dt-actions' }, h(Button, { variant: 'outline', disabled: busy, onClick: reload }, 'Làm mới'), canEdit ? h(Button, { variant: 'outline', disabled: busy, onClick: openVimeo }, 'Đồng bộ từ Vimeo') : null)),
    h('div', { className: 'settings-tabs', role: 'tablist', 'aria-label': 'Quản lý học Dòng Tiền' }, [['overview', 'Tổng quan'], ['students', `Thống kê học viên (${students.length})`], ['lessons', `Danh sách bài giảng (${lessons.length})`]].map(([id, label]) => h('button', { key: id, role: 'tab', 'aria-selected': tab === id, className: tab === id ? 'active' : '', onClick: () => { setTab(id); setLessonId(''); setStatus(''); } }, label))),
    tab !== 'lessons' ? h('div', { className: 'dt-date-range' }, h(Field, { label: 'Đăng ký từ ngày' }, h(Input, { type: 'date', value: dates.from, onChange: e => setDates(d => ({ ...d, from: e.target.value })) })), h(Field, { label: 'Đến ngày' }, h(Input, { type: 'date', value: dates.to, onChange: e => setDates(d => ({ ...d, to: e.target.value })) })), h(Button, { variant: 'ghost', onClick: () => setDates({ from: '', to: '' }) }, 'Toàn bộ thời gian')) : null,
    panel,
    dialog ? h(Overlay, { className: 'dt-dialog-layer' }, h('button', { className: 'drawer-backdrop', 'aria-label': 'Đóng', onClick: () => { if (!busy) setDialog(null); } }), h('section', { className: 'ui-card dt-dialog', role: 'dialog', 'aria-labelledby': 'dt-dialog-title' }, h('div', { className: 'dt-row' }, h('h2', { id: 'dt-dialog-title' }, dialog.kind === 'stage' ? `${dialog.id ? 'Sửa' : 'Thêm'} chương` : dialog.kind === 'lesson' ? `${dialog.id ? 'Sửa' : 'Thêm'} bài giảng` : dialog.kind === 'student' ? `Học viên · ${dialog.row.name}` : dialog.kind === 'viewers' ? `Học viên xem · ${dialog.row.title}` : 'Đồng bộ danh mục Vimeo'), h(Button, { variant: 'ghost', disabled: busy, onClick: () => setDialog(null) }, 'Đóng')), editor || detail)) : null
  );
}
