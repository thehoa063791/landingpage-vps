const storage = require('./storage');
const { createRepository } = require('./dongTienRepository');
const { createVimeoClient } = require('./dongTienVimeo');
const fail = message => Object.assign(new Error(message), { status: 400 });
const ordered = rows => rows.sort((a, b) => Number(a.position || a.id) - Number(b.position || b.id));
const region = value => /hà nội/i.test(value || '') ? 'Hà Nội' : /hồ chí minh/i.test(value || '') ? 'Hồ Chí Minh' : 'Khu vực khác';

function createAdminService({ store = createRepository(), crm = storage, vimeo = createVimeoClient() } = {}) {
  let vimeoSnapshot;
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
    const leads = registrations.filter(l => l.page_id === 'dong-tien' && inDate(l.registered_at));
    const byId = new Map(leads.map(l => [l.id, l]));
    const pByKey = new Map(progress.filter(p => byId.has(p.registration_id)).map(p => [`${p.registration_id}:${p.lesson_id}`, p]));
    const learnerById = new Map(learners.map(l => [l.registration_id, l]));
    const views = events.filter(e => e.event === 'lesson_view' && e.data?.page_id === 'dong-tien' && byId.has(e.data.registration_id) && inDate(e.timestamp));
    const openedKeys = new Set(views.map(e => `${e.data.registration_id}:${e.data.lesson_id}`));
    const lessonsById = new Map(lessons.map(l => [Number(l.id), l]));
    const students = leads.map(l => {
      const completed = active.filter(lesson => pByKey.get(`${l.id}:${lesson.id}`)?.is_completed).length;
      return { id: l.id, name: l.name, email: l.email, phone: l.phone, region: region(l.region), registered_at: l.registered_at, completed, total_lessons: active.length, completion_percent: active.length ? completed / active.length * 100 : 0,
        lessons: lessons.map(lesson => {
          const p = pByKey.get(`${l.id}:${lesson.id}`);
          return { lesson_id: Number(lesson.id), title: lesson.title, is_visible: visibleIds.has(Number(lesson.id)), watch_percent: p?.watch_percent || 0, watched_seconds: (p?.watched_ranges || []).reduce((sum, [a, b]) => sum + b - a, 0), last_position: p?.last_position || 0, completed: !!p?.is_completed, completed_at: p?.completed_at || null, updated_at: p?.updated_at || null, opened: openedKeys.has(`${l.id}:${lesson.id}`), answers: learnerById.get(l.id)?.survey_answers?.[lesson.id] || null };
        }) };
    }).sort((a, b) => String(b.registered_at).localeCompare(String(a.registered_at)));
    const lesson_stats = lessons.map(l => {
      const viewers = students.filter(s => s.lessons.some(p => p.lesson_id === Number(l.id) && (p.opened || p.watched_seconds > 0 || p.completed)));
      const completed = students.filter(s => s.lessons.some(p => p.lesson_id === Number(l.id) && p.completed)).length;
      return { ...l, stage_title: stageById.get(Number(l.stage_id))?.title || '', viewers: viewers.length, completed, completion_rate: viewers.length ? completed / viewers.length * 100 : 0, learner_ids: viewers.map(s => s.id) };
    });
    const full = active.length ? students.filter(s => s.completed === active.length).length : 0;
    const history = views.map(e => {
      const lead = byId.get(e.data.registration_id), p = pByKey.get(`${lead.id}:${e.data.lesson_id}`);
      return { id: e.event_id || e.id, registration_id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, region: region(lead.region), lesson_id: Number(e.data.lesson_id), title: lessonsById.get(Number(e.data.lesson_id))?.title || `Bài ${e.data.lesson_id}`, opened_at: e.timestamp, watch_percent: p?.watch_percent || 0, completed: !!p?.is_completed };
    }).sort((a, b) => String(b.opened_at).localeCompare(String(a.opened_at)));
    return { lessons: lesson_stats, stages, students, history, summary: { students: students.length, sessions: history.length, completed_students: full, completion_rate: students.length ? full / students.length * 100 : 0, regions: ['Hà Nội', 'Hồ Chí Minh', 'Khu vực khác'].map(name => ({ name, count: students.filter(s => s.region === name).length })) } };
  }
  function validateQuestions(content) {
    let parsed;
    try { parsed = typeof content === 'string' ? JSON.parse(content || '{"questions":[]}') : content; }
    catch { throw fail('Cấu hình câu hỏi không hợp lệ.'); }
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length > 30) throw fail('Cấu hình câu hỏi không hợp lệ.');
    const ids = new Set();
    for (const q of parsed.questions) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(q.id) || ids.has(q.id) || !['text', 'single_choice'].includes(q.type) || !String(q.text || '').trim() || String(q.text).length > 2000) throw fail('Mỗi câu hỏi cần mã riêng, nội dung và loại hợp lệ.');
      ids.add(q.id);
      if (q.type === 'single_choice' && (!Array.isArray(q.options) || !q.options.length || q.options.length > 30 || new Set(q.options.map(o => o.value)).size !== q.options.length || q.options.some(o => !String(o.value || '').trim() || !String(o.label || '').trim()))) throw fail('Câu hỏi lựa chọn cần các đáp án có mã riêng.');
    }
    if (JSON.stringify(parsed).length > 20000) throw fail('Cấu hình câu hỏi quá dài.');
    return JSON.stringify(parsed);
  }
  async function saveLesson(id, body) {
    const config = await configuration();
    const previous = id ? config.lessons.find(l => Number(l.id) === Number(id)) : null;
    if (id && !previous) throw fail('Bài học không tồn tại.');
    const row = { ...previous, ...body };
    const video = String(row.vimeo_video_id || '').trim();
    const lessonId = previous?.id || Number(body.id || video.split('/')[0]);
    if (!Number.isSafeInteger(lessonId) || lessonId < 1 || !/^\d+(?:\/[a-zA-Z0-9]+)?$/.test(video) || !String(row.title || '').trim() || !Number.isFinite(Number(row.duration)) || Number(row.duration) <= 0 || Number(row.duration) > 172800) throw fail('Kiểm tra tiêu đề, Vimeo ID và thời lượng bài học.');
    if (!previous && config.lessons.some(l => Number(l.id) === lessonId)) throw fail('Bài học đã tồn tại.');
    const stageId = Number(row.stage_id) || null;
    if (stageId && !config.stages.some(s => Number(s.id) === stageId)) throw fail('Chương không tồn tại.');
    const popup = Number(row.unlock_after_seconds || 0);
    if (!Number.isFinite(popup) || popup < 0 || popup > Number(row.duration)) throw fail('Thời điểm hiện khảo sát phải nằm trong video.');
    const next = { ...previous, id: lessonId, title: String(row.title).trim().slice(0, 500), vimeo_video_id: video, duration: Number(row.duration), description: String(row.description || '').slice(0, 20000), position: Number(row.position || config.lessons.length + 1), stage_id: stageId, is_visible: row.is_visible !== false, show_popup: !!row.show_popup, show_unlock_time: !!row.show_unlock_time, unlock_after_seconds: popup, hidden_content: validateQuestions(row.hidden_content || { questions: [] }), is_deleted: false, updated_at: new Date().toISOString() };
    if (!Number.isFinite(next.position) || next.position < 1) throw fail('Thứ tự bài học không hợp lệ.');
    const localThumbnail = /^\/dong-tien\/api\/learning\/thumbnails\/[1-9]\d*-[a-f0-9]{16}\.(?:jpg|png|webp)$/;
    next.thumbnail_url = localThumbnail.test(body.thumbnail_url || '') ? body.thumbnail_url : previous?.vimeo_video_id === video && localThumbnail.test(previous.thumbnail_url || '') ? previous.thumbnail_url : await vimeo.thumbnail(video);
    return store.update('lessons', lessonId, () => next);
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
  async function vimeoCatalog() {
    vimeoSnapshot = { data: await vimeo.catalog(), at: Date.now() };
    return vimeoSnapshot.data;
  }
  async function importVideos(ids, options = {}) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 10000 || new Set(ids.map(Number)).size !== ids.length) throw fail('Chọn danh sách bài học hợp lệ.');
    const source = vimeoSnapshot && Date.now() - vimeoSnapshot.at < 5 * 60000 ? vimeoSnapshot.data : await vimeoCatalog(), config = await configuration();
    const stageId = options.stage_id === undefined ? undefined : Number(options.stage_id) || null;
    if (stageId && !config.stages.some(s => Number(s.id) === stageId)) throw fail('Chương không tồn tại.');
    if (ids.some(id => !source.rows.some(v => Number(v.id) === Number(id)))) throw fail('Video không có trong danh mục Vimeo.');
    let nextPosition = Math.max(0, ...config.lessons.map(l => Number(l.position))) + 1;
    for (const id of ids) {
      const video = source.rows.find(v => Number(v.id) === Number(id));
      const previous = config.lessons.find(l => l.vimeo_video_id.split('/')[0] === video.vimeo_video_id.split('/')[0]);
      await saveLesson(previous?.id || null, { ...video, ...previous, vimeo_video_id: video.vimeo_video_id, thumbnail_url: video.thumbnail_url, duration: video.duration, position: previous?.position || nextPosition++, is_visible: previous?.is_visible ?? options.is_visible !== false, ...(stageId !== undefined ? { stage_id: stageId } : {}) });
    }
    return { success: true, imported: ids.length };
  }
  async function assignLessons(ids, stageId) {
    const config = await configuration(), stage = Number(stageId) || null;
    if (!Array.isArray(ids) || !ids.length || new Set(ids.map(Number)).size !== ids.length || ids.some(id => !config.lessons.some(l => Number(l.id) === Number(id)))) throw fail('Danh sách bài học không hợp lệ.');
    if (stage && !config.stages.some(s => Number(s.id) === stage)) throw fail('Chương không tồn tại.');
    for (const id of ids) await saveLesson(id, { stage_id: stage });
    return { success: true };
  }
  return { report, configuration, saveLesson, saveStage, remove, reorder, vimeoCatalog, importVideos, assignLessons };
}
let service;
const getAdminService = () => service ||= createAdminService();
module.exports = { createAdminService, getAdminService };
