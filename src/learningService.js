const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const storage = require('./storage');
const { createRepository } = require('./learningRepository');
const { getCourse } = require('./learningCourses');
const { summarizeCourse } = require('./learningProgress');
const { parseUA } = require('./utils');
const { listCtas, ctasForLesson } = require('./learningCta');

// Learner-facing progress keeps the original single-course ID.
const COURSE = 1;
const localSecret = crypto.randomBytes(32).toString('hex');
function failure(status, message, code) { const error = new Error(message); error.status = status; if (code) error.code = code; return error; }
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

function createLearningService({ course = getCourse('dong-tien'), store = createRepository({ course: course.id }), crm = storage, integrations = {}, secret = process.env.LEARNING_SESSION_SECRET || process.env.DONG_TIEN_SESSION_SECRET || process.env.JWT_SECRET || process.env.ADMIN_COOKIE_SECRET || process.env.ADMIN_PASSWORD || (process.env.NODE_ENV !== 'production' ? localSecret : '') } = {}) {
  const PAGE = course.page_id, audience = `${course.id}-learning`;
  // Like /api/register: CAPI and webhooks never delay the learner's session.
  function notifyRegistration(record, context) {
    const tasks = [];
    if (course.capi) {
      const { sendRegistrationEvents } = integrations.capi || require('./metaCapi');
      tasks.push(sendRegistrationEvents({ headers: { 'user-agent': context.user_agent || '' }, protocol: 'https', body: { session_id: record.session_id } }, record));
    }
    if (course.webhooks) {
      const { fireWebhooks, buildWebhookPayload } = integrations.webhooks || require('./webhooks');
      tasks.push(fireWebhooks(buildWebhookPayload(record)));
    }
    Promise.allSettled(tasks)
      .then(results => results.filter(r => r.status === 'rejected').forEach(r => console.warn('[learning] registration integration failed:', r.reason?.message)));
  }
  // Meta CAPI (course.capi) for a known learner: one event per milestone and learner,
  // matched by the lead's hashed contact data. Fire and forget, like registrations.
  const capiRequest = (context = {}, sessionId = '') => ({ headers: { 'user-agent': context.user_agent || '', ...(context.ip ? { 'x-forwarded-for': context.ip } : {}) }, protocol: 'https', body: { session_id: sessionId } });
  async function milestone(lead, name, context = {}, data = {}) {
    if (!course.capi || !lead) return;
    let first = false;
    try {
      // Read first: most lesson views come after StartLearning was already sent.
      if ((await store.get('learners', lead.id))?.meta_events?.[name]) return;
      await store.update('learners', lead.id, previous => {
        if (previous?.meta_events?.[name]) return previous;
        first = true;
        return { ...previous, registration_id: lead.id, meta_events: { ...previous?.meta_events, [name]: new Date().toISOString() } };
      });
    } catch (error) {
      // A milestone never blocks recording the learning event itself.
      console.warn('[learning] Meta milestone not recorded:', error.message);
      return;
    }
    if (!first) return;
    const { sendLeadEvent } = integrations.capi || require('./metaCapi');
    Promise.resolve(sendLeadEvent(capiRequest(context, lead.session_id), lead, name, `${name}:${lead.id}`, { ...data, url: context.url || '', content_name: course.title, content_category: 'course' }))
      .catch(error => console.warn('[learning] Meta milestone failed:', error.message));
  }
  // Landing views of new visitors reach Meta like the other funnels' /api/track, with
  // the browser Pixel's event ID; lesson pages, returning learners and engagement
  // timers (time, scroll, exit) stay internal.
  const LANDING_CAPI_EVENTS = new Set(['pageview', 'form_open', 'form_submit']);
  function landingEvent(name, lead, data, req) {
    if (!course.capi || lead || !LANDING_CAPI_EVENTS.has(name) || data.returning_learner || data.funnel_step === 'learn' || /\/learn(?:\/|$|\?)/.test(String(data.url || ''))) return;
    const { sendTrackEvent } = integrations.capi || require('./metaCapi');
    Promise.resolve(sendTrackEvent(req, name, data)).catch(error => console.warn('[learning] Meta landing event failed:', error.message));
  }
  function token(lead) {
    if (!secret) throw failure(503, 'Chưa cấu hình khóa phiên học.');
    return jwt.sign({ page_id: PAGE }, secret, { subject: String(lead.id), audience, issuer: 'landingpage-admin', expiresIn: '24h', algorithm: 'HS256' });
  }
  async function findLead(email) {
    return (await crm.getRegistrations()).filter(r => r.page_id === PAGE && emailKey(r.email) === emailKey(email))
      .sort((a, b) => String(a.registered_at).localeCompare(String(b.registered_at)))[0] || null;
  }
  async function profile(lead) {
    const learner = await store.get('learners', lead.id) || {};
    return { id: lead.id, full_name: lead.name, email: emailKey(lead.email), phone: lead.phone, region: lead.region, interest: lead.interest || '', tour_completed: !!learner.tour_completed };
  }
  async function authenticate(bearer) {
    let claims;
    try { claims = jwt.verify(bearer, secret, { algorithms: ['HS256'], audience, issuer: 'landingpage-admin' }); }
    catch { throw failure(401, 'Phiên học đã hết hạn. Vui lòng đăng nhập lại.'); }
    const lead = await crm.getRegistrationById(claims.sub);
    if (!lead || lead.page_id !== PAGE || claims.page_id !== PAGE) throw failure(401, 'Phiên học không hợp lệ.');
    return lead;
  }
  async function event(name, lead, data = {}, context = {}) {
    if (name === 'lesson_view') await milestone(lead, 'StartLearning', context, { lesson_id: data.lesson_id });
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
      // A known email signs in from the login form: the landing shows "đã đăng ký" with a
      // login button instead of silently opening the course from the registration form.
      const existing = await findLead(email);
      if (existing && body.signin_if_registered === true) {
        // Contact links (AI customer care): an email that is already registered signs in,
        // as an ?email= link does. The lead keeps its data; the link's details are kept
        // as one more form entry in its history for sales.
        if (typeof crm.appendRegistrationForm === 'function') {
          await crm.appendRegistrationForm(existing.id, { name, email, phone, region, page_id: PAGE, registered_at: new Date().toISOString(), utm_source: clean(body.utm_source), utm_medium: clean(body.utm_medium), utm_campaign: clean(body.utm_campaign), session_id: clean(body.session_id), event_source_url: clean(body.event_source_url) }, { source: 'contact_link', update_latest: false })
            .catch(error => console.warn('[learning] contact link form not recorded:', error.message));
        }
        return { ...await session(existing, 'learning_login', context), existing: true };
      }
      if (existing) throw failure(409, 'Email này đã được đăng ký trên hệ thống.', 'already_registered');
      // Email thật (Debounce) unless the person is already in the CRM from another funnel.
      const emailProblem = await (integrations.emailRejection || require('./emailValidation').rejection)(email, { registrations: await crm.getRegistrations() });
      if (emailProblem) throw failure(400, emailProblem.message, 'email_invalid');
      const record = { id: crypto.randomUUID(), name, email, phone, region, interest: clean(body.interest), ...(course.lead_attendance ? { attendance: course.lead_attendance } : {}), page_id: PAGE, registered_at: new Date().toISOString(), ip: context.ip || '', user_agent: context.user_agent || '', device: parseUA(context.user_agent || '') };
      // As in /api/register: location for CRM reports and CAPI matching, never blocking on failure.
      const geo = await (integrations.lookupGeo || require('./utils').lookupGeo)(record.ip).catch(() => null);
      Object.assign(record, { geo, city: geo?.city || '', state: geo?.region || '', zip: geo?.zip || '' });
      for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','referrer','fbclid','gclid','ttclid','msclkid','twclid','fbc','fbp','ga','session_id','event_source_url']) record[key] = clean(body[key]).slice(0, 2048);
      await crm.insertRegistration(record);
      await crm.tagLeadByPage(record);
      await event('conversion', record, { utm_source: record.utm_source, utm_medium: record.utm_medium, utm_campaign: record.utm_campaign, utm_content: record.utm_content, utm_term: record.utm_term }, { ...context, event_id: record.id, session_id: record.session_id, url: record.event_source_url });
      notifyRegistration(record, context);
      return { ...await session(record, 'learning_login', context), event_id: record.id };
    });
  }
  async function login(body, context = {}) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailKey(body.email))) throw failure(400, 'Vui lòng nhập email hợp lệ.');
    const lead = await findLead(body.email);
    if (!lead) throw failure(404, 'Email chưa đăng ký. Vui lòng đăng ký trước khi vào học.', 'not_registered');
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
    const [rows, progress, ctas] = await Promise.all([catalog(), store.listForLearner(lead.id), courseCtas()]);
    return rows.map(row => {
      // Fields of the former lesson survey stay stored but are no longer sent.
      const { hidden_content, show_popup, show_unlock_time, unlock_after_seconds, ...l } = row;
      const p = progress.find(p => Number(p.lesson_id) === Number(l.id));
      return { ...l, id: Number(l.id), unlocked: true, ctas: ctasForLesson(ctas, course.id, l), progress: { watch_time: p?.last_position || 0, completed: !!p?.is_completed } };
    });
  }
  // CTAs never block the lesson list.
  async function courseCtas() {
    try { return await listCtas(crm); }
    catch (error) { console.warn('[learning] CTA library unavailable:', error.message); return []; }
  }
  async function saveProgress(lead, id, body, context = {}) {
    const l = await lesson(id);
    if (Number(body.lesson_id) !== Number(id) || ![body.current_position, body.furthest_position, body.playback_speed].every(Number.isFinite) || body.current_position < 0 || body.furthest_position < 0 || body.playback_speed < 0.25 || body.playback_speed > 4 || !Array.isArray(body.watched_ranges) || body.watched_ranges.length > 1000 || body.watched_ranges.some(r => !Array.isArray(r) || r.length !== 2 || !r.every(Number.isFinite) || r[0] < 0 || r[1] < r[0])) throw failure(400, 'Dữ liệu tiến độ không hợp lệ.');
    let completedNow = false, crossed = [];
    const next = await store.update('progress', `${lead.id}:${l.id}`, previous => {
      const p = previous || emptyProgress(lead, l);
      const watched_ranges = mergeRanges([...p.watched_ranges, ...body.watched_ranges], Number(l.duration));
      const watchedSeconds = watched_ranges.reduce((sum, [start, end]) => sum + end - start, 0);
      const watch_percent = Math.min(100, watchedSeconds / Number(l.duration) * 100);
      const is_completed = p.is_completed || watch_percent >= 95;
      completedNow = is_completed && !p.is_completed;
      // Watched coverage only grows, so each milestone is crossed once per lesson.
      crossed = [25, 50, 75].filter(mark => Number(p.watch_percent || 0) < mark && watch_percent >= mark);
      return { ...p, last_position: Math.min(Number(l.duration), body.current_position), furthest_position: Math.max(p.furthest_position, Math.min(Number(l.duration), body.furthest_position)), watched_ranges, watch_percent, is_completed, completed_at: p.completed_at || (is_completed ? new Date().toISOString() : null), playback_speed: Math.round(body.playback_speed * 100), updated_at: new Date().toISOString() };
    });
    // Events record milestones only (25/50/75%, completion at 95%); every save is in
    // learning_progress, so periodic saves no longer flood the events table.
    const details = { lesson_id: l.id, watch_percent: next.watch_percent, watched_seconds: next.watched_ranges.reduce((sum, [a,b]) => sum + b-a, 0), current_position: next.last_position };
    for (const mark of crossed) await event('learning_progress', lead, { ...details, milestone: mark }, context);
    if (completedNow) await event('lesson_completed', lead, { ...details, milestone: 95 }, context);
    if (course.capi && (crossed.length || completedNow)) await courseMilestones(lead, context);
    return next;
  }
  // Course-wide milestones for Meta: half of the visible course watched, all lessons done.
  async function courseMilestones(lead, context) {
    const [rows, progress] = await Promise.all([catalog(), store.listForLearner(lead.id)]);
    const summary = summarizeCourse(rows, progress);
    if (summary.watch_percent >= 50) await milestone(lead, 'CourseProgress50', context, { watch_percent: Math.round(summary.watch_percent) });
    if (summary.status === 'completed') await milestone(lead, 'CompleteCourse', context, { lessons: summary.total_lessons });
  }
  async function updatePosition(lead, body) {
    const l = await lesson(body.video_id);
    if (!Number.isFinite(body.watch_time) || body.watch_time < 0) throw failure(400, 'Thời gian xem không hợp lệ.');
    // This compatibility endpoint updates the resume position, never invents watched ranges.
    const p = await store.update('progress', `${lead.id}:${l.id}`, previous => ({ ...(previous || emptyProgress(lead, l)), last_position: Math.min(l.duration, body.watch_time), updated_at: new Date().toISOString() }));
    return { watch_time: p.last_position, completed: p.is_completed, unlocked: true };
  }
  // A CTA shown to or clicked by the learner, for the CTA statistics in the admin.
  async function ctaEvent(lead, body = {}, context = {}) {
    const l = await lesson(body.lesson_id);
    if (!['view', 'click'].includes(body.action) || !/^cta_[a-z0-9]{6,32}$/.test(String(body.cta_id || ''))) throw failure(400, 'Sự kiện CTA không hợp lệ.');
    await event(`learning_cta_${body.action}`, lead, { lesson_id: l.id, cta_id: body.cta_id }, context);
    return { success: true };
  }
  async function completeTour(lead) {
    await store.update('learners', lead.id, previous => ({ ...previous, registration_id: lead.id, tour_completed: true }));
    return { success: true };
  }
  async function completion(lead) {
    const [rows, progress] = await Promise.all([catalog(), store.listForLearner(lead.id)]);
    const summary = summarizeCourse(rows, progress);
    const video_details = summary.items.map(({ lesson, progress: row }) => ({ lesson_id: Number(lesson.id), is_completed: !!row?.is_completed, watch_percent: row?.watch_percent || 0, completed_at: row?.completed_at || null }));
    return { course_id: COURSE, total_videos: summary.total_lessons, completed_videos: summary.completed_lessons, completion_percentage: summary.completion_percent, video_details };
  }
  // Read-only progress of one lead for the partner API: visible lessons, rows, learner record.
  async function learnerProgress(lead) {
    const [lessons, rows, learner] = await Promise.all([catalog(), store.listForLearner(lead.id), store.get('learners', lead.id)]);
    return { lessons, rows, learner: learner || {} };
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
  return { course, landingEvent, register, login, authenticate, profile, lessons, catalog, getProgress, saveProgress, updatePosition, ctaEvent, completeTour, completion, learnerProgress, event, stats };
}
const instances = new Map();
function getLearningService(courseId = 'dong-tien') {
  if (!instances.has(courseId)) instances.set(courseId, createLearningService({ course: getCourse(courseId) }));
  return instances.get(courseId);
}
module.exports = { createLearningService, getLearningService, mergeRanges };
