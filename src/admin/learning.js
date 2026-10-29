import React from 'react';
import { Select, Overlay, confirmAction, notify, Skeleton, EmptyState } from './ui.js';
import CtaPanel from './learningCta.js';
import { LessonList, ThumbnailPanel, parseDuration, clock, thumbSrc } from './learningLessons.js';
import './learning.css';

const h = React.createElement;
const fmt = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value || 0);
const pct = value => `${Math.round(value || 0)}%`;
const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const seconds = value => `${Math.floor((value || 0) / 60)}:${String(Math.floor((value || 0) % 60)).padStart(2, '0')}`;

// only: the internal tabs to offer (the funnel page splits students and lessons into its own tabs);
// range: { from, to } days chosen by the funnel page, replacing the date fields here.
export default function CourseLearning({ course, title, apiFetch, ui, canEdit, only, range, hideHeader = false, onChanged }) {
  const { Button, Card, Input, Field, Badge, downloadCsv } = ui;
  const BASE = `/admin/funnels/${encodeURIComponent(course)}/learning`;
  const [tab, setTab] = React.useState(only?.[0] || 'overview');
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
  const [ctaState, setCtaState] = React.useState({ ctas: [], loading: true, error: '' });
  const [ctaRevision, setCtaRevision] = React.useState(0);
  // onChanged: the funnel page reloads its own numbers (retention chart) after an edit here.
  const reload = () => { setRevision(value => value + 1); setCtaRevision(value => value + 1); onChanged?.(); };
  React.useEffect(() => {
    let cancelled = false;
    setCtaState(state => ({ ...state, loading: true, error: '' }));
    apiFetch(`${BASE}/ctas`).then(value => { if (!cancelled) setCtaState({ ctas: value.ctas || [], loading: false, error: '' }); }).catch(e => { if (!cancelled) setCtaState(state => ({ ...state, loading: false, error: e.message })); });
    return () => { cancelled = true; };
  }, [BASE, apiFetch, ctaRevision]);
  React.useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    const from = range ? range.from : dates.from, to = range ? range.to : dates.to;
    if (from) params.set('dateFrom', `${from}T00:00:00+07:00`);
    if (to) params.set('dateTo', `${to}T23:59:59.999+07:00`);
    setLoading(true); setError('');
    apiFetch(`${BASE}?${params}`).then(value => { if (!cancelled) { setData(value); setLoading(false); } }).catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [BASE, apiFetch, dates.from, dates.to, range?.from, range?.to, revision]);
  React.useEffect(() => setPage(1), [query, region, lessonId, status, userTab]);
  async function mutate(path, method, body, close = true) {
    setBusy(true); setFormError('');
    try {
      await apiFetch(BASE + path, { method, quiet: true, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (close) setDialog(null);
      notify('Đã lưu thay đổi'); reload(); return true;
    } catch (e) { setFormError(e.message); notify(e.message, true); return false; }
    finally { setBusy(false); }
  }
  // Order comes from the list (drag or arrows), so the dialogs have no position field. focus: 'image'
  // when the dialog was opened from a lesson's thumbnail.
  function edit(kind, row, focus) {
    setFormError('');
    setDialog({ kind, id: row?.id, focus });
    setDraft(kind === 'stage' ? { title: '', is_visible: true, ...row } : { title: '', vimeo_video_id: '', stage_id: '', description: '', is_visible: true, thumbnail_url: '', ...row, duration_text: row?.duration ? clock(row.duration) : '' });
  }
  async function remove(kind, row) {
    if (!await confirmAction(kind === 'stages' ? 'Xóa chương? Các bài trong chương sẽ chuyển về chưa phân loại. Tiến độ học được giữ lại.' : 'Xóa bài giảng? Bài sẽ ẩn khỏi trang học. Tiến độ và lịch sử đã lưu được giữ lại.', true)) return;
    await mutate(`/${kind}/${row.id}`, 'DELETE');
  }
  async function move(kind, id, offset, targetId) {
    // A lesson dropped on a chapter heading moves into that chapter.
    if (kind === 'chapter') { const lesson = data.lessons.find(l => l.id === id); if (lesson && Number(lesson.stage_id || 0) !== Number(targetId || 0)) await mutate(`/lessons/${id}`, 'PATCH', { stage_id: targetId || null }, false); return; }
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
  // Vimeo link → title, duration and full video ID, read by the server (oEmbed).
  const lookup = url => apiFetch(BASE + '/vimeo-lookup', { method: 'POST', body: JSON.stringify({ url }) });
  const looksLikeLink = value => /vimeo\.com|<iframe/i.test(value || '');
  async function fillFromVimeo(value = draft.vimeo_video_id) {
    if (!String(value || '').trim()) { setFormError('Dán link hoặc Vimeo ID trước.'); return; }
    setBusy(true); setFormError('');
    try {
      const info = await lookup(value);
      const creating = !dialog?.id;
      // An uploaded image stays when the video changes (the server keeps it too).
      setDraft(d => ({ ...d, vimeo_video_id: info.vimeo_video_id, duration_text: clock(info.duration), ...(creating || !String(d.title || '').trim() ? { title: info.title } : {}), vimeo_title: info.title, ...(d.thumbnail_source === 'upload' && d.thumbnail_url ? {} : { thumbnail_url: info.thumbnail_url || '', thumbnail_source: 'vimeo' }) }));
      if (info.existing && Number(info.existing.id) !== Number(dialog?.id)) setFormError(`Video này đã có trong bài "${info.existing.title}".`);
    } catch (e) { setFormError(e.message); }
    finally { setBusy(false); }
  }
  // Vimeo covers again for every lesson without an uploaded image; one failing video is named, not fatal.
  async function refreshAllThumbnails() {
    setBusy(true);
    try {
      const result = await apiFetch(BASE + '/thumbnails/refresh', { method: 'POST', quiet: true });
      const failed = result.failed || [];
      notify([`Đã cập nhật ${result.refreshed || 0} ảnh từ Vimeo`, result.skipped ? `giữ ${result.skipped} ảnh tải lên` : '', failed.length ? `${failed.length} bài lỗi: ${failed.slice(0, 3).map(row => row.title).join(', ')}${failed.length > 3 ? '…' : ''}` : ''].filter(Boolean).join(' · '), failed.length > 0);
      reload();
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  }
  function openQuickAdd() {
    setFormError('');
    setDialog({ kind: 'quick' });
    setDraft({ text: '', stage_id: '', is_visible: true, rows: [] });
  }
  async function quickLookup() {
    const links = [...new Set(String(draft.text || '').split(/\n+/).map(line => line.trim()).filter(Boolean))].slice(0, 50);
    if (!links.length) { setFormError('Dán ít nhất một link Vimeo.'); return; }
    setBusy(true); setFormError('');
    const rows = [];
    for (const url of links) {
      try {
        const info = await lookup(url);
        const repeated = rows.some(r => r.vimeo_video_id && r.vimeo_video_id.split('/')[0] === info.vimeo_video_id.split('/')[0]);
        rows.push({ url, ...info, add: !info.existing && !repeated, note: info.existing ? `Đã có trong bài "${info.existing.title}"` : repeated ? 'Trùng link phía trên' : '' });
      } catch (e) { rows.push({ url, error: e.message, add: false }); }
      setDraft(d => ({ ...d, rows: [...rows] }));
    }
    setBusy(false);
  }
  async function quickAdd() {
    setBusy(true); setFormError('');
    let added = 0;
    const rows = [...draft.rows];
    for (const [index, row] of rows.entries()) {
      if (!row.add || row.saved) continue;
      try {
        await apiFetch(BASE + '/lessons', { method: 'POST', quiet: true, body: JSON.stringify({ title: row.title, vimeo_video_id: row.vimeo_video_id, duration: row.duration, thumbnail_url: row.thumbnail_url || '', stage_id: draft.stage_id || null, is_visible: draft.is_visible }) });
        rows[index] = { ...row, saved: true, error: '' }; added++;
      } catch (e) { rows[index] = { ...row, error: e.message }; }
      setDraft(d => ({ ...d, rows: [...rows] }));
    }
    setBusy(false);
    if (added) { notify(`Đã thêm ${added} bài giảng`); reload(); }
    if (rows.every(row => !row.add || row.saved)) setDialog(null);
    else setFormError('Một số bài chưa thêm được, xem lỗi ở từng dòng.');
  }
  const lessons = data?.lessons || [], stages = data?.stages || [], students = data?.students || [], history = data?.history || [];
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
    const watched = students.filter(s => ids.has(s.id) && l.learner_ids.includes(s.id)).map(s => s.lessons.find(p => p.lesson_id === Number(l.id))?.watch_percent || 0);
    return { ...l, viewers, completed, completion_rate: viewers ? completed / viewers * 100 : 0, avg_watch_percent: watched.length ? watched.reduce((a, b) => a + b, 0) / watched.length : 0 };
  });
  const progressBar = value => h('span', { className: 'dt-progress' }, h('span', { style: { width: `${Math.max(0, Math.min(100, value || 0))}%` } }));
  const select = (value, onChange, label, options) => h(Select, { value, onChange: e => onChange(e.target.value), 'aria-label': label }, h('option', { value: '' }, label), ...options.map(([id, text]) => h('option', { key: id, value: String(id) }, text)));
  const filters = h('div', { className: 'dt-filters' },
    tab === 'students' ? h(Input, { placeholder: 'Tìm theo tên, email hoặc số điện thoại', value: query, onChange: e => setQuery(e.target.value), 'aria-label': 'Tìm học viên' }) : null,
    select(region, setRegion, 'Tất cả khu vực', ['Hà Nội', 'Hồ Chí Minh', 'Khu vực khác'].map(r => [r, r])),
    select(lessonId, setLessonId, 'Tất cả bài học', lessons.map(l => [l.id, l.title])),
    tab === 'students' ? select(status, setStatus, 'Tất cả tiến độ', [['completed', 'Đã hoàn thành'], ['started', 'Đang học'], ['not-started', 'Chưa xem']]) : null,
    h(Button, { variant: 'outline', onClick: () => { setQuery(''); setRegion(''); setLessonId(''); setStatus(''); } }, 'Xóa bộ lọc'),
    tab === 'students' ? h(Button, { variant: 'outline', onClick: () => downloadCsv(`${course}-hoc-vien.csv`, [
      { label: 'Họ tên', value: r => r.name }, { label: 'Email', value: r => r.email }, { label: 'Số điện thoại', value: r => r.phone }, { label: 'Khu vực', value: r => r.region }, { label: 'Đăng ký', value: r => r.registered_at }, { label: 'Bài hoàn thành', value: r => r.completed }, { label: 'Tổng bài', value: r => r.total_lessons }, { label: 'Tỷ lệ', value: r => pct(r.completion_percent) }, { label: 'Tiến độ xem', value: r => pct(r.watch_percent) },
    ], studentRows) }, 'Xuất CSV (Excel)') : null);
  function studentTable(rows) {
    return h('div', { className: 'table-shell' }, h('table', { className: 'react-table' },
      h('thead', null, h('tr', null, ...['Học viên', 'Tham gia', 'Tiến độ xem', 'Hoàn thành bài giảng', 'Hành động'].map(t => h('th', { key: t }, t)))),
      h('tbody', null, rows.map(row => h('tr', { key: row.id },
        h('td', null, h('strong', null, row.name), h('small', { className: 'dt-contact' }, row.email), h('small', { className: 'dt-contact' }, `${row.phone || '—'} · ${row.region}`)),
        h('td', null, date(row.registered_at)), h('td', { title: 'Tổng thời lượng đã xem trên toàn khóa' }, progressBar(row.watch_percent), ` ${pct(row.watch_percent)}`), h('td', null, progressBar(row.completion_percent), h('span', null, ` ${row.completed}/${row.total_lessons} (${pct(row.completion_percent)})`)),
        h('td', null, h(Button, { variant: 'outline', size: 'sm', onClick: () => setDialog({ kind: 'student', row }) }, 'Chi tiết'))
      )))));
  }
  const panel = tab === 'cta' ? h(CtaPanel, { course, courseTitle: title || course, base: BASE, apiFetch, ui, canEdit, lessons, stages, stats: data?.cta_stats || {}, ctas: ctaState.ctas, loading: ctaState.loading || loading, error: ctaState.error || error, onChanged: () => setCtaRevision(value => value + 1) }) : loading && !data ? h(Skeleton) : error && !data ? h('div', { role: 'alert', className: 'state-error' }, error, h(Button, { onClick: reload }, 'Thử lại')) : tab === 'overview' ? h(React.Fragment, null,
    h('div', { className: 'dt-stat-grid' }, [['Tổng học viên', fmt(data.summary.students)], ['Tổng lượt mở bài học', fmt(data.summary.sessions)], ['Hoàn thành tất cả video', pct(data.summary.completion_rate)]].map(([label, value]) => h(Card, { key: label, className: 'dt-stat' }, h('small', null, label), h('strong', null, value))),
      h(Card, { className: 'dt-stat' }, h('small', null, 'Phân bố khu vực'), data.summary.regions.map(r => h('div', { key: r.name }, h('div', { className: 'dt-region' }, h('span', null, r.name), h('span', null, `${fmt(r.count)} (${pct(data.summary.students ? r.count / data.summary.students * 100 : 0)})`)), progressBar(data.summary.students ? r.count / data.summary.students * 100 : 0))))),
    h(Card, { className: 'dt-panel' }, h('div', { className: 'dt-row' }, h('div', null, h('h3', null, 'Dữ liệu xem và hoàn thành bài giảng'), h('p', null, 'Bấm vào bài học để xem danh sách học viên.')), filters),
      h('div', { className: 'table-shell' }, h('table', { className: 'react-table' }, h('thead', null, h('tr', null, ...['#', 'Tên bài học', 'Số người xem', 'Xem trung bình', 'Số hoàn thành', 'Tỷ lệ hoàn thành'].map(t => h('th', { key: t }, t)))), h('tbody', null, lessonStats.map((l, i) => h('tr', { key: l.id }, h('td', null, i + 1), h('td', null, h(Button, { variant: 'ghost', onClick: () => setDialog({ kind: 'viewers', row: l }) }, l.title), l.is_visible === false ? h(Badge, null, 'Ẩn') : null), h('td', null, fmt(l.viewers)), h('td', { title: 'Trung bình % thời lượng bài mà người xem đã thực sự xem' }, progressBar(l.avg_watch_percent), ` ${pct(l.avg_watch_percent)}`), h('td', null, fmt(l.completed)), h('td', null, progressBar(l.completion_rate), ` ${pct(l.completion_rate)}`)))))))
  ) : tab === 'students' ? h(React.Fragment, null,
    h('div', { className: 'settings-tabs', role: 'tablist', 'aria-label': 'Thống kê học viên' }, [['students', `Danh sách học viên (${students.length})`], ['history', `Lịch sử mở video (${history.length})`]].map(([id, label]) => h('button', { key: id, role: 'tab', 'aria-selected': userTab === id, className: userTab === id ? 'active' : '', onClick: () => setUserTab(id) }, label))),
    filters,
    h(Card, null, shown.length ? userTab === 'students' ? studentTable(shown) : h('div', { className: 'table-shell' }, h('table', { className: 'react-table' }, h('thead', null, h('tr', null, ...['Học viên', 'Bài học', 'Thời điểm mở', 'Tiến độ hiện tại', 'Hành động'].map(t => h('th', { key: t }, t)))), h('tbody', null, shown.map((row, i) => h('tr', { key: `${row.id}-${i}` }, h('td', null, row.name, h('small', { className: 'dt-contact' }, row.email)), h('td', null, row.title), h('td', null, date(row.opened_at)), h('td', null, progressBar(row.watch_percent), ` ${pct(row.watch_percent)}`, row.completed ? ' · Hoàn thành' : ''), h('td', null, h(Button, { variant: 'outline', size: 'sm', onClick: () => setDialog({ kind: 'student', row: students.find(s => s.id === row.registration_id) }) }, 'Chi tiết'))))))) : h(EmptyState, { title: 'Không có học viên phù hợp', onClear: () => { setQuery(''); setRegion(''); setLessonId(''); setStatus(''); } })),
    h('div', { className: 'dt-pagination' }, h('span', null, `${fmt(tableRows.length)} kết quả · Trang ${Math.min(page, pages)}/${pages}`), h(Button, { variant: 'outline', disabled: page <= 1, onClick: () => setPage(p => p - 1) }, 'Trước'), h(Button, { variant: 'outline', disabled: page >= pages, onClick: () => setPage(p => p + 1) }, 'Sau'))
  ) : h(React.Fragment, null,
    h(LessonList, { lessons, stages, ctas: ctaState.ctas, course, canEdit, busy, ui, onEdit: edit, onRemove: remove, onMove: move, onToggle: toggle, onQuickAdd: openQuickAdd, onAdd: kind => edit(kind),
      onAssign: (ids, stageId) => mutate('/lessons/assign', 'POST', { ids, stage_id: stageId }, false), onRefreshAll: refreshAllThumbnails })
  );

  const isLesson = dialog?.kind === 'lesson';
  const editor = dialog?.kind === 'stage' || isLesson ? h('form', { className: isLesson ? 'ls-editor' : '', onSubmit: e => {
    e.preventDefault();
    const { duration_text, vimeo_title, ...body } = draft;
    if (isLesson) {
      body.duration = parseDuration(duration_text);
      if (!Number.isFinite(body.duration) || body.duration <= 0) { setFormError('Nhập thời lượng dạng phút:giây, ví dụ 12:34.'); return; }
    }
    mutate(`/${dialog.kind === 'stage' ? 'stages' : 'lessons'}${dialog.id ? `/${dialog.id}` : ''}`, dialog.id ? 'PATCH' : 'POST', body);
  } },
    h('div', { className: isLesson ? 'ls-editor-grid' : '' },
      h('div', { className: 'ls-editor-fields' },
        h(Field, { label: dialog.kind === 'stage' ? 'Tên chương' : 'Tên bài giảng' }, h(Input, { required: true, autoFocus: dialog.focus !== 'image', value: draft.title, onChange: e => setDraft(d => ({ ...d, title: e.target.value })) })),
        isLesson ? h(React.Fragment, null,
          // Not a <label> wrapper: the field also holds buttons.
          h('div', { className: 'ui-field' }, h('span', { id: 'dt-vimeo-label' }, 'Link hoặc Vimeo ID'), h('div', { className: 'dt-vimeo-field' },
            h(Input, { required: true, 'aria-labelledby': 'dt-vimeo-label', value: draft.vimeo_video_id, placeholder: 'https://vimeo.com/123456789/abcdef', onChange: e => setDraft(d => ({ ...d, vimeo_video_id: e.target.value })), onPaste: e => { const text = e.clipboardData.getData('text'); if (looksLikeLink(text)) { e.preventDefault(); setDraft(d => ({ ...d, vimeo_video_id: text.trim() })); fillFromVimeo(text); } } }),
            h(Button, { type: 'button', variant: 'outline', disabled: busy, onClick: () => fillFromVimeo() }, 'Lấy từ Vimeo')),
            h('small', { className: 'dt-muted' }, 'Dán link là tự lấy tên, thời lượng và ảnh bìa.'),
            dialog.id && draft.vimeo_title && draft.vimeo_title !== draft.title ? h('button', { type: 'button', className: 'dt-link-button', onClick: () => setDraft(d => ({ ...d, title: d.vimeo_title })) }, `Dùng tên trên Vimeo: ${draft.vimeo_title}`) : null),
          h('div', { className: 'ls-field-row' },
            h(Field, { label: 'Thời lượng' }, h(Input, { required: true, inputMode: 'numeric', placeholder: '12:34', value: draft.duration_text, onChange: e => setDraft(d => ({ ...d, duration_text: e.target.value })) })),
            h(Field, { label: 'Chương' }, select(String(draft.stage_id || ''), value => setDraft(d => ({ ...d, stage_id: value })), 'Chưa phân chương', stages.map(s => [s.id, s.title])))),
          h(Field, { label: 'Nội dung bài học' }, h('textarea', { className: 'ui-input', rows: 4, value: draft.description, onChange: e => setDraft(d => ({ ...d, description: e.target.value })) }))
        ) : null,
        h('label', { className: 'dt-check' }, h(Input, { type: 'checkbox', checked: draft.is_visible, onChange: e => setDraft(d => ({ ...d, is_visible: e.target.checked })) }), isLesson ? 'Hiện bài trên trang học' : 'Hiện chương trên trang học'),
        isLesson ? h('p', { className: 'dt-muted' }, 'CTA (Zalo, Zoom, chuyển phễu, thông điệp) của bài được gắn trong tab "CTA".') : null),
      isLesson ? h(ThumbnailPanel, { lesson: dialog.id ? { id: dialog.id } : null, draft, base: BASE, apiFetch, ui, canEdit, onChanged: saved => { setDraft(d => ({ ...d, thumbnail_url: saved.thumbnail_url, thumbnail_source: saved.thumbnail_source })); reload(); } }) : null),
    formError ? h('p', { role: 'alert', className: 'state-error' }, formError) : null,
    h('div', { className: 'dt-dialog-footer' }, h(Button, { type: 'button', variant: 'outline', onClick: () => setDialog(null), disabled: busy }, 'Hủy'), h(Button, { type: 'submit', disabled: busy }, busy ? 'Đang lưu…' : dialog.id ? 'Lưu' : isLesson ? 'Thêm bài' : 'Thêm chương'))
  ) : null;

  const detail = dialog?.kind === 'student' && dialog.row ? h(React.Fragment, null,
    h('p', null, `${dialog.row.email || ''} · ${dialog.row.phone || ''} · ${dialog.row.region}`), h('p', null, `Tham gia: ${date(dialog.row.registered_at)} · Hoàn thành ${dialog.row.completed}/${dialog.row.total_lessons} bài công khai`),
    h('div', { className: 'table-shell' }, h('table', { className: 'react-table' }, h('thead', null, h('tr', null, ...['Bài giảng', 'Đã xem / Vị trí tiếp tục', 'Tiến độ', 'Hoàn thành'].map(t => h('th', { key: t }, t)))), h('tbody', null, dialog.row.lessons.map(l => h('tr', { key: l.lesson_id }, h('td', null, l.title, !l.is_visible ? h(Badge, null, 'Đang ẩn') : null), h('td', null, `${seconds(l.watched_seconds)} / ${seconds(l.last_position)}`), h('td', null, progressBar(l.watch_percent), ` ${pct(l.watch_percent)}`), h('td', null, l.completed ? date(l.completed_at) : 'Chưa hoàn thành')))))),
    // Answers of the former lesson survey, kept read-only.
    dialog.row.lessons.some(l => l.answers) ? h('h3', null, 'Câu trả lời khảo sát (tính năng cũ)') : null, dialog.row.lessons.filter(l => l.answers).length ? dialog.row.lessons.filter(l => l.answers).map(l => h('div', { key: l.lesson_id, className: 'dt-question' }, h('strong', null, l.title), ...Object.entries(l.answers).map(([key, answer]) => { let config; try { config = JSON.parse(lessons.find(row => Number(row.id) === l.lesson_id)?.hidden_content || '{}').questions?.find(q => q.id === key); } catch {} return h('p', { key }, `${config?.text || key}: ${config?.options?.find(o => o.value === answer)?.label || String(answer)}`); }))) : null
  ) : dialog?.kind === 'viewers' ? studentTable(students.filter(s => dialog.row.learner_ids.includes(s.id) && (!region || s.region === region))) : dialog?.kind === 'quick' ? h(React.Fragment, null,
    h('p', { className: 'dt-muted' }, 'Dán link Vimeo, mỗi dòng một video (link chia sẻ, link player hoặc mã nhúng). Tên, thời lượng và ảnh bìa được lấy tự động; bạn có thể sửa tên trước khi thêm.', ' ', h('button', { type: 'button', className: 'dt-link-button', onClick: () => edit('lesson', { stage_id: draft.stage_id }) }, 'Hoặc nhập thủ công từng bài')),
    h(Field, { label: 'Link Vimeo' }, h('textarea', { className: 'ui-input', rows: 4, value: draft.text, placeholder: 'https://vimeo.com/123456789/abcdef\nhttps://vimeo.com/987654321', onChange: e => setDraft(d => ({ ...d, text: e.target.value })) })),
    h('div', { className: 'dt-actions' },
      h(Button, { type: 'button', variant: draft.rows.length ? 'outline' : 'default', disabled: busy || !String(draft.text || '').trim(), onClick: quickLookup }, busy && !draft.rows.some(r => r.saved) ? 'Đang lấy thông tin…' : draft.rows.length ? 'Lấy lại thông tin' : 'Lấy thông tin'),
      select(draft.stage_id, value => setDraft(d => ({ ...d, stage_id: value })), 'Chưa phân chương', stages.map(s => [s.id, s.title]))),
    h('label', { className: 'dt-check' }, h(Input, { type: 'checkbox', checked: draft.is_visible, onChange: e => setDraft(d => ({ ...d, is_visible: e.target.checked })) }), 'Hiển thị các bài mới trên trang học'),
    draft.rows.length ? h('div', { className: 'dt-quick-list' }, draft.rows.map((row, index) => {
      const change = patch => setDraft(d => ({ ...d, rows: d.rows.map((r, i) => i === index ? { ...r, ...patch } : r) }));
      return h('div', { key: row.url, className: `dt-quick-row${row.error && !row.vimeo_video_id ? ' is-error' : ''}` },
        row.vimeo_video_id ? h(React.Fragment, null,
          h('label', { className: 'dt-check' }, h(Input, { type: 'checkbox', 'aria-label': `Thêm ${row.title}`, disabled: row.saved, checked: row.add, onChange: e => change({ add: e.target.checked }) })),
          h('span', { className: `ls-quick-thumb${row.thumbnail_url ? '' : ' is-empty'}` }, row.thumbnail_url ? h('img', { src: thumbSrc(row.thumbnail_url), alt: '' }) : 'Chưa có ảnh'),
          h('div', { className: 'dt-quick-fields' },
            h(Input, { 'aria-label': 'Tên bài giảng', value: row.title, disabled: row.saved, onChange: e => change({ title: e.target.value }) }),
            h('small', { className: 'dt-contact' }, `Vimeo ${row.vimeo_video_id.split('/')[0]} · ${clock(row.duration)}`, row.saved ? ' · Đã thêm' : '', row.note ? ` · ${row.note}` : ''),
            row.error ? h('small', { role: 'alert', className: 'state-error' }, row.error) : null))
          : h('div', { className: 'dt-quick-fields' }, h('strong', null, row.url), h('small', { role: 'alert', className: 'state-error' }, row.error)));
    })) : null,
    formError ? h('p', { role: 'alert', className: 'state-error' }, formError) : null,
    h('div', { className: 'dt-dialog-footer' }, h(Button, { variant: 'outline', disabled: busy, onClick: () => setDialog(null) }, 'Hủy'), h(Button, { disabled: busy || !draft.rows.some(r => r.add && !r.saved && String(r.title || '').trim()), onClick: quickAdd }, busy && draft.rows.some(r => r.saved) ? 'Đang thêm…' : `Thêm ${draft.rows.filter(r => r.add && !r.saved).length} bài`))
  ) : null;
  return h('div', { className: 'page-stack dt-learning' },
    hideHeader ? null : h('div', { className: 'dt-row dt-header' }, h('div', null, h('h2', null, `Quản lý khóa học · ${title || course}`), h('p', null, 'Báo cáo học tập, quản lý chương, bài giảng và CTA trên trang học.')), h('div', { className: 'dt-actions' }, h(Button, { variant: 'outline', disabled: busy, onClick: reload }, 'Làm mới'))),
    h('div', { className: 'settings-tabs', role: 'tablist', 'aria-label': 'Quản lý khóa học' }, [['overview', 'Tổng quan'], ['students', `Thống kê học viên (${students.length})`], ['lessons', `Danh sách bài giảng (${lessons.length})`], ['cta', `CTA (${ctaState.ctas.length})`]].filter(([id]) => !only || only.includes(id)).map(([id, label]) => h('button', { key: id, role: 'tab', 'aria-selected': tab === id, className: tab === id ? 'active' : '', onClick: () => { setTab(id); setLessonId(''); setStatus(''); } }, label))),
    tab !== 'lessons' && !range ? h('div', { className: 'dt-date-range' }, h(Field, { label: 'Đăng ký từ ngày' }, h(Input, { type: 'date', value: dates.from, onChange: e => setDates(d => ({ ...d, from: e.target.value })) })), h(Field, { label: 'Đến ngày' }, h(Input, { type: 'date', value: dates.to, onChange: e => setDates(d => ({ ...d, to: e.target.value })) })), h(Button, { variant: 'ghost', onClick: () => setDates({ from: '', to: '' }) }, 'Toàn bộ thời gian')) : null,
    panel,
    dialog ? h(Overlay, { className: 'dt-dialog-layer' }, h('button', { className: 'drawer-backdrop', 'aria-label': 'Đóng', onClick: () => { if (!busy) setDialog(null); } }), h('section', { className: 'ui-card dt-dialog', role: 'dialog', 'aria-labelledby': 'dt-dialog-title' }, h('div', { className: 'dt-row' }, h('h2', { id: 'dt-dialog-title' }, dialog.kind === 'stage' ? `${dialog.id ? 'Sửa' : 'Thêm'} chương` : dialog.kind === 'lesson' ? `${dialog.id ? 'Sửa' : 'Thêm'} bài giảng` : dialog.kind === 'student' ? `Học viên · ${dialog.row.name}` : dialog.kind === 'viewers' ? `Học viên xem · ${dialog.row.title}` : 'Thêm bài từ link Vimeo'), h(Button, { variant: 'ghost', disabled: busy, onClick: () => setDialog(null) }, 'Đóng')), editor || detail)) : null
  );
}
