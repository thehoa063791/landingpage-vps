const storage = require('./storage');
const { createRepository } = require('./learningRepository');
const { createVimeoClient, parseVideo } = require('./learningVimeo');
const { getCourse } = require('./learningCourses');
const { summarizeCourse } = require('./learningProgress');
const cta = require('./learningCta');
const fail = message => Object.assign(new Error(message), { status: 400 });
const ordered = rows => rows.sort((a, b) => Number(a.position || a.id) - Number(b.position || b.id));
const region = value => /hà nội/i.test(value || '') ? 'Hà Nội' : /hồ chí minh/i.test(value || '') ? 'Hồ Chí Minh' : 'Khu vực khác';

function createAdminService({ course = getCourse('dong-tien'), store = createRepository({ course: course.id }), crm = storage, vimeo = createVimeoClient({ course }) } = {}) {
  async function configuration() {
    const [lessons, stages] = await Promise.all([store.list('lessons'), store.list('stages')]);
    return { lessons: ordered(lessons.filter(row => !row.is_deleted)), stages: ordered(stages.filter(row => !row.is_deleted)) };
  }
  async function report(query = {}) {
    if ([query.dateFrom, query.dateTo].some(value => value && !Number.isFinite(new Date(value).getTime())) || query.dateFrom && query.dateTo && new Date(query.dateFrom) > new Date(query.dateTo)) throw fail('Khoảng ngày không hợp lệ.');
    const [{ lessons, stages }, registrations, progress, learners, events] = await Promise.all([configuration(), crm.getRegistrations(), store.list('progress'), store.list('learners'), crm.getEvents()]);
    const stageById = new Map(stages.map(s => [Number(s.id), s]));
    const active = lessons.filter(l => l.is_visible !== false && (!l.stage_id || stageById.get(Number(l.stage_id))?.is_visible !== false && stageById.has(Number(l.stage_id))));
    const visibleIds = new Set(active.map(l => Number(l.id)));
    const inDate = date => (!query.dateFrom || new Date(date) >= new Date(query.dateFrom)) && (!query.dateTo || new Date(date) <= new Date(query.dateTo));
    const leads = registrations.filter(l => l.page_id === course.page_id && inDate(l.registered_at));
    const byId = new Map(leads.map(l => [l.id, l]));
    const pByKey = new Map(progress.filter(p => byId.has(p.registration_id)).map(p => [`${p.registration_id}:${p.lesson_id}`, p]));
    const learnerById = new Map(learners.map(l => [l.registration_id, l]));
    const views = events.filter(e => e.event === 'lesson_view' && e.data?.page_id === course.page_id && byId.has(e.data.registration_id) && inDate(e.timestamp));
    const openedKeys = new Set(views.map(e => `${e.data.registration_id}:${e.data.lesson_id}`));
    const lessonsById = new Map(lessons.map(l => [Number(l.id), l]));
    const students = leads.map(l => {
      // Overall watching progress: unique watched seconds over the visible course length.
      const summary = summarizeCourse(active, active.map(lesson => pByKey.get(`${l.id}:${lesson.id}`)).filter(Boolean));
      return { id: l.id, name: l.name, email: l.email, phone: l.phone, region: region(l.region), registered_at: l.registered_at, completed: summary.completed_lessons, total_lessons: summary.total_lessons, completion_percent: summary.completion_percent, watch_percent: summary.watch_percent,
        lessons: lessons.map(lesson => {
          const p = pByKey.get(`${l.id}:${lesson.id}`);
          return { lesson_id: Number(lesson.id), title: lesson.title, is_visible: visibleIds.has(Number(lesson.id)), watch_percent: p?.watch_percent || 0, watched_seconds: (p?.watched_ranges || []).reduce((sum, [a, b]) => sum + b - a, 0), last_position: p?.last_position || 0, completed: !!p?.is_completed, completed_at: p?.completed_at || null, updated_at: p?.updated_at || null, opened: openedKeys.has(`${l.id}:${lesson.id}`), answers: learnerById.get(l.id)?.survey_answers?.[lesson.id] || null };
        }) };
    }).sort((a, b) => String(b.registered_at).localeCompare(String(a.registered_at)));
    const lesson_stats = lessons.map(l => {
      const viewers = students.filter(s => s.lessons.some(p => p.lesson_id === Number(l.id) && (p.opened || p.watched_seconds > 0 || p.completed)));
      const completed = students.filter(s => s.lessons.some(p => p.lesson_id === Number(l.id) && p.completed)).length;
      const watched = viewers.map(s => s.lessons.find(p => p.lesson_id === Number(l.id))?.watch_percent || 0);
      return { ...l, stage_title: stageById.get(Number(l.stage_id))?.title || '', viewers: viewers.length, completed, completion_rate: viewers.length ? completed / viewers.length * 100 : 0, avg_watch_percent: watched.length ? watched.reduce((a, b) => a + b, 0) / watched.length : 0, learner_ids: viewers.map(s => s.id) };
    });
    const full = active.length ? students.filter(s => s.completed === active.length).length : 0;
    const history = views.map(e => {
      const lead = byId.get(e.data.registration_id), p = pByKey.get(`${lead.id}:${e.data.lesson_id}`);
      return { id: e.event_id || e.id, registration_id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, region: region(lead.region), lesson_id: Number(e.data.lesson_id), title: lessonsById.get(Number(e.data.lesson_id))?.title || `Bài ${e.data.lesson_id}`, opened_at: e.timestamp, watch_percent: p?.watch_percent || 0, completed: !!p?.is_completed };
    }).sort((a, b) => String(b.opened_at).localeCompare(String(a.opened_at)));
    // Unique learners who saw / clicked each CTA on this course's lessons.
    const cta_stats = {};
    for (const e of events) {
      const action = e.event === 'learning_cta_view' ? 'views' : e.event === 'learning_cta_click' ? 'clicks' : '';
      if (!action || e.data?.page_id !== course.page_id || !byId.has(e.data.registration_id) || !inDate(e.timestamp)) continue;
      const row = cta_stats[e.data.cta_id] ||= { views: new Set(), clicks: new Set() };
      row[action].add(e.data.registration_id);
    }
    for (const [id, row] of Object.entries(cta_stats)) cta_stats[id] = { views: row.views.size, clicks: row.clicks.size };
    return { lessons: lesson_stats, stages, students, history, cta_stats, summary: { students: students.length, sessions: history.length, completed_students: full, completion_rate: students.length ? full / students.length * 100 : 0, regions: ['Hà Nội', 'Hồ Chí Minh', 'Khu vực khác'].map(name => ({ name, count: students.filter(s => s.region === name).length })) } };
  }
  async function saveLesson(id, body) {
    const config = await configuration();
    const previous = id ? config.lessons.find(l => Number(l.id) === Number(id)) : null;
    if (id && !previous) throw fail('Bài học không tồn tại.');
    const row = { ...previous, ...body };
    // The field also takes a pasted Vimeo link or embed code.
    const video = parseVideo(row.vimeo_video_id) || '';
    if (!video || !String(row.title || '').trim() || !Number.isFinite(Number(row.duration)) || Number(row.duration) <= 0 || Number(row.duration) > 172800) throw fail('Kiểm tra tiêu đề, link/Vimeo ID và thời lượng bài học.');
    const sameVideo = lesson => String(lesson?.vimeo_video_id || '').split('/')[0] === video.split('/')[0];
    const duplicate = config.lessons.find(l => sameVideo(l) && Number(l.id) !== Number(previous?.id));
    if (duplicate) throw fail(`Video này đã có trong bài "${duplicate.title}".`);
    const lessonId = previous?.id || await newLessonId(Number(body.id || video.split('/')[0]), sameVideo);
    const stageId = Number(row.stage_id) || null;
    if (stageId && !config.stages.some(s => Number(s.id) === stageId)) throw fail('Chương không tồn tại.');
    const next = { ...previous, id: lessonId, title: String(row.title).trim().slice(0, 500), vimeo_video_id: video, duration: Math.round(Number(row.duration)), description: String(row.description || '').slice(0, 20000), position: Number(row.position || config.lessons.length + 1), stage_id: stageId, is_visible: row.is_visible !== false, is_deleted: false, updated_at: new Date().toISOString() };
    if (!Number.isFinite(next.position) || next.position < 1) throw fail('Thứ tự bài học không hợp lệ.');
    const localThumbnail = new RegExp(String.raw`^${course.base_path}/api/learning/thumbnails/[1-9]\d*-[a-f0-9]{16}\.(?:jpg|png|webp)$`);
    next.thumbnail_url = localThumbnail.test(body.thumbnail_url || '') ? body.thumbnail_url : previous && sameVideo(previous) && localThumbnail.test(previous.thumbnail_url || '') ? previous.thumbnail_url : await vimeo.thumbnail(video);
    return store.update('lessons', lessonId, () => next);
  }
  // A new lesson keeps the Vimeo ID as its ID when that is free. Lesson IDs never change when the
  // video of a lesson is replaced, so the ID may belong to another lesson by now; progress rows are
  // keyed by lesson ID, so a deleted lesson's ID is only reused for the same video, which restores it.
  async function newLessonId(preferred, sameVideo) {
    const all = await store.list('lessons');
    const taken = all.find(l => Number(l.id) === preferred);
    if (Number.isSafeInteger(preferred) && preferred > 0 && (!taken || taken.is_deleted && sameVideo(taken))) return preferred;
    const restored = all.find(l => l.is_deleted && sameVideo(l));
    if (restored) return restored.id;
    return Math.max(0, ...all.map(l => Number(l.id)).filter(Number.isSafeInteger)) + 1;
  }
  // Title, duration and full Vimeo ID from a pasted link, to fill the lesson form.
  async function lookupVideo(input) {
    const info = await vimeo.lookup(input);
    const lesson = (await configuration()).lessons.find(l => String(l.vimeo_video_id).split('/')[0] === info.vimeo_video_id.split('/')[0]);
    return { ...info, existing: lesson ? { id: lesson.id, title: lesson.title } : null };
  }
  async function saveStage(id, body) {
    const config = await configuration();
    const previous = id ? config.stages.find(s => Number(s.id) === Number(id)) : null;
    if (id && !previous) throw fail('Chương không tồn tại.');
    const row = { ...previous, ...body };
    if (!String(row.title || '').trim()) throw fail('Nhập tên chương.');
    const stageId = previous?.id || Date.now();
    const position = Number(row.position || config.stages.length + 1);
    if (!Number.isFinite(position) || position < 1) throw fail('Thứ tự chương không hợp lệ.');
    return store.update('stages', stageId, () => ({ id: stageId, title: String(row.title).trim().slice(0, 500), position, is_visible: row.is_visible !== false, is_deleted: false }));
  }
  async function remove(kind, id) {
    const row = await store.get(kind, id);
    if (!row || row.is_deleted) throw fail('Không tìm thấy dữ liệu.');
    if (kind === 'stages') for (const l of (await configuration()).lessons.filter(l => Number(l.stage_id) === Number(id))) await store.update('lessons', l.id, p => ({ ...p, stage_id: null }));
    await store.update(kind, id, p => ({ ...p, is_deleted: true, is_visible: false }));
    return { success: true };
  }
  async function reorder(kind, ids) {
    const rows = (await configuration())[kind];
    if (!Array.isArray(ids) || ids.length !== rows.length || new Set(ids.map(Number)).size !== ids.length || rows.some(r => !ids.map(Number).includes(Number(r.id)))) throw fail('Danh sách sắp xếp không hợp lệ.');
    await store.serial(`reorder:${kind}`, async () => { for (let i = 0; i < ids.length; i++) await store.update(kind, ids[i], row => ({ ...row, position: i + 1 })); });
    return { success: true };
  }
  async function assignLessons(ids, stageId) {
    const config = await configuration(), stage = Number(stageId) || null;
    if (!Array.isArray(ids) || !ids.length || new Set(ids.map(Number)).size !== ids.length || ids.some(id => !config.lessons.some(l => Number(l.id) === Number(id)))) throw fail('Danh sách bài học không hợp lệ.');
    if (stage && !config.stages.some(s => Number(s.id) === stage)) throw fail('Chương không tồn tại.');
    for (const id of ids) await saveLesson(id, { stage_id: stage });
    return { success: true };
  }
  // Thumbnails are stored locally when a lesson is saved; after the cover is changed on
  // Vimeo, this downloads the current one for every lesson.
  async function refreshThumbnails() {
    const lessons = (await configuration()).lessons;
    for (const lesson of lessons) {
      const thumbnail_url = await vimeo.thumbnail(lesson.vimeo_video_id);
      await store.update('lessons', lesson.id, previous => ({ ...previous, thumbnail_url, updated_at: new Date().toISOString() }));
    }
    return { success: true, refreshed: lessons.length };
  }
  // The CTA library is shared by every course; lesson and chapter IDs are checked for this course.
  async function ctas() { return { ctas: await cta.listCtas(crm, { fresh: true }) }; }
  async function saveCta(id, body = {}) {
    const config = await configuration();
    const saved = await cta.updateCtas(crm, list => {
      const previous = id ? list.find(row => row.id === id) : null;
      if (id && !previous) throw fail('CTA không tồn tại.');
      if (!id && list.length >= cta.MAX_CTAS) throw fail(`Thư viện có tối đa ${cta.MAX_CTAS} CTA.`);
      const next = cta.normalizeCta({ ...previous, ...body, targets: { ...previous?.targets, ...body.targets }, id: previous?.id || cta.newId(), updated_at: new Date().toISOString() });
      cta.validateCta(next);
      const target = next.targets[course.id];
      const known = new Set((target.scope === 'stages' ? config.stages : config.lessons).map(row => Number(row.id)));
      if (['stages', 'lessons'].includes(target.scope) && target.ids.some(value => !known.has(value))) throw fail(target.scope === 'stages' ? 'Chương không tồn tại.' : 'Bài học không tồn tại.');
      return previous ? list.map(row => row.id === id ? next : row) : [...list, next];
    });
    return saved.find(row => row.id === id) || saved.at(-1);
  }
  async function removeCta(id) {
    await cta.updateCtas(crm, list => {
      if (!list.some(row => row.id === id)) throw fail('CTA không tồn tại.');
      return list.filter(row => row.id !== id);
    });
    return { success: true };
  }
  return { course, report, ctas, saveCta, removeCta, configuration, saveLesson, saveStage, remove, reorder, lookupVideo, assignLessons, refreshThumbnails };
}
const services = new Map();
function getAdminService(courseId = 'dong-tien') {
  if (!services.has(courseId)) services.set(courseId, createAdminService({ course: getCourse(courseId) }));
  return services.get(courseId);
}
module.exports = { createAdminService, getAdminService };
