const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const storage = require('./storage');
const { createRepository } = require('./dongTienRepository');
const { parseUA } = require('./utils');

const PAGE = 'dong-tien';
const COURSE = 1;
const localSecret = crypto.randomBytes(32).toString('hex');
function failure(status, message) { const error = new Error(message); error.status = status; return error; }
const clean = value => String(value ?? '').trim();
const emailKey = value => clean(value).toLowerCase();
function mergeRanges(ranges, duration) {
  const valid = ranges.filter(r => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite))
    .map(([start, end]) => [Math.max(0, Math.min(duration, start)), Math.max(0, Math.min(duration, end))])
    .filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of valid) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]); else merged.push(range);
  }
  return merged;
}

function createLearningService({ store = createRepository(), crm = storage, secret = process.env.DONG_TIEN_SESSION_SECRET || process.env.JWT_SECRET || process.env.ADMIN_COOKIE_SECRET || process.env.ADMIN_PASSWORD || (process.env.NODE_ENV !== 'production' ? localSecret : '') } = {}) {
  function token(lead) {
    if (!secret) throw failure(503, 'Chưa cấu hình khóa phiên học.');
    return jwt.sign({ page_id: PAGE }, secret, { subject: String(lead.id), audience: 'dong-tien-learning', issuer: 'landingpage-admin', expiresIn: '24h', algorithm: 'HS256' });
  }
  async function findLead(email) {
    return (await crm.getRegistrations()).filter(r => r.page_id === PAGE && emailKey(r.email) === emailKey(email))
      .sort((a, b) => String(a.registered_at).localeCompare(String(b.registered_at)))[0] || null;
  }
  async function profile(lead) {
    const learner = await store.get('learners', lead.id) || {};
    return { id: lead.id, full_name: lead.name, email: emailKey(lead.email), phone: lead.phone, region: lead.region, interest: lead.interest || '', tour_completed: !!learner.tour_completed, survey_answers: learner.survey_answers || {} };
  }
  async function authenticate(bearer) {
    let claims;
    try { claims = jwt.verify(bearer, secret, { algorithms: ['HS256'], audience: 'dong-tien-learning', issuer: 'landingpage-admin' }); }
    catch { throw failure(401, 'Phiên học đã hết hạn. Vui lòng đăng nhập lại.'); }
    const lead = await crm.getRegistrationById(claims.sub);
    if (!lead || lead.page_id !== PAGE || claims.page_id !== PAGE) throw failure(401, 'Phiên học không hợp lệ.');
    return lead;
  }
  async function event(name, lead, data = {}, context = {}) {
    await store.serial('learning-events', () => crm.insertEvent({ event: name, event_id: context.event_id || crypto.randomUUID(), session_id: context.session_id || lead?.session_id || '', ip: context.ip || '', timestamp: new Date().toISOString(), data: { ...data, device: parseUA(context.user_agent || ''), page_id: PAGE, registration_id: lead?.id || null, email: lead ? emailKey(lead.email) : '', url: context.url || '', ...(context.utm || {}) } }));
  }
  async function session(lead, eventName, context) {
    await store.update('learners', lead.id, previous => ({ ...previous, registration_id: lead.id, last_login_at: new Date().toISOString() }));
    await event(eventName, lead, {}, context);
    return { access_token: token(lead), token_type: 'bearer', user: await profile(lead) };
  }
  async function register(body, context = {}) {
    const name = clean(body.full_name || body.name), email = emailKey(body.email), phone = clean(body.phone), region = clean(body.region);
    if (!name || !region || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{9,11}$/.test(phone.replace(/\D/g, ''))) throw failure(400, 'Vui lòng kiểm tra họ tên, email, số điện thoại và khu vực.');
    return store.serial(`register:${email}`, async () => {
      let lead = await findLead(email);
      let eventId;
      if (!lead) {
        const record = { id: crypto.randomUUID(), name, email, phone, region, interest: clean(body.interest), page_id: PAGE, registered_at: new Date().toISOString(), ip: context.ip || '', user_agent: context.user_agent || '', device: parseUA(context.user_agent || ''), geo: null };
        for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','referrer','fbclid','gclid','ttclid','msclkid','twclid','fbc','fbp','ga','session_id','event_source_url']) record[key] = clean(body[key]).slice(0, 2048);
        await crm.insertRegistration(record);
        await crm.tagLeadByPage(record);
        lead = record;
        eventId = record.id;
        await event('conversion', lead, { utm_source: record.utm_source, utm_medium: record.utm_medium, utm_campaign: record.utm_campaign, utm_content: record.utm_content, utm_term: record.utm_term }, { ...context, event_id: eventId, session_id: record.session_id, url: record.event_source_url });
      }
      return { ...await session(lead, 'learning_login', context), ...(eventId ? { event_id: eventId } : {}) };
    });
  }
  async function login(body, context = {}) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailKey(body.email))) throw failure(400, 'Vui lòng nhập email hợp lệ.');
    const lead = await findLead(body.email);
    if (!lead) throw failure(404, 'Email chưa đăng ký. Vui lòng đăng ký trước khi vào học.');
    return session(lead, 'learning_login', context);
  }
  async function catalog() {
    const [lessons, stages] = await Promise.all([store.list('lessons'), store.list('stages')]);
    const byStage = new Map(stages.map(stage => [Number(stage.id), stage]));
    return lessons.filter(l => !l.is_deleted && l.is_visible !== false && l.vimeo_video_id && Number(l.duration) > 0 && (!l.stage_id || (byStage.has(Number(l.stage_id)) && !byStage.get(Number(l.stage_id)).is_deleted && byStage.get(Number(l.stage_id)).is_visible !== false)))
      .map(l => ({ ...l, stage_title: byStage.get(Number(l.stage_id))?.title || l.stage_title, stage_position: byStage.get(Number(l.stage_id))?.position || l.stage_position }))
      .sort((a, b) => Number(a.stage_position ?? Number.MAX_SAFE_INTEGER) - Number(b.stage_position ?? Number.MAX_SAFE_INTEGER) || Number(a.position || a.id) - Number(b.position || b.id));
  }
  async function lesson(id) {
    const row = (await catalog()).find(l => Number(l.id) === Number(id));
    if (!row) throw failure(404, 'Không tìm thấy bài học.');
    return row;
  }
  function emptyProgress(lead, l) {
    const now = new Date().toISOString();
    return { id: `${lead.id}:${l.id}`, user_id: lead.id, registration_id: lead.id, course_id: COURSE, lesson_id: Number(l.id), duration: Number(l.duration), last_position: 0, furthest_position: 0, watched_ranges: [], watch_percent: 0, is_completed: false, playback_speed: 100, created_at: now, updated_at: now };
  }
  async function getProgress(lead, id) {
    const l = await lesson(id);
    return await store.get('progress', `${lead.id}:${l.id}`) || emptyProgress(lead, l);
  }
  async function lessons(lead) {
    const [rows, progress, learner] = await Promise.all([catalog(), store.list('progress'), store.get('learners', lead.id)]);
    return rows.map(l => {
      const p = progress.find(p => p.registration_id === lead.id && Number(p.lesson_id) === Number(l.id));
      return { unlock_after_seconds: 0, show_unlock_time: false, show_popup: false, ...l, id: Number(l.id), unlocked: true, progress: { watch_time: p?.last_position || 0, completed: !!p?.is_completed, survey_submitted: !!learner?.survey_answers?.[l.id] } };
    });
  }
  async function saveProgress(lead, id, body, context = {}) {
    const l = await lesson(id);
    if (Number(body.lesson_id) !== Number(id) || ![body.current_position, body.furthest_position, body.playback_speed].every(Number.isFinite) || body.current_position < 0 || body.furthest_position < 0 || body.playback_speed < 0.25 || body.playback_speed > 4 || !Array.isArray(body.watched_ranges) || body.watched_ranges.length > 1000 || body.watched_ranges.some(r => !Array.isArray(r) || r.length !== 2 || !r.every(Number.isFinite) || r[0] < 0 || r[1] < r[0])) throw failure(400, 'Dữ liệu tiến độ không hợp lệ.');
    let completedNow = false;
    const next = await store.update('progress', `${lead.id}:${l.id}`, previous => {
      const p = previous || emptyProgress(lead, l);
      const watched_ranges = mergeRanges([...p.watched_ranges, ...body.watched_ranges], Number(l.duration));
      const watchedSeconds = watched_ranges.reduce((sum, [start, end]) => sum + end - start, 0);
      const watch_percent = Math.min(100, watchedSeconds / Number(l.duration) * 100);
      const is_completed = p.is_completed || watch_percent >= 95;
      completedNow = is_completed && !p.is_completed;
      return { ...p, last_position: Math.min(Number(l.duration), body.current_position), furthest_position: Math.max(p.furthest_position, Math.min(Number(l.duration), body.furthest_position)), watched_ranges, watch_percent, is_completed, completed_at: p.completed_at || (is_completed ? new Date().toISOString() : null), playback_speed: Math.round(body.playback_speed * 100), updated_at: new Date().toISOString() };
    });
    await event(completedNow ? 'lesson_completed' : 'learning_progress', lead, { lesson_id: l.id, watch_percent: next.watch_percent, watched_seconds: next.watched_ranges.reduce((sum, [a,b]) => sum + b-a, 0), current_position: next.last_position }, context);
    return next;
  }
  async function updatePosition(lead, body) {
    const l = await lesson(body.video_id);
    if (!Number.isFinite(body.watch_time) || body.watch_time < 0) throw failure(400, 'Thời gian xem không hợp lệ.');
    // This compatibility endpoint updates the resume position, never invents watched ranges.
    const p = await store.update('progress', `${lead.id}:${l.id}`, previous => ({ ...(previous || emptyProgress(lead, l)), last_position: Math.min(l.duration, body.watch_time), updated_at: new Date().toISOString() }));
    return { watch_time: p.last_position, completed: p.is_completed, unlocked: true, hidden_content: l.hidden_content || '' };
  }
  async function submitSurvey(lead, body, context = {}) {
    if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers) || JSON.stringify(body.answers).length > 20000) throw failure(400, 'Câu trả lời khảo sát không hợp lệ.');
    const l = await lesson(body.lesson_id);
    const questions = JSON.parse(l.hidden_content || '{"questions":[]}').questions || [];
    for (const q of questions) {
      const answer = body.answers[q.id];
      if (q.required !== false && (typeof answer !== 'string' || !answer.trim())) throw failure(400, 'Vui lòng trả lời các câu hỏi bắt buộc.');
      if (answer !== undefined && (typeof answer !== 'string' || answer.length > 5000 || q.type === 'single_choice' && !q.options?.some(option => option.value === answer))) throw failure(400, 'Câu trả lời không hợp lệ.');
    }
    const submitted_at = new Date().toISOString();
    await store.update('learners', lead.id, previous => ({ ...previous, registration_id: lead.id, survey_answers: { ...previous?.survey_answers, [l.id]: body.answers }, survey_submitted_at: submitted_at }));
    await crm.insertSurvey({ ...body.answers, registration_id: lead.id, page_id: PAGE, submitted_at });
    await event('learning_survey', lead, { lesson_id: l.id, answers: body.answers }, context);
    return { success: true };
  }
  async function completeTour(lead) {
    await store.update('learners', lead.id, previous => ({ ...previous, registration_id: lead.id, tour_completed: true }));
    return { success: true };
  }
  async function completion(lead) {
    const rows = await catalog(), p = await store.list('progress');
    const video_details = rows.map(l => { const row = p.find(r => r.registration_id === lead.id && Number(r.lesson_id) === Number(l.id)); return { lesson_id: Number(l.id), is_completed: !!row?.is_completed, watch_percent: row?.watch_percent || 0, completed_at: row?.completed_at || null }; });
    const completed_videos = video_details.filter(v => v.is_completed).length;
    return { course_id: COURSE, total_videos: rows.length, completed_videos, completion_percentage: rows.length ? completed_videos / rows.length * 100 : 0, video_details };
  }
  async function stats() {
    const [allLeads, rows, progress, learners] = await Promise.all([crm.getRegistrations(), catalog(), store.list('progress'), store.list('learners')]);
    const leads = allLeads.filter(r => r.page_id === PAGE), byId = new Map(leads.map(r => [r.id, r]));
    const sessions = progress.filter(p => byId.has(p.registration_id)).map(p => {
      const lead = byId.get(p.registration_id), l = rows.find(l => Number(l.id) === Number(p.lesson_id));
      return { session_id: p.id, registration_id: lead.id, email: lead.email, fullName: lead.name, phone: lead.phone, region: lead.region, watch_time: p.watched_ranges.reduce((sum,[a,b])=>sum+b-a,0), completed: p.is_completed, pct: p.watch_percent, is_unlocked: true, has_survey_answer: !!learners.find(u => u.registration_id === lead.id)?.survey_answers?.[p.lesson_id], lesson: l || { id: p.lesson_id, title: '', duration: p.duration }, createdAt: p.created_at };
    });
    return { users: leads.map(l => ({ email: l.email, fullName: l.name, phone: l.phone, region: l.region, createdAt: l.registered_at, progress: { completed: sessions.filter(s => s.email === l.email && s.completed).length } })), sessions, answers: learners.filter(u => byId.has(u.registration_id)).flatMap(u => Object.entries(u.survey_answers || {}).map(([lesson_id, answers]) => ({ email: byId.get(u.registration_id).email, lesson_id, answers }))) };
  }
  return { register, login, authenticate, profile, lessons, catalog, getProgress, saveProgress, updatePosition, submitSurvey, completeTour, completion, event, stats };
}
let instance;
const getLearningService = () => instance ||= createLearningService();
module.exports = { createLearningService, getLearningService, mergeRanges };
