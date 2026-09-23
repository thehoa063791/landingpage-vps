const express = require('express');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();

const {
  supabase, checkSupabase, getRegistrations, getRegistrationById, insertRegistration, getEvents, getPayments, getSurveys,
  getFunnelOrders, getFunnelOrder, createFunnelOrder, updateFunnelOrder, deleteFunnelOrder,
  getRegistrationData, mergeRegistrations,
  getCrmProfiles, upsertCrmProfile, assignRegistration, deleteRegistration, getLeadNotes, addLeadNote, deleteLeadNote,
  getCrmSetting, setCrmSetting,
  getLeadAssignmentStats, setLeadAssignmentConfig,
  getCustomFields, upsertCustomField, deleteCustomField,
  getLeadCustomFieldValues, getLeadCustomFieldValuesForIds, setLeadCustomFieldValues,
  getTagCategories, upsertTagCategory, deleteTagCategory,
  getCrmTags, upsertCrmTag, deleteCrmTag, getPageTagConfig, setPageTagMapping, syncAllPageTags, tagLeadByPage,
  getLeadTags, getLeadTagsForIds, getTagPeopleCounts, getTagPeopleCount, setLeadTags,
  getLeadZoomAttendances, getZoomMeetingsOverview, getZoomMeetingDetail, getLeadZoomAttendanceById, linkZoomAttendanceToLead,
} = require('../storage');
const { wrap, adminAuth, adminCookieOrAuth, makeAdminAccessCookie, parseCookies, requireRole, classifyChannel, buildDeviceGeoStats } = require('../utils');
const { OAuth2Client } = require('google-auth-library');
const {
  getAuthorizeUrl,
  verifyOAuthState,
  exchangeCodeForToken,
  runZoomSync,
  startZoomSync,
  getZoomSyncJob,
  getZoomStatus,
} = require('../zoomService');
const {
  EVERWEBINAR_SETTINGS_KEY,
  getEverWebinarSettings,
  normalizeEverWebinarSettings,
  publicEverWebinarSettings,
} = require('../webinarService');
const { discoverFunnels, findFunnel, isThankYou } = require('../funnels');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const TRAINING_PROCESS_STAT_URL = process.env.TRAINING_PROCESS_STAT_URL || 'https://ebila.ai/sys/v1/quizz/training-process-stat';
const GET_TRAINING_PROCESS_URL = process.env.GET_TRAINING_PROCESS_URL || 'https://ebila.ai/sys/v1/quizz/get-training-process';
const GET_TRAINING_PROCESS_DETAIL_URL = process.env.GET_TRAINING_PROCESS_DETAIL_URL || `${GET_TRAINING_PROCESS_URL.replace(/\/$/, '')}/detail`;
const ACADEMIC_SURVEY_BASE_URL = (process.env.ACADEMIC_SURVEY_BASE_URL || 'https://ebila.ai/academic-survey').replace(/\/$/, '');
const ACADEMIC_SURVEY_API_KEY = process.env.ACADEMIC_SURVEY_API_KEY || process.env.ACADEMIC_API_KEY || '';
// Kept as a thin alias so the existing call sites (getAuthPasswordClient()...)
// don't need to change. Both admin-service and password login now share the
// same Postgres-backed auth from db.js.
let authPasswordClient = null;

// Columns needed to render one row of the leads table/drawer summary.
const LEADS_LIST_COLS_BASE = 'id,name,email,phone,attendance,page_id,region,registered_at,utm_source,utm_medium,utm_campaign,referrer,fbc,gclid,geo,device,assigned_to,assigned_at';
const LEADS_LIST_COLS = `${LEADS_LIST_COLS_BASE},last_interaction_at`;
let warnedMissingLastInteractionColumn = false;
let pageTagSyncRunning = false;
const LEAD_SCORING_RULES_KEY = 'lead_scoring_rules';

function getAuthPasswordClient() {
  if (!authPasswordClient) authPasswordClient = { auth: supabase.auth };
  return authPasswordClient;
}

function explicitBootstrapAdminEmails() {
  return String(process.env.CRM_BOOTSTRAP_ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((email, index, rows) => rows.indexOf(email) === index);
}

function bootstrapAdminEmails() {
  const configuredAdmin = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  return explicitBootstrapAdminEmails()
    .concat(configuredAdmin.includes('@') ? [configuredAdmin] : [])
    .filter((email, index, rows) => rows.indexOf(email) === index);
}

function configuredAdminCredentialsMatch(email, password) {
  const configuredEmail = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const configuredPassword = String(process.env.ADMIN_PASSWORD || '');
  if (!configuredEmail || !configuredPassword || email !== configuredEmail) return false;
  const left = Buffer.from(String(password));
  const right = Buffer.from(configuredPassword);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function finishConfiguredAdminLogin(res, email, detail = '') {
  const user = { id: null, email, full_name: email, role: 'admin', active: true };
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', makeAdminAccessCookie(user));
  return res.json({
    user,
    session: { access_token: '', refresh_token: '', from_cookie: true },
    configured_admin: true,
    ...(detail ? { warning: detail } : {}),
  });
}

// ── Google OAuth (optional "Đăng nhập bằng Google" for /admin) ─────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI
  || `${String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')}/admin/auth/google/callback`;
const GOOGLE_STATE_COOKIE = 'admin_google_oauth_state';

function googleAuthEnabled() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function getGoogleClient() {
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

async function findAuthUserByEmail(email) {
  const wanted = String(email || '').trim().toLowerCase();
  if (!wanted) return null;
  try {
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const found = (data?.users || []).find(u => String(u.email || '').toLowerCase() === wanted);
      if (found) return found;
      if (!data?.users?.length || data.users.length < 1000) break;
    }
  } catch (e) {
    console.warn('[admin/auth/login] listUsers failed:', e.message);
  }
  return null;
}

async function resolveCrmLoginUser(authUser) {
  const userEmail = String(authUser?.email || '').toLowerCase();
  const { data: profile } = await supabase
    .from('crm_profiles')
    .select('user_id,email,full_name,role,active')
    .eq('user_id', authUser.id)
    .single();

  if (profile && profile.active !== false) {
    return {
      id: authUser.id,
      email: profile.email || authUser.email || '',
      full_name: profile.full_name || authUser.user_metadata?.full_name || authUser.email || '',
      role: profile.role === 'admin' ? 'admin' : 'sale',
      active: true,
    };
  }

  if (bootstrapAdminEmails().includes(userEmail)) {
    const bootProfile = {
      user_id: authUser.id,
      email: authUser.email || '',
      full_name: authUser.user_metadata?.full_name || authUser.email || '',
      role: 'admin',
      active: true,
      updated_at: new Date().toISOString(),
    };
    const { error: bootErr } = await supabase
      .from('crm_profiles')
      .upsert(bootProfile, { onConflict: 'user_id' });
    if (bootErr) throw bootErr;
    return {
      id: authUser.id,
      email: bootProfile.email,
      full_name: bootProfile.full_name,
      role: 'admin',
      active: true,
    };
  }

  return null;
}

function normalizeScoringRule(rule = {}) {
  const id = String(rule.id || crypto.randomUUID());
  const field = String(rule.field || '').trim().slice(0, 120);
  const operator = String(rule.operator || 'contains').trim();
  const value = String(rule.value ?? '').trim().slice(0, 300);
  const points = Math.max(-10000, Math.min(10000, Number(rule.points || 0)));
  return {
    id,
    field,
    operator: ['contains', 'not_contains', 'equals', 'not_equals', 'exists', 'empty', 'gt', 'gte', 'lt', 'lte'].includes(operator) ? operator : 'contains',
    value,
    points: Number.isFinite(points) ? points : 0,
    active: rule.active !== false,
  };
}

function normalizeScoringRules(rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .map(normalizeScoringRule)
    .filter(r => r.field && r.points !== 0);
}

async function getLeadScoringRules() {
  return normalizeScoringRules(await getCrmSetting(LEAD_SCORING_RULES_KEY, []));
}

function getLeadScoringValue(lead, rule, customByKey, customById, tagRows, activityValues = [], emailStats = null) {
  const field = String(rule.field || '');
  if (field === 'tags') {
    return (tagRows || []).flatMap(t => [t.name, t.slug, t.category_name]).filter(Boolean);
  }
  if (field === 'email_open') return emailStats?.opened || 0;
  if (field === 'email_click') return emailStats?.clicked || 0;
  if (field === 'activity') {
    const values = ['Web Form Submission', ...activityValues];
    if (lead.last_interaction_at) values.push('CRM Interaction');
    return values;
  }
  if (field.startsWith('custom:')) {
    const id = field.slice('custom:'.length);
    return customById[id] ?? '';
  }
  if (field.startsWith('custom_key:')) {
    const key = field.slice('custom_key:'.length);
    return customByKey[key] ?? '';
  }
  if (field === 'channel') return classifyChannel(lead.utm_source, lead.utm_medium, lead.referrer);
  if (field === 'country') return lead.geo?.country || '';
  if (field === 'city') return lead.geo?.city || '';
  return lead[field] ?? '';
}

function scoringValueMatches(rawValue, operator, expected) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const normalizedValues = values.map(v => String(v ?? '').trim()).filter(Boolean);
  const q = String(expected ?? '').trim();
  const qLower = q.toLowerCase();
  if (operator === 'exists') return normalizedValues.length > 0;
  if (operator === 'empty') return normalizedValues.length === 0;
  if (operator === 'gt' || operator === 'gte' || operator === 'lt' || operator === 'lte') {
    let left = Number(normalizedValues[0]);
    let right = Number(q);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      left = Date.parse(normalizedValues[0]);
      right = Date.parse(q);
    }
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (operator === 'gt') return left > right;
    if (operator === 'gte') return left >= right;
    if (operator === 'lt') return left < right;
    return left <= right;
  }
  const hasContains = normalizedValues.some(v => v.toLowerCase().includes(qLower));
  const hasEquals = normalizedValues.some(v => v.toLowerCase() === qLower);
  if (operator === 'contains') return q ? hasContains : normalizedValues.length > 0;
  if (operator === 'not_contains') return q ? !hasContains : normalizedValues.length === 0;
  if (operator === 'equals') return q ? hasEquals : normalizedValues.length === 0;
  if (operator === 'not_equals') return q ? !hasEquals : normalizedValues.length > 0;
  return false;
}

async function calculateLeadScore(lead) {
  const rules = await getLeadScoringRules();
  if (!rules.length) return { score: 0, matched_rules: [] };
  const needsEvents = rules.some(r => r.field === 'activity');
  const needsEmailStats = rules.some(r => r.field === 'email_open' || r.field === 'email_click');
  const [customFields, customValues, tags, events, emailStats] = await Promise.all([
    getCustomFields({ includeInactive: true }),
    getLeadCustomFieldValues(lead.id),
    getLeadTags(lead.id),
    needsEvents ? getEvents().catch(() => []) : Promise.resolve([]),
    needsEmailStats && lead.email ? fetchTrainingProcessEmailDetail(lead.email).catch(() => null) : Promise.resolve(null),
  ]);
  const customById = customValues || {};
  const customByKey = {};
  customFields.forEach(f => {
    customByKey[f.key] = customById[f.id] ?? f.default_value ?? '';
  });
  const activityValues = (events || [])
    .filter(e => lead.session_id && e.session_id === lead.session_id)
    .map(e => e.event || e.data?.event || '')
    .filter(Boolean);
  const matched = [];
  const score = rules.reduce((sum, rule) => {
    if (rule.active === false) return sum;
    const value = getLeadScoringValue(lead, rule, customByKey, customById, tags, activityValues, emailStats);
    if (!scoringValueMatches(value, rule.operator, rule.value)) return sum;
    matched.push(rule);
    return sum + Number(rule.points || 0);
  }, 0);
  return { score, matched_rules: matched };
}

function firstNumberFromKeys(obj, keys) {
  const stack = [obj];
  const normalizedKeys = keys.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ''));

  while (stack.length) {
    const cur = stack.shift();
    if (!cur || typeof cur !== 'object') continue;

    for (const [key, value] of Object.entries(cur)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!normalizedKeys.includes(normalizedKey)) continue;
      const n = Number(String(value ?? '').replace(/,/g, ''));
      if (Number.isFinite(n)) return n;
    }

    Object.values(cur).forEach(value => {
      if (value && typeof value === 'object') stack.push(value);
    });
  }

  return 0;
}

function normalizeCampaignStage(stage, payload = {}) {
  const source = Array.isArray(payload?.data) ? payload.data[0] : (payload?.data || payload?.result || payload);
  const delivery = firstNumberFromKeys(source, ['delivery', 'delivered', 'sent', 'total_sent', 'totalSent', 'total_delivery', 'totalDelivered']);
  const open = firstNumberFromKeys(source, ['open', 'opens', 'opened', 'total_open', 'totalOpen', 'total_opened', 'totalOpened']);
  const click = firstNumberFromKeys(source, ['click', 'clicks', 'clicked', 'total_click', 'totalClick', 'total_clicked', 'totalClicked']);
  const bounce = firstNumberFromKeys(source, ['bounce', 'bounces', 'bounced', 'total_bounce', 'totalBounce', 'total_bounced', 'totalBounced']);

  return {
    stage,
    label: stage === 'total' ? 'Total 14 days' : `Ngày ${stage}`,
    delivery,
    open,
    openRate: delivery > 0 ? open / delivery : 0,
    click,
    clickRate: open > 0 ? click / open : 0,
    bounce,
  };
}

function sumCampaignRows(rows) {
  const total = rows.reduce((acc, row) => ({
    delivery: acc.delivery + Number(row.delivery || 0),
    open: acc.open + Number(row.open || 0),
    click: acc.click + Number(row.click || 0),
    bounce: acc.bounce + Number(row.bounce || 0),
    userCount: acc.userCount + Number(row.userCount || 0),
  }), { delivery: 0, open: 0, click: 0, bounce: 0, userCount: 0 });

  return {
    stage: 'total',
    label: 'Total 14 days',
    ...total,
    openRate: total.delivery > 0 ? total.open / total.delivery : 0,
    clickRate: total.open > 0 ? total.click / total.open : 0,
  };
}

async function fetchCampaignStage(stage) {
  const url = new URL(TRAINING_PROCESS_STAT_URL);
  url.searchParams.set('stage', String(stage));
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    const message = payload?.message || payload?.error || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return normalizeCampaignStage(stage, payload);
}

function normalizeTrainingLead(row = {}) {
  return {
    id: row.id,
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    stage: Number(row.stage || 0),
    stockInvestment: row.stockInvestment ?? null,
    createdAt: row.createdAt || null,
    lastSentAt: row.lastSentAt || null,
  };
}

function academicSurveyUrl(pathname, params = {}) {
  const url = new URL(pathname, ACADEMIC_SURVEY_BASE_URL);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url;
}

function academicSurveyHeaders() {
  const headers = { accept: 'application/json', 'Content-Type': 'application/json' };
  if (ACADEMIC_SURVEY_API_KEY) headers['api-key'] = ACADEMIC_SURVEY_API_KEY;
  return headers;
}

async function fetchAcademicSurvey(pathname, params = {}) {
  const url = academicSurveyUrl(pathname, params);
  const res = await fetch(url, { method: 'GET', headers: academicSurveyHeaders() });
  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!res.ok || payload?.success === false) {
    throw new Error(payload?.message || payload?.error || `HTTP ${res.status}`);
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    const meta = {
      total_pages: payload.total_pages ?? payload.totalPages ?? payload.pagination?.total_pages ?? payload.pagination?.totalPages,
      total: payload.total ?? payload.totalElements ?? payload.pagination?.total,
      page: payload.page ?? payload.pagination?.page,
      size: payload.size ?? payload.pagination?.size,
    };
    const data = payload.data;
    if (Array.isArray(data)) return { data, ...Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)) };
    if (data && typeof data === 'object') return { ...data, ...Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)) };
    return data;
  }
  return payload;
}

function academicListFrom(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const key of ['content', 'rows', 'items', 'data', 'results']) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function academicTotalPagesFrom(value) {
  if (!value || typeof value !== 'object') return 1;
  const candidates = [
    value.total_pages,
    value.totalPages,
    value.total_page,
    value.pages,
    value.page_count,
    value.pageCount,
    value.pagination?.total_pages,
    value.pagination?.totalPages,
    value.meta?.total_pages,
    value.meta?.totalPages,
  ];
  const totalPages = Math.max(1, ...candidates.map(Number).filter(Number.isFinite));
  return totalPages;
}

function academicStatsTotalPages(data = {}) {
  return Math.max(
    academicTotalPagesFrom(data),
    academicTotalPagesFrom(data.users),
    academicTotalPagesFrom(data.sessions),
    academicTotalPagesFrom(data.answers)
  );
}

async function fetchAcademicPaged(pathname, params = {}, pageSize = 100) {
  const first = await fetchAcademicSurvey(pathname, { ...params, page: 1, size: pageSize });
  const pages = [first];
  const totalPages = academicTotalPagesFrom(first);
  for (let page = 2; page <= totalPages; page += 1) {
    pages.push(await fetchAcademicSurvey(pathname, { ...params, page, size: pageSize }));
  }
  return { pages, totalPages };
}

function normalizeAcademicLesson(row = {}) {
  const title = row.title || row.lesson_title || row.name || '';
  return {
    id: String(row.id ?? row.lesson_id ?? row.lessonId ?? row.video_id ?? ''),
    title,
    video_id: String(row.video_id ?? row.videoId ?? ''),
    duration: Number(row.duration || row.video_duration || 0),
    position: Number(row.position || row.order || 0),
    is_visible: row.is_visible !== false,
    lesson_number: extractAcademicLessonNumber(title),
  };
}

function extractAcademicLessonNumber(title) {
  const match = String(title || '').match(/b[aà]i\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function compareAcademicLessons(a, b) {
  const aNum = Number(a.lesson_number || extractAcademicLessonNumber(a.title));
  const bNum = Number(b.lesson_number || extractAcademicLessonNumber(b.title));
  if (aNum && bNum && aNum !== bNum) return aNum - bNum;
  if (aNum && !bNum) return -1;
  if (!aNum && bNum) return 1;
  const aPos = Number(a.position || 999);
  const bPos = Number(b.position || 999);
  if (aPos !== bPos) return aPos - bPos;
  return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
}

function normalizeAcademicUser(row = {}) {
  return {
    email: String(row.email || row.emailAddress || '').trim(),
    fullName: row.fullName || row.full_name || row.name || '',
    phone: String(row.phone || row.phone_number || '').trim(),
    region: row.region || '',
    interest: row.interest || '',
    createdAt: row.createdAt || row.created_at || row.registered_at || null,
    progress: row.progress || null,
    video_progress: row.video_progress || null,
  };
}

function normalizeAcademicSession(row = {}) {
  const lesson = normalizeAcademicLesson(row.lesson || row.lesson_data || row);
  const watchTime = Number(row.watch_time ?? row.watchTime ?? row.video_progress?.watch_time ?? 0);
  const duration = Number(lesson.duration || row.duration || row.video_progress?.duration || 0);
  const pct = Number(row.video_progress?.pct ?? row.pct ?? (duration > 0 ? (watchTime / duration) * 100 : 0));
  return {
    session_id: String(row.session_id || row.id || ''),
    email: String(row.email || '').trim(),
    fullName: row.fullName || row.full_name || row.name || '',
    phone: String(row.phone || row.phone_number || '').trim(),
    region: row.region || '',
    watch_time: watchTime,
    completed: row.completed === true || row.is_completed === true || row.video_progress?.is_completed === true,
    is_unlocked: row.is_unlocked !== false,
    has_survey_answer: row.has_survey_answer === true,
    lesson,
    pct: Math.max(0, Math.min(100, pct || 0)),
    createdAt: row.createdAt || row.created_at || null,
  };
}

async function fetchAcademicLessons() {
  const { pages } = await fetchAcademicPaged('/academic-survey/api/admin/academic-survey/lessons');
  return pages.flatMap(page => academicListFrom(page, ['lessons'])).map(normalizeAcademicLesson)
    .filter(row => row.id)
    .sort(compareAcademicLessons);
}

async function fetchAcademicStats() {
  const first = await fetchAcademicSurvey('/academic-survey/api/admin/academic-survey/stats', { page: 1, size: 100 });
  const pages = [first];
  const totalPages = academicStatsTotalPages(first);
  for (let page = 2; page <= totalPages; page += 1) {
    pages.push(await fetchAcademicSurvey('/academic-survey/api/admin/academic-survey/stats', { page, size: 100 }));
  }
  return {
    users: pages.flatMap(page => academicListFrom(page.users, ['users'])).map(normalizeAcademicUser),
    sessions: pages.flatMap(page => academicListFrom(page.sessions, ['sessions'])).map(normalizeAcademicSession),
    answers: pages.flatMap(page => academicListFrom(page.answers, ['answers'])),
  };
}

async function fetchAcademicSessions(params = {}) {
  const pageSize = Math.min(100, Math.max(20, Number(params.size || 100)));
  const { pages, totalPages } = await fetchAcademicPaged('/academic-survey/api/admin/academic-survey/sessions', params, pageSize);
  const rows = pages.flatMap(page => academicListFrom(page, ['sessions']));
  return {
    rows: rows.map(normalizeAcademicSession),
    total: Number(pages[0]?.total ?? pages[0]?.totalElements ?? rows.length),
    total_pages: totalPages,
  };
}

function normalizePhoneKey(phone) {
  return String(phone || '').replace(/\D/g, '').replace(/^84/, '0');
}

async function enrichAcademicRowsWithRegistrations(rows) {
  const emails = [...new Set((rows || []).map(r => String(r.email || '').trim().toLowerCase()).filter(Boolean))];
  const phones = [...new Set((rows || []).map(r => normalizePhoneKey(r.phone)).filter(Boolean))];
  const profiles = await getCrmProfiles({ includeInactive: true }).catch(() => []);
  const byId = profileMap(profiles);
  const byEmail = {};
  const byPhone = {};
  let usedSupabase = false;
  let supabaseFailed = false;

  function addLead(row) {
    const mapped = mapLeadRow(row, byId);
    const email = String(row.email || '').trim().toLowerCase();
    const phone = normalizePhoneKey(row.phone);
    if (email && !byEmail[email]) byEmail[email] = mapped;
    if (phone && !byPhone[phone]) byPhone[phone] = mapped;
  }

  if (await checkSupabase()) {
    try {
      usedSupabase = true;
      for (let i = 0; i < emails.length; i += 100) {
        const { data, error } = await supabase.from('registrations').select(LEADS_LIST_COLS).in('email', emails.slice(i, i + 100));
        if (error) throw error;
        (data || []).forEach(addLead);
      }
      const missingPhones = phones.filter(phone => !byPhone[phone]);
      for (let i = 0; i < missingPhones.length; i += 100) {
        const { data, error } = await supabase.from('registrations').select(LEADS_LIST_COLS).in('phone', missingPhones.slice(i, i + 100));
        if (error) throw error;
        (data || []).forEach(addLead);
      }
    } catch (e) {
      supabaseFailed = true;
      console.warn('[academic-survey] Supabase lead enrichment failed:', e.message);
    }
  }

  if (!usedSupabase || supabaseFailed) {
    const registrations = await getRegistrations();
    registrations.forEach(row => {
      const email = String(row.email || '').trim().toLowerCase();
      const phone = normalizePhoneKey(row.phone);
      if ((email && !byEmail[email]) || (phone && !byPhone[phone])) addLead(row);
    });
  }

  return (rows || []).map(row => {
    const emailKey = String(row.email || '').trim().toLowerCase();
    const phoneKey = normalizePhoneKey(row.phone);
    const linkedLead = byEmail[emailKey] || byPhone[phoneKey] || null;
    return {
      ...row,
      fullName: row.fullName || linkedLead?.name || '',
      phone: row.phone || linkedLead?.phone || '',
      region: row.region || linkedLead?.region || '',
      linkedLead,
    };
  });
}

function filterAcademicSessionRows(rows, filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase();
  const region = String(filters.region || '').trim();
  return (rows || []).filter(row => {
    if (region && row.region !== region) return false;
    if (!search) return true;
    return [
      row.fullName, row.email, row.phone, row.region,
      row.linkedLead?.name, row.linkedLead?.email, row.linkedLead?.phone, row.linkedLead?.assigned_name,
    ].some(value => String(value || '').toLowerCase().includes(search));
  });
}

function buildAcademicOverview(stats, lessons) {
  const lessonById = {};
  lessons.forEach(lesson => { lessonById[lesson.id] = lesson; });
  stats.sessions.forEach(session => {
    if (!lessonById[session.lesson.id]) lessonById[session.lesson.id] = session.lesson;
  });
  const sortedLessons = Object.values(lessonById).sort(compareAcademicLessons);
  const rows = sortedLessons.map((lesson, index) => {
    const sessions = stats.sessions.filter(s => s.lesson.id === lesson.id || (lesson.video_id && s.lesson.video_id === lesson.video_id));
    const viewers = new Set(sessions.map(s => s.email || s.session_id).filter(Boolean));
    const completed = new Set(sessions.filter(s => s.completed || s.pct >= 95).map(s => s.email || s.session_id).filter(Boolean));
    return {
      index: lesson.lesson_number || index + 1,
      lesson,
      viewerCount: viewers.size,
      completedCount: completed.size,
      completionRate: viewers.size ? completed.size / viewers.size : 0,
      avgProgress: sessions.length ? sessions.reduce((sum, s) => sum + Number(s.pct || 0), 0) / sessions.length : 0,
    };
  });
  const uniqueUsers = new Set(stats.users.map(u => u.email).filter(Boolean));
  const completedAll = stats.users.filter(u => Number(u.progress?.completed || 0) >= Math.max(1, rows.length)).length;
  return {
    rows,
    total: {
      users: uniqueUsers.size || stats.users.length,
      sessions: stats.sessions.length,
      lessons: rows.length,
      answers: stats.answers.length,
      completedAll,
      completionRate: stats.users.length ? completedAll / stats.users.length : 0,
    },
  };
}

async function fetchAcademicLessonSessionsFromStats(lessonId, filters = {}) {
  const stats = await fetchAcademicStats();
  const wanted = String(lessonId || '').trim();
  const search = String(filters.search || '').trim().toLowerCase();
  const region = String(filters.region || '').trim();
  const rows = stats.sessions.filter(session => {
    const sameLesson = session.lesson.id === wanted || session.lesson.video_id === wanted;
    if (!sameLesson) return false;
    if (region && session.region !== region) return false;
    if (!search) return true;
    return [session.fullName, session.email, session.phone]
      .some(value => String(value || '').toLowerCase().includes(search));
  });
  return {
    rows,
    total: rows.length,
    total_pages: 1,
  };
}

async function fetchAcademicLeadSummary(email, phone) {
  const stats = await fetchAcademicStats();
  const emailKey = String(email || '').trim().toLowerCase();
  const phoneKey = normalizePhoneKey(phone);
  const sessions = stats.sessions.filter(s =>
    (emailKey && String(s.email || '').trim().toLowerCase() === emailKey) ||
    (phoneKey && normalizePhoneKey(s.phone) === phoneKey)
  );
  const user = stats.users.find(u =>
    (emailKey && String(u.email || '').trim().toLowerCase() === emailKey) ||
    (phoneKey && normalizePhoneKey(u.phone) === phoneKey)
  ) || null;
  return {
    email,
    phone,
    user,
    sessions,
    answers: stats.answers.filter(a => emailKey && String(a.email || '').trim().toLowerCase() === emailKey),
    progress: {
      started: new Set(sessions.map(s => s.lesson.id).filter(Boolean)).size,
      completed: new Set(sessions.filter(s => s.completed || s.pct >= 95).map(s => s.lesson.id).filter(Boolean)).size,
    },
  };
}

async function fetchTrainingProcessPage(stage, page) {
  const url = new URL(GET_TRAINING_PROCESS_URL);
  url.searchParams.set('stage', String(stage));
  url.searchParams.set('page', String(page));
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    const message = payload?.message || payload?.error || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return payload?.data || {};
}

async function fetchTrainingProcessEmailDetail(email) {
  const wanted = String(email || '').trim().toLowerCase();
  const url = new URL(GET_TRAINING_PROCESS_DETAIL_URL);
  url.searchParams.set('email', String(email));
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    const message = payload?.message || payload?.error || `HTTP ${res.status}`;
    throw new Error(message);
  }
  const data = payload?.data || {};
  const content = Array.isArray(data.content)
    ? data.content
    : Array.isArray(data)
      ? data
      : Array.isArray(payload.content)
        ? payload.content
        : [];
  const rows = content
    .filter(row => !wanted || String(row.emailAddress || row.email || '').trim().toLowerCase() === wanted)
    .map(row => ({
      id: row.id,
      emailAddress: row.emailAddress || row.email || '',
      subject: row.subject || '',
      templateUsed: row.templateUsed || row.template || '',
      sentBodyHtml: row.sentBodyHtml || row.bodyHtml || row.html || '',
      openedAt: row.openedAt || null,
      clickedAt: row.clickedAt || null,
      bouncedAt: row.bouncedAt || null,
      createAt: row.createAt || row.createdAt || null,
    }))
    .sort((a, b) => Number(b.createAt || 0) - Number(a.createAt || 0));

  return {
    email,
    rows,
    opened: rows.filter(row => !!row.openedAt).length,
    clicked: rows.filter(row => !!row.clickedAt).length,
    bounced: rows.filter(row => !!row.bouncedAt).length,
    totalPages: Number(data.totalPages || 1),
    totalElements: Number(data.totalElements ?? rows.length),
  };
}

async function fetchTrainingProcessStage(stage) {
  const firstPage = await fetchTrainingProcessPage(stage, 0);
  const totalPages = Math.max(1, Number(firstPage.totalPages || 1));
  const pages = [firstPage];

  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => fetchTrainingProcessPage(stage, i + 1))
    );
    pages.push(...rest);
  }

  const rows = pages.flatMap(page => Array.isArray(page.content) ? page.content : []);
  return {
    stage,
    rows: rows.map(normalizeTrainingLead),
    totalPages,
    totalElements: Number(firstPage.totalElements ?? rows.length),
    pageSize: Number(firstPage.size || 20),
  };
}

async function fetchTrainingProcessLeadSummary(email) {
  const wanted = String(email || '').trim().toLowerCase();
  if (!wanted) return null;
  const results = await Promise.allSettled(
    Array.from({ length: 14 }, (_, i) => fetchTrainingProcessStage(i + 1))
  );
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const row = (result.value.rows || []).find(r => String(r.email || '').trim().toLowerCase() === wanted);
    if (row) {
      return {
        ...row,
        stage: Number(row.stage || result.value.stage || 0),
      };
    }
  }
  return null;
}

async function fetchTrainingProcessCount(stage) {
  const firstPage = await fetchTrainingProcessPage(stage, 0);
  return Number(firstPage.totalElements ?? (Array.isArray(firstPage.content) ? firstPage.content.length : 0));
}

async function enrichTrainingLeadsWithRegistrations(rows) {
  const emails = [...new Set((rows || [])
    .map(r => String(r.email || '').trim().toLowerCase())
    .filter(Boolean))];
  if (!emails.length) return rows || [];

  const registrationByEmail = {};
  const profiles = await getCrmProfiles({ includeInactive: true }).catch(() => []);
  const byId = profileMap(profiles);

  if (await checkSupabase()) {
    try {
      for (let i = 0; i < emails.length; i += 100) {
        const chunk = emails.slice(i, i + 100);
        const { data, error } = await supabase
          .from('registrations')
          .select(LEADS_LIST_COLS)
          .in('email', chunk);
        if (error) throw error;
        (data || []).forEach(r => {
          const key = String(r.email || '').trim().toLowerCase();
          if (key && !registrationByEmail[key]) registrationByEmail[key] = mapLeadRow(r, byId);
        });
      }
      return rows.map(r => ({
        ...r,
        linkedLead: registrationByEmail[String(r.email || '').trim().toLowerCase()] || null,
      }));
    } catch (e) {
      console.warn('[campaign/stage] Supabase lead enrichment failed:', e.message);
    }
  }

  const registrations = await getRegistrations();
  registrations.forEach(r => {
    const key = String(r.email || '').trim().toLowerCase();
    if (key && emails.includes(key) && !registrationByEmail[key]) registrationByEmail[key] = mapLeadRow(r, byId);
  });
  return rows.map(r => ({
    ...r,
    linkedLead: registrationByEmail[String(r.email || '').trim().toLowerCase()] || null,
  }));
}

function mapLeadRow(r, profileById = {}) {
  const assignee = r.assigned_to ? profileById[r.assigned_to] : null;
  return {
    id:            r.id,
    page_id:       r.page_id || 'default',
    name:          r.name,
    phone:         r.phone,
    email:         r.email,
    region:        r.region     || '',
    attendance:    r.attendance || '',
    source:        r.utm_source   || 'direct',
    medium:        r.utm_medium   || '(none)',
    campaign:      r.utm_campaign || '',
    channel:       classifyChannel(r.utm_source, r.utm_medium, r.referrer),
    registered_at: r.registered_at,
    device_type:   r.device?.device_type || '',
    os:            r.device?.os          || '',
    browser:       r.device?.browser     || '',
    city:          r.geo?.city           || '',
    country:       r.geo?.country        || '',
    has_fbc:       !!r.fbc,
    has_gclid:     !!r.gclid,
    assigned_to:    r.assigned_to || '',
    assigned_at:    r.assigned_at || null,
    assigned_name:  assignee?.full_name || assignee?.email || '',
    assigned_email: assignee?.email || '',
    last_interaction_at: r.last_interaction_at || null,
    latest_sale_note: r.latest_sale_note || '',
    latest_sale_note_at: r.latest_sale_note_at || null,
    custom_values: r.custom_values || {},
  };
}

function normalizeLeadEmailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeLeadPhoneKey(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0084')) digits = digits.slice(2);
  if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

function pushDuplicateCandidate(map, key, lead) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(lead);
}

async function buildDuplicateLeadStats(lead, tagRows = []) {
  const [notes, tags, customValues, zoomAttendances] = await Promise.all([
    getLeadNotes(lead.id).catch(() => []),
    tagRows.length ? Promise.resolve(tagRows.filter(t => t.registration_id === lead.id)) : getLeadTags(lead.id).catch(() => []),
    getLeadCustomFieldValues(lead.id).catch(() => ({})),
    getLeadZoomAttendances(lead.id, lead.email).catch(() => []),
  ]);
  return {
    notes: notes.length,
    tags: tags.length,
    custom_fields: Object.values(customValues || {}).filter(v => v !== null && v !== undefined && String(v).trim() !== '').length,
    zoom_attendances: zoomAttendances.length,
  };
}

async function buildDuplicateLeadGroups({ type = 'all', q = '', limit = 100 } = {}) {
  const [registrations, profiles] = await Promise.all([
    getRegistrations(),
    getCrmProfiles({ includeInactive: true }),
  ]);
  const profileById = profileMap(profiles);
  const visible = registrations.filter(Boolean);
  const emailMap = new Map();
  const phoneMap = new Map();

  visible.forEach(lead => {
    pushDuplicateCandidate(emailMap, normalizeLeadEmailKey(lead.email), lead);
    pushDuplicateCandidate(phoneMap, normalizeLeadPhoneKey(lead.phone), lead);
  });

  const needle = String(q || '').trim().toLowerCase();
  const groups = [];
  const addGroups = (map, groupType) => {
    if (type !== 'all' && type !== groupType) return;
    for (const [key, rows] of map.entries()) {
      if (rows.length < 2) continue;
      if (needle) {
        const haystack = [key, ...rows.flatMap(r => [r.name, r.email, r.phone, r.page_id])].join(' ').toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      const sorted = rows.slice().sort((a, b) => new Date(a.registered_at || 0) - new Date(b.registered_at || 0));
      groups.push({
        id: `${groupType}:${key}`,
        type: groupType,
        key,
        count: sorted.length,
        first_seen: sorted[0]?.registered_at || null,
        last_seen: sorted[sorted.length - 1]?.registered_at || null,
        page_ids: [...new Set(sorted.map(r => r.page_id || 'default'))],
        assignees: [...new Set(sorted.map(r => profileById[r.assigned_to]?.full_name || profileById[r.assigned_to]?.email || '').filter(Boolean))],
        leads: sorted.map(r => ({
          ...mapLeadRow(r, profileById),
          duplicate_key: key,
          duplicate_type: groupType,
        })),
      });
    }
  };
  addGroups(emailMap, 'email');
  addGroups(phoneMap, 'phone');

  groups.sort((a, b) =>
    b.count - a.count ||
    new Date(b.last_seen || 0) - new Date(a.last_seen || 0) ||
    a.type.localeCompare(b.type)
  );

  const selected = groups.slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
  const enrichedGroups = await Promise.all(selected.map(async group => ({
    ...group,
    leads: await Promise.all(group.leads.map(async lead => ({
      ...lead,
      stats: await buildDuplicateLeadStats(lead),
    }))),
  })));

  const duplicateLeadIds = new Set(groups.flatMap(g => g.leads.map(lead => lead.id)));
  return {
    groups: enrichedGroups,
    total_groups: groups.length,
    total_duplicate_leads: duplicateLeadIds.size,
    scanned_leads: visible.length,
  };
}

// Strip characters that would break PostgREST's `or=(...)` filter syntax
// (comma/parens/quotes act as separators there), then escape ILIKE wildcards
// so the search term is matched literally.
function sanitizeLeadSearch(raw) {
  return String(raw || '')
    .trim()
    .replace(/[,()"]/g, '')
    .replace(/[%_\\]/g, m => '\\' + m)
    .slice(0, 100);
}

// GET /admin  (serve admin panel HTML)
router.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// GET /admin/auth/config
router.get('/auth/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    googleEnabled: googleAuthEnabled(),
  });
});

// GET /admin/auth/google — start the OAuth redirect to Google's consent screen
router.get('/auth/google', (req, res) => {
  if (!googleAuthEnabled()) return res.status(503).send('Google login chưa được cấu hình trên server.');
  const state = crypto.randomBytes(24).toString('hex');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${GOOGLE_STATE_COOKIE}=${state}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax${secure}`);
  const url = getGoogleClient().generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    state,
  });
  res.redirect(url);
});

// GET /admin/auth/google/callback — exchange code, verify identity, resolve CRM role
router.get('/auth/google/callback', wrap(async (req, res) => {
  const clearStateCookie = 'admin_google_oauth_state=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';
  const fail = (message) => {
    res.setHeader('Set-Cookie', clearStateCookie);
    res.redirect('/admin?google_error=' + encodeURIComponent(message));
  };

  if (!googleAuthEnabled()) return fail('Google login chưa được cấu hình trên server.');
  if (req.query.error) return fail('Đăng nhập Google bị huỷ.');

  const { code, state } = req.query;
  const expectedState = parseCookies(req)[GOOGLE_STATE_COOKIE];
  if (!code || !state || !expectedState || state !== expectedState) {
    return fail('Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn, vui lòng thử lại.');
  }

  let payload;
  try {
    const client = getGoogleClient();
    const { tokens } = await client.getToken(String(code));
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (e) {
    console.warn('[admin/auth/google/callback] token exchange/verify failed:', e.message);
    return fail('Không xác thực được với Google, vui lòng thử lại.');
  }

  const email = String(payload?.email || '').trim().toLowerCase();
  if (!email || !payload?.email_verified) return fail('Email Google chưa được xác minh.');

  let authUser = await findAuthUserByEmail(email);
  if (!authUser) {
    if (!bootstrapAdminEmails().includes(email)) {
      return fail(`Email ${email} chưa được cấp quyền CRM. Liên hệ admin để được thêm vào hệ thống.`);
    }
    const created = await supabase.auth.admin.createUser({
      email,
      password: crypto.randomBytes(24).toString('hex'),
      email_confirm: true,
      user_metadata: { full_name: payload.name || email },
    });
    if (created.error) return fail('Không tạo được tài khoản admin bootstrap.');
    authUser = created.data.user;
  }

  const adminUser = await resolveCrmLoginUser(authUser);
  if (!adminUser) return fail('Tài khoản chưa được cấp quyền CRM.');

  const { data, error } = await supabase.auth.issueSession(authUser);
  if (error || !data?.session) return fail('Không tạo được phiên đăng nhập.');

  res.setHeader('Set-Cookie', clearStateCookie);
  if (adminUser.role === 'admin') {
    res.setHeader('Set-Cookie', [clearStateCookie, makeAdminAccessCookie(adminUser)]);
    return res.redirect('/admin');
  }
  return res.redirect('/admin#access_token=' + encodeURIComponent(data.session.access_token));
}));

// POST /admin/auth/login
router.post('/auth/login', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu.' });

  let { data, error } = await getAuthPasswordClient().auth.signInWithPassword({ email, password });
  if (error || !data?.session || !data?.user) {
    let authUser = await findAuthUserByEmail(email);
    const envAdminMatch = configuredAdminCredentialsMatch(email, password);
    const canBootstrapWithSubmittedPassword = explicitBootstrapAdminEmails().includes(email);
    if ((canBootstrapWithSubmittedPassword && !authUser) || envAdminMatch) {
      const created = authUser
        ? await supabase.auth.admin.updateUserById(authUser.id, { password, email_confirm: true })
        : await supabase.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) {
        console.error('[admin/auth/login] local bootstrap failed:', created.error.message);
        if (envAdminMatch) {
          return finishConfiguredAdminLogin(
            res,
            email,
            'PostgreSQL chưa sẵn sàng; đang dùng phiên admin từ cấu hình môi trường.'
          );
        }
        return res.status(503).json({
          error: 'Không khởi tạo được tài khoản admin nội bộ.',
          detail: 'Kiểm tra kết nối PostgreSQL và chạy migration trước khi đăng nhập.',
        });
      }
      authUser = created.data.user;
      ({ data, error } = await getAuthPasswordClient().auth.signInWithPassword({ email, password }));
      if (!error && data?.session && data?.user) {
        const adminUser = await resolveCrmLoginUser(data.user);
        if (!adminUser) {
          return res.status(403).json({
            error: 'Tài khoản chưa được cấp quyền CRM.',
            detail: `Thêm ${email} vào bảng crm_profiles hoặc biến CRM_BOOTSTRAP_ADMIN_EMAILS rồi đăng nhập lại.`,
          });
        }
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Set-Cookie', makeAdminAccessCookie(adminUser));
        return res.json({ user: adminUser, session: data.session, bootstrapped: true });
      }
    }

    let detail = 'Hệ thống xác thực nội bộ không chấp nhận email/mật khẩu này.';
    if (!authUser) {
      detail = `Email ${email} chưa có trong bảng auth_users và không nằm trong danh sách admin bootstrap.`;
    } else if (!authUser.email_confirmed_at) {
      detail = `Email ${email} chưa được xác nhận trong hệ thống nội bộ. Hãy chạy lại script seed admin.`;
    } else {
      detail = `Email ${email} đã có trong auth_users nhưng mật khẩu không khớp.`;
    }
    return res.status(401).json({
      error: 'Invalid login credentials',
      detail,
    });
  }

  const adminUser = await resolveCrmLoginUser(data.user);
  if (!adminUser) {
    return res.status(403).json({
      error: 'Tài khoản chưa được cấp quyền CRM.',
      detail: `Thêm ${email} vào bảng crm_profiles hoặc biến CRM_BOOTSTRAP_ADMIN_EMAILS rồi đăng nhập lại.`,
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  if (adminUser.role === 'admin') {
    res.setHeader('Set-Cookie', makeAdminAccessCookie(adminUser));
  }
  res.json({ user: adminUser, session: data.session });
}));

// GET /admin/auth/me
router.get('/auth/me', adminCookieOrAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ user: req.adminUser });
});

// GET /admin/campaign/14-days
router.get('/campaign/14-days', adminAuth, wrap(async (req, res) => {
  const [statResults, userResults] = await Promise.all([
    Promise.allSettled(Array.from({ length: 14 }, (_, i) => fetchCampaignStage(i + 1))),
    Promise.allSettled(Array.from({ length: 14 }, (_, i) => fetchTrainingProcessCount(i + 1))),
  ]);
  const rows = statResults.map((result, i) => result.status === 'fulfilled'
    ? { ...result.value, userCount: userResults[i]?.status === 'fulfilled' ? userResults[i].value : 0 }
    : {
        stage: i + 1,
        label: `Ngày ${i + 1}`,
        delivery: 0,
        open: 0,
        openRate: 0,
        click: 0,
        clickRate: 0,
        bounce: 0,
        userCount: userResults[i]?.status === 'fulfilled' ? userResults[i].value : 0,
        error: result.reason?.message || 'Fetch failed',
      });

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    rows,
    total: sumCampaignRows(rows),
    source: TRAINING_PROCESS_STAT_URL,
    fetched_at: new Date().toISOString(),
  });
}));

// GET /admin/campaign/14-days/stage/:stage
router.get('/campaign/14-days/stage/:stage', adminAuth, wrap(async (req, res) => {
  const stage = Number(req.params.stage);
  if (!Number.isInteger(stage) || stage < 1 || stage > 14) {
    return res.status(400).json({ error: 'Stage must be an integer from 1 to 14' });
  }

  const detail = await fetchTrainingProcessStage(stage);
  detail.rows = await enrichTrainingLeadsWithRegistrations(detail.rows);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ...detail,
    source: GET_TRAINING_PROCESS_URL,
    fetched_at: new Date().toISOString(),
  });
}));

// GET /admin/campaign/email-detail?email=...
router.get('/campaign/email-detail', adminAuth, wrap(async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const detail = await fetchTrainingProcessEmailDetail(email);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ...detail,
    source: GET_TRAINING_PROCESS_DETAIL_URL,
    fetched_at: new Date().toISOString(),
  });
}));

// GET /admin/campaign/lead-summary?email=...
router.get('/campaign/lead-summary', adminAuth, wrap(async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const [summary, emailDetail] = await Promise.all([
    fetchTrainingProcessLeadSummary(email),
    fetchTrainingProcessEmailDetail(email).catch(() => null),
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    email,
    found: !!summary,
    summary,
    email_stats: emailDetail ? {
      sent: emailDetail.rows?.length || 0,
      opened: emailDetail.opened || 0,
      clicked: emailDetail.clicked || 0,
      bounced: emailDetail.bounced || 0,
    } : null,
    fetched_at: new Date().toISOString(),
  });
}));

// GET /admin/prosperity-journey
router.get('/prosperity-journey', adminAuth, wrap(async (req, res) => {
  const [stats, lessons] = await Promise.all([
    fetchAcademicStats(),
    fetchAcademicLessons().catch(e => {
      console.warn('[admin/prosperity-journey] lessons failed:', e.message);
      return [];
    }),
  ]);
  const overview = buildAcademicOverview(stats, lessons);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ...overview,
    source: ACADEMIC_SURVEY_BASE_URL,
    fetched_at: new Date().toISOString(),
  });
}));

// GET /admin/prosperity-journey/lesson/:lessonId
router.get('/prosperity-journey/lesson/:lessonId', adminAuth, wrap(async (req, res) => {
  const lessonId = String(req.params.lessonId || '').trim();
  if (!lessonId) return res.status(400).json({ error: 'lessonId is required' });
  const sessions = await fetchAcademicLessonSessionsFromStats(lessonId);
  sessions.rows = filterAcademicSessionRows(
    await enrichAcademicRowsWithRegistrations(sessions.rows),
    { search: req.query.search || '', region: req.query.region || '' }
  );
  sessions.total = sessions.rows.length;
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ...sessions,
    lesson_id: lessonId,
    source: ACADEMIC_SURVEY_BASE_URL,
    fetched_at: new Date().toISOString(),
  });
}));

// GET /admin/prosperity-journey/lead-summary?email=...&phone=...
router.get('/prosperity-journey/lead-summary', adminAuth, wrap(async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  const phone = String(req.query.phone || '').trim();
  if (!email && !phone) return res.status(400).json({ error: 'email or phone is required' });
  const summary = await fetchAcademicLeadSummary(email, phone);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ...summary,
    source: ACADEMIC_SURVEY_BASE_URL,
    fetched_at: new Date().toISOString(),
  });
}));

// GET /admin/zoom/oauth/callback
router.get('/zoom/oauth/callback', wrap(async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.status(400).send(`Zoom authorization failed: ${String(error)}`);
  }
  if (!code || !verifyOAuthState(state)) {
    return res.status(400).send('Invalid Zoom OAuth callback.');
  }
  await exchangeCodeForToken(String(code));
  res.send(`
    <!doctype html>
    <html lang="vi">
      <head><meta charset="utf-8"><title>Zoom connected</title></head>
      <body style="font-family:system-ui;padding:32px;line-height:1.6">
        <h2>Da ket noi Zoom thanh cong.</h2>
        <p>Ban co the quay lai CRM va bam dong bo Zoom.</p>
      </body>
    </html>
  `);
}));

// GET /admin/zoom/auth-url
router.get('/zoom/auth-url', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.json({ url: getAuthorizeUrl() });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Zoom authorization URL is unavailable' });
  }
}));

// GET /admin/zoom/status
router.get('/zoom/status', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await getZoomStatus());
}));

// GET /admin/zoom/sync-status
router.get('/zoom/sync-status', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getZoomSyncJob());
}));

// GET /admin/zoom/meetings
router.get('/zoom/meetings', adminAuth, wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ rows: await getZoomMeetingsOverview(), sync_job: getZoomSyncJob() });
}));

// GET /admin/zoom/meeting-detail?uuid=...
router.get('/zoom/meeting-detail', adminAuth, wrap(async (req, res) => {
  const detail = await getZoomMeetingDetail(req.query.uuid);
  if (!detail) return res.status(404).json({ error: 'Zoom meeting not found' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(detail);
}));

// POST /admin/zoom/participants/:attendanceId/create-lead
router.post('/zoom/participants/:attendanceId/create-lead', adminAuth, wrap(async (req, res) => {
  const attendance = await getLeadZoomAttendanceById(req.params.attendanceId);
  if (!attendance) return res.status(404).json({ error: 'Zoom participant not found' });
  const email = String(attendance.raw?.real_email || attendance.lead_email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Participant email is required to create lead' });
  }

  const registrations = await getRegistrations();
  const existing = registrations.find(r => String(r.email || '').trim().toLowerCase() === email);
  if (existing) {
    await linkZoomAttendanceToLead(attendance.id, existing.id);
    return res.json({ success: true, existing: true, lead: existing });
  }

  const raw = attendance.raw || {};
  const registrant = raw.registrant || {};
  const phone = String(attendance.lead_phone || raw.phone || raw.phone_number || raw.user_phone || raw.registrant_phone || raw.mobile || raw.mobile_phone || registrant.phone || registrant.phone_number || '').trim();
  const record = {
    id: crypto.randomUUID(),
    name: String(attendance.zoom_display_name || raw.name || raw.user_name || email.split('@')[0] || '').trim(),
    phone,
    email,
    region: '',
    interest: '',
    attendance: 'Zoom participant',
    page_id: 'zoom',
    utm_source: 'zoom',
    utm_medium: 'meeting',
    utm_campaign: String(attendance.zoom_meeting_id || ''),
    referrer: '',
    session_id: `zoom_${attendance.id}`,
    user_agent: 'Zoom',
    registered_at: attendance.join_time || new Date().toISOString(),
    last_interaction_at: attendance.leave_time || attendance.join_time || new Date().toISOString(),
  };
  await insertRegistration(record);
  await linkZoomAttendanceToLead(attendance.id, record.id);
  const lead = await getRegistrationById(record.id).catch(() => null);
  res.status(201).json({ success: true, lead: lead || record });
}));

// POST /admin/zoom/sync
router.post('/zoom/sync', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const options = {
    from: req.body?.from || req.query.from,
    to: req.body?.to || req.query.to,
    force: req.body?.force === true || String(req.query.force || '') === '1',
  };
  const shouldWaitForSync = process.env.VERCEL === '1' || String(req.body?.wait || req.query.wait || '') === '1';
  const job = shouldWaitForSync ? await runZoomSync(options) : startZoomSync(options);
  res.status(job.status === 'running' ? 202 : 200).json({ success: true, job });
}));

function profileMap(list) {
  return Object.fromEntries((list || []).map(p => [p.user_id, p]));
}

function leadVisibleToUser(lead, user) {
  return !!user && !!lead;
}

function leadNoteWritableByUser(lead, user) {
  return !!user && !!lead;
}

function parseAdvancedFilters(raw) {
  try {
    const arr = JSON.parse(String(raw || '[]'));
    return Array.isArray(arr) ? arr.slice(0, 20).filter(f => f && f.field && f.op) : [];
  } catch {
    return [];
  }
}

function toComparableText(v) {
  return String(v ?? '').trim().toLowerCase();
}

function isEmptyValue(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

function toTime(v) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function matchFilterValue(value, filter, type = 'text') {
  const op = filter.op;
  const target = filter.value;
  const target2 = filter.value2;
  if (op === 'empty') return isEmptyValue(value);
  if (op === 'not_empty') return !isEmptyValue(value);

  if (type === 'number' || type === 'currency') {
    const n = Number(value);
    const a = Number(target);
    const b = Number(target2);
    if (!Number.isFinite(n)) return false;
    if (op === 'eq') return n === a;
    if (op === 'ne') return n !== a;
    if (op === 'gt') return n > a;
    if (op === 'lt') return n < a;
    if (op === 'gte') return n >= a;
    if (op === 'lte') return n <= a;
    if (op === 'between') return n >= Math.min(a, b) && n <= Math.max(a, b);
    return false;
  }

  if (type === 'date' || type === 'timestamp') {
    const t = toTime(value);
    if (t === null) return false;
    const a = toTime(target);
    const b = toTime(target2);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (op === 'on' && a !== null) {
      const end = a + 24 * 60 * 60 * 1000;
      return t >= a && t < end;
    }
    if (op === 'before') return a !== null && t < a;
    if (op === 'after') return a !== null && t > a;
    if (op === 'between') return a !== null && b !== null && t >= Math.min(a, b) && t <= Math.max(a, b);
    if (op === 'last_days') return t >= today.getTime() - (Number(target) || 0) * 86400000;
    if (op === 'next_days') return t <= today.getTime() + (Number(target) || 0) * 86400000 && t >= today.getTime();
    return false;
  }

  if (type === 'boolean') {
    const bool = value === true || value === 'true' || value === '1';
    if (op === 'true') return bool === true;
    if (op === 'false') return bool === false;
    return false;
  }

  if (type === 'dropdown') {
    const vals = Array.isArray(target) ? target.map(toComparableText) : [toComparableText(target)];
    const v = toComparableText(value);
    if (op === 'in') return vals.includes(v);
    if (op === 'not_in') return !vals.includes(v);
    return false;
  }

  if (type === 'multiselect' || type === 'tag') {
    const vals = Array.isArray(value) ? value.map(toComparableText) : String(value || '').split(',').map(toComparableText).filter(Boolean);
    const targets = Array.isArray(target) ? target.map(toComparableText) : String(target || '').split(',').map(toComparableText).filter(Boolean);
    if (op === 'all') return targets.every(v => vals.includes(v));
    if (op === 'any') return targets.some(v => vals.includes(v));
    if (op === 'none') return !targets.some(v => vals.includes(v));
    return false;
  }

  const v = toComparableText(value);
  const a = toComparableText(target);
  if (op === 'is') return v === a;
  if (op === 'not') return v !== a;
  if (op === 'contains') return v.includes(a);
  if (op === 'not_contains') return !v.includes(a);
  return false;
}

function standardFilterValue(row, field, profileById = {}) {
  if (field === 'channel') return classifyChannel(row.utm_source, row.utm_medium, row.referrer);
  if (field === 'source') return row.utm_source || 'direct';
  if (field === 'medium') return row.utm_medium || '(none)';
  if (field === 'campaign') return row.utm_campaign || '';
  if (field === 'assigned_to') return row.assigned_to || '';
  if (field === 'assigned_name') return row.assigned_to ? (profileById[row.assigned_to]?.full_name || profileById[row.assigned_to]?.email || '') : '';
  if (field === 'city') return row.geo?.city || '';
  if (field === 'country') return row.geo?.country || '';
  if (field === 'device_type') return row.device?.device_type || '';
  return row[field] ?? '';
}

function standardFilterType(field) {
  if (field === 'registered_at' || field === 'last_interaction_at') return 'timestamp';
  return 'text';
}

async function getLatestInteractionByLeadIds(ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return {};
  const latest = {};

  if (await checkSupabase()) {
    let failed = false;
    const chunkSize = 500;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      let data = null;
      let error = null;
      try {
        ({ data, error } = await supabase
          .from('lead_notes')
          .select('registration_id,created_at')
          .in('registration_id', chunk)
          .order('created_at', { ascending: false }));
      } catch (e) {
        error = e;
      }
      if (error) {
        failed = true;
        break;
      }
      (data || []).forEach(n => {
        if (!latest[n.registration_id]) latest[n.registration_id] = n.created_at;
      });
    }
    if (!failed) return latest;
  }

  const notesByLead = await Promise.all(uniqueIds.map(async id => [id, await getLeadNotes(id)]));
  notesByLead.forEach(([id, notes]) => {
    if (notes?.[0]?.created_at) latest[id] = notes[0].created_at;
  });
  return latest;
}

async function hydrateLeadInteractions(rows) {
  const missingIds = (rows || []).filter(r => !r.last_interaction_at).map(r => r.id);
  if (!missingIds.length) return rows || [];
  const latest = await getLatestInteractionByLeadIds(missingIds);
  return (rows || []).map(r => latest[r.id] ? { ...r, last_interaction_at: latest[r.id] } : r);
}

async function hydrateLatestStaffNotes(rows, profiles = []) {
  const leadIds = [...new Set((rows || []).map(row => row.id).filter(Boolean))];
  if (!leadIds.length) return rows || [];

  // Both sale and admin accounts can perform CRM care actions. Only accept
  // notes authored by a known CRM staff account so system/imported records do
  // not unexpectedly become the lead's visible latest note.
  const staffIds = new Set((profiles || [])
    .map(profile => profile.user_id || profile.id)
    .filter(Boolean));
  if (!staffIds.size) return rows || [];

  const latestByLead = {};
  if (await checkSupabase()) {
    let failed = false;
    for (let i = 0; i < leadIds.length; i += 500) {
      const chunk = leadIds.slice(i, i + 500);
      let data = null;
      let error = null;
      try {
        ({ data, error } = await supabase
          .from('lead_notes')
          .select('registration_id,body,created_at,author_id')
          .in('registration_id', chunk)
          .order('created_at', { ascending: false }));
      } catch (e) {
        error = e;
      }
      if (error) {
        failed = true;
        break;
      }
      (data || []).forEach(note => {
        if (!latestByLead[note.registration_id] && staffIds.has(note.author_id)) latestByLead[note.registration_id] = note;
      });
    }
    if (!failed) {
      return (rows || []).map(row => latestByLead[row.id] ? {
        ...row,
        latest_sale_note: latestByLead[row.id].body || '',
        latest_sale_note_at: latestByLead[row.id].created_at || null,
      } : row);
    }
  }

  const notesByLead = await Promise.all(leadIds.map(async id => [id, await getLeadNotes(id)]));
  notesByLead.forEach(([id, notes]) => {
    const note = (notes || []).find(item => staffIds.has(item.author?.user_id));
    if (note) latestByLead[id] = note;
  });
  return (rows || []).map(row => latestByLead[row.id] ? {
    ...row,
    latest_sale_note: latestByLead[row.id].body || '',
    latest_sale_note_at: latestByLead[row.id].created_at || null,
  } : row);
}

function mapLeadSurvey(row) {
  if (!row) return null;
  return {
    q1_stage: row.q1_stage || '',
    q2_problem: row.q2_problem || '',
    q3_error: row.q3_error || '',
    q4_goal: row.q4_goal || '',
    q5_learning: row.q5_learning || '',
    q6_time: row.q6_time || '',
    q7_concern: row.q7_concern || '',
    q8_expectation: row.q8_expectation || '',
    q9_priority: row.q9_priority || '',
    submitted_at: row.submitted_at || null,
  };
}

async function getLeadExtraInfo(lead) {
  const extra = { interest: lead?.interest || '', survey: null };
  if (!lead?.id || !(await checkSupabase())) return extra;

  const [{ data: regData, error: regErr }, { data: surveyRows, error: surveyErr }] = await Promise.all([
    supabase.from('registrations').select('data').eq('id', lead.id).single(),
    supabase.from('surveys').select('q1_stage,q2_problem,q3_error,q4_goal,q5_learning,q6_time,q7_concern,q8_expectation,q9_priority,submitted_at')
      .eq('registration_id', lead.id)
      .order('submitted_at', { ascending: false })
      .limit(1),
  ]);

  if (!regErr && regData?.data?.interest) extra.interest = regData.data.interest;
  if (!surveyErr && surveyRows?.[0]) extra.survey = mapLeadSurvey(surveyRows[0]);
  return extra;
}

// GET /admin/debug
router.get('/debug', adminAuth, wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const sbOk = await checkSupabase();
  const result = { supabase_ok: sbOk, server_time: new Date().toISOString() };

  if (sbOk) {
    const [
      { count: ec },
      { count: rc },
      { data: latest, error: le },
      { count: pvCount, error: pve },
    ] = await Promise.all([
      supabase.from('events').select('*', { count: 'exact', head: true }),
      supabase.from('registrations').select('*', { count: 'exact', head: true }),
      supabase.from('events').select('data').order('created_at', { ascending: false }).limit(1),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('data->>event', 'pageview'),
    ]);
    result.sb_total_events              = ec;
    result.sb_total_regs                = rc;
    result.sb_latest_event_ts           = latest?.[0]?.data?.timestamp || null;
    result.sb_order_by_created_at_error = le?.message || null;
    result.sb_pageview_count            = pvCount ?? null;
    result.sb_pageview_filter_error     = pve?.message || null;

    const testId = 'debug_' + Date.now();
    const testTs = new Date().toISOString();
    const { error: writeErr } = await supabase.from('events').insert({ id: testId, data: { event: '__debug_test__', timestamp: testTs } });
    result.sb_write_test_error = writeErr?.message || null;
    result.sb_write_test_ok    = !writeErr;
    if (!writeErr) {
      const { data: readback, error: readErr } = await supabase.from('events').select('data').eq('id', testId).single();
      result.sb_write_readback_ok = !readErr && readback?.data?.event === '__debug_test__';
      await supabase.from('events').delete().eq('id', testId);
    }
  }

  const allEvents = await getEvents();
  result.getEvents_total     = allEvents.length;
  result.getEvents_pageviews = allEvents.filter(e => e.event === 'pageview').length;
  result.getEvents_latest_ts = allEvents.length ? allEvents[allEvents.length - 1]?.timestamp : null;

  res.json(result);
}));

function setPrivateAggregateCache(res, seconds = 30) {
  res.setHeader('Cache-Control', `private, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`);
  res.setHeader('Vary', 'Authorization');
}

const adminAnalyticsCache = new Map();
const ADMIN_ANALYTICS_CACHE_MS = 30000;
const SUPABASE_PAGE_SIZE = 1000;
const SUPABASE_MAX_ADMIN_ROWS = 50000;
const ANALYTICS_REG_COLS = 'id,name,email,phone,attendance,interest,page_id,region,registered_at,utm_source,utm_medium,utm_campaign,utm_content,utm_term,referrer,session_id,geo,device';

async function fetchPagedSupabaseRows(buildQuery, { pageSize = SUPABASE_PAGE_SIZE, maxRows = SUPABASE_MAX_ADMIN_ROWS } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { rows, error };
    const pageRows = data || [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }
  return { rows, error: null };
}

async function fetchAdminAnalyticsRegistrations({ dateFrom, dateTo, pageFilter } = {}) {
  if (await checkSupabase()) {
    const fromIso = dateFrom ? new Date(dateFrom).toISOString() : null;
    const toIso = dateTo ? new Date(dateTo).toISOString() : null;
    const result = await fetchPagedSupabaseRows(() => {
      let query = supabase
        .from('registrations')
        .select(ANALYTICS_REG_COLS)
        .order('registered_at', { ascending: true });
      if (fromIso) query = query.gte('registered_at', fromIso);
      if (toIso) query = query.lt('registered_at', toIso);
      if (pageFilter) query = query.eq('page_id', pageFilter);
      return query;
    });
    if (!result.error) return result.rows || [];
    console.warn('[admin/analytics] paged registrations failed:', result.error.message);
  }

  const rows = await getRegistrations();
  let registrations = rows || [];
  if (dateFrom || dateTo) {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTs = dateTo ? new Date(dateTo).getTime() : Infinity;
    registrations = registrations.filter(r => {
      const ts = new Date(r.registered_at).getTime();
      return ts >= fromTs && ts < toTs;
    });
  }
  if (pageFilter) registrations = registrations.filter(r => r.page_id === pageFilter);
  return registrations;
}

async function buildAdminAnalytics(query = {}, options = {}) {
  const { dateFrom, dateTo, page: pageFilter = '' } = query;
  const includeRegistrations = options.includeRegistrations !== false;
  const cacheKey = JSON.stringify({
    dateFrom: dateFrom || '',
    dateTo: dateTo || '',
    page: pageFilter || '',
    includeRegistrations,
  });
  const cached = adminAnalyticsCache.get(cacheKey);
  if (!query._refresh && cached && Date.now() - cached.ts < ADMIN_ANALYTICS_CACHE_MS) {
    return cached.data;
  }

  const [allRegs, allEvents] = await Promise.all([
    includeRegistrations ? fetchAdminAnalyticsRegistrations({ dateFrom, dateTo, pageFilter }) : Promise.resolve([]),
    getEvents(),
  ]);

  const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0;
  const toTs = dateTo ? new Date(dateTo).getTime() : Infinity;
  let events = (allEvents || []).filter(event => {
    const ts = new Date(event.timestamp || event.event_timestamp).getTime();
    const pageId = event.data?.page_id || event.page_id || '';
    return ts >= fromTs && ts < toTs && (!pageFilter || pageId === pageFilter);
  });

  // Old landing pages could load two tracker scripts. Collapse those legacy pairs,
  // while navigation_id provides exact de-duplication for all new pageviews.
  const seenPageviews = new Set();
  events = events.filter(event => {
    if (event.event !== 'pageview') return true;
    const data = event.data || {};
    const ts = new Date(event.timestamp || event.event_timestamp).getTime();
    const key = data.navigation_id
      ? `navigation:${data.navigation_id}`
      : `legacy:${data.page_id || ''}:${data.url || ''}:${Math.floor(ts / 1000)}`;
    if (seenPageviews.has(key)) return false;
    seenPageviews.add(key);
    return true;
  });

  const pageIds = [...new Set([
    ...events.map(event => event.data?.page_id || event.page_id),
    ...allRegs.map(registration => registration.page_id),
  ].filter(Boolean))].sort();
  const uniqueEventSessions = eventName => new Set(events
    .filter(event => event.event === eventName)
    .map(event => event.session_id || event.data?.session_id || event.ip || event.id)
    .filter(Boolean)).size;
  const pageviews = events.filter(event => event.event === 'pageview').length;
  const formOpens = uniqueEventSessions('form_open');
  const ctaClicks = uniqueEventSessions('cta_click');
  const exitIntent = uniqueEventSessions('exit_intent');
  const scrollAgg = {}, timeAgg = {}, ctaByPos = {}, sessionUtm = {};
  const trafficSource = {}, trafficMedium = {}, trafficChannel = {};

  events.forEach(event => {
    const data = event.data || {};
    const sessionId = event.session_id || data.session_id || '';
    if (event.event === 'pageview') {
      const src = data.utm_source || 'direct';
      const med = data.utm_medium || '(none)';
      const ref = data.referrer || '';
      const chan = classifyChannel(src === 'direct' ? '' : src, med === '(none)' ? '' : med, ref);
      trafficSource[src] = (trafficSource[src] || 0) + 1;
      trafficMedium[med] = (trafficMedium[med] || 0) + 1;
      trafficChannel[chan] = (trafficChannel[chan] || 0) + 1;
      if (sessionId && !sessionUtm[sessionId]) sessionUtm[sessionId] = { src, med, ref };
    }
    const scrollMatch = String(event.event || '').match(/^Scroll_(25|50|75|90|100)_Percent$/i);
    const depth = event.event === 'scroll_depth' ? Number(data.depth) : Number(scrollMatch?.[1]);
    if (depth) scrollAgg[depth] = (scrollAgg[depth] || 0) + 1;
    if (event.event === 'time_on_page') {
      const seconds = Number(data.seconds || data.duration || 0);
      [30, 60, 120].forEach(mark => { if (seconds >= mark) timeAgg[mark] = (timeAgg[mark] || 0) + 1; });
    }
    if (event.event === 'cta_click') {
      const position = data.position || data.label || 'Không xác định';
      ctaByPos[position] = (ctaByPos[position] || 0) + 1;
    }
  });

  // The Supabase path already filters by date + page; keep this for JSON fallback and safety.
  let registrations = allRegs;
  if (dateFrom || dateTo) {
    registrations = registrations.filter(r => {
      const ts = new Date(r.registered_at).getTime();
      return ts >= fromTs && ts < toTs;
    });
  }
  if (pageFilter) registrations = registrations.filter(r => r.page_id === pageFilter);

  // Registrations by day (14 days) — still computed from fetched regs
  const regByDay = {};
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    regByDay[d.toISOString().slice(0, 10)] = 0;
  }
  registrations.forEach(r => {
    const registeredAt = new Date(r.registered_at);
    const day = Number.isFinite(registeredAt.getTime())
      ? registeredAt.toISOString().slice(0, 10)
      : '';
    if (day && regByDay[day] !== undefined) regByDay[day]++;
  });

  // Leads attribution using session UTM fallback from SQL
  const leadsBySource = {}, leadsByMedium = {}, leadsByChannel = {}, leadsByRegion = {}, leadsByAttendance = {};
  registrations.forEach(r => {
    const sv   = sessionUtm[r.session_id] || {};
    const src  = r.utm_source || sv.src || 'direct';
    const med  = r.utm_medium || sv.med || '(none)';
    const ref  = r.referrer   || sv.ref || '';
    const chan = classifyChannel(src, med, ref);
    leadsBySource[src]               = (leadsBySource[src]               || 0) + 1;
    leadsByMedium[med]               = (leadsByMedium[med]               || 0) + 1;
    leadsByChannel[chan]             = (leadsByChannel[chan]              || 0) + 1;
    leadsByRegion[r.region     || 'Không xác định'] = (leadsByRegion[r.region     || 'Không xác định'] || 0) + 1;
    leadsByAttendance[r.attendance || 'Không xác định'] = (leadsByAttendance[r.attendance || 'Không xác định'] || 0) + 1;
  });

  const result = {
    pageIds,
    stats: {
      pageviews,
      formOpens,
      ctaClicks,
      exitIntent,
      conversions:    registrations.length,
      conversionRate: pageviews > 0 ? ((registrations.length / pageviews) * 100).toFixed(1) : 0,
      formConvRate:   formOpens  > 0 ? ((registrations.length / formOpens)  * 100).toFixed(0) : 0,
    },
    scrollDepth: {
      25: Number(scrollAgg['25'] || 0), 50: Number(scrollAgg['50'] || 0),
      75: Number(scrollAgg['75'] || 0), 90: Number(scrollAgg['90'] || 0),
    },
    timeOnPage: {
      30:  Number(timeAgg['30']  || 0),
      60:  Number(timeAgg['60']  || 0),
      120: Number(timeAgg['120'] || 0),
    },
    ctaByPos, regByDay,
    trafficSource, trafficMedium, trafficChannel,
    leadsBySource, leadsByMedium, leadsByChannel, leadsByRegion, leadsByAttendance,
    ...buildDeviceGeoStats([
      ...registrations,
      ...events.filter(event => event.event === 'pageview' && (event.data?.device || event.data?.geo))
        .map(event => ({ device: event.data.device, geo: event.data.geo })),
    ]),
  };
  adminAnalyticsCache.set(cacheKey, { data: result, ts: Date.now() });
  while (adminAnalyticsCache.size > 20) adminAnalyticsCache.delete(adminAnalyticsCache.keys().next().value);
  return result;
}

function pickAdminAnalyticsSlice(view, data) {
  if (view === 'overview') {
    const { pageIds, stats, regByDay, ctaByPos, scrollDepth, timeOnPage, trafficChannel } = data;
    return { pageIds, stats, regByDay, ctaByPos, scrollDepth, timeOnPage, trafficChannel };
  }
  if (view === 'traffic') {
    const {
      pageIds, stats, trafficSource, trafficMedium, trafficChannel,
      leadsBySource, leadsByMedium, leadsByChannel, leadsByRegion, leadsByAttendance,
    } = data;
    return { pageIds, stats, trafficSource, trafficMedium, trafficChannel, leadsBySource, leadsByMedium, leadsByChannel, leadsByRegion, leadsByAttendance };
  }
  if (view === 'behavior') {
    const { pageIds, stats, scrollDepth, timeOnPage, ctaByPos } = data;
    return { pageIds, stats, scrollDepth, timeOnPage, ctaByPos };
  }
  if (view === 'devices') {
    const { pageIds, stats, deviceType, browser, os, country, city, isp, leadsByRegion, leadsByAttendance } = data;
    return { pageIds, stats, deviceType, browser, os, country, city, isp, leadsByRegion, leadsByAttendance };
  }
  return data;
}

// GET /admin/api/:view
router.get('/api/:view', adminAuth, wrap(async (req, res) => {
  const view = String(req.params.view || '');
  if (!['overview', 'traffic', 'behavior', 'devices'].includes(view)) {
    return res.status(404).json({ error: 'Unknown admin API view' });
  }
  const data = await buildAdminAnalytics(req.query, {
    includeRegistrations: view !== 'behavior',
  });
  setPrivateAggregateCache(res, view === 'behavior' ? 45 : 30);
  res.json(pickAdminAnalyticsSlice(view, data));
}));

// GET /admin/data
router.get('/data', adminAuth, wrap(async (req, res) => {
  const data = await buildAdminAnalytics(req.query);
  res.setHeader('Cache-Control', 'no-store');
  res.json(data);
}));

function inFunnelDateRange(value, dateFrom, dateTo) {
  const ts = new Date(value || 0).getTime();
  if (!Number.isFinite(ts)) return false;
  if (dateFrom && ts < new Date(dateFrom).getTime()) return false;
  if (dateTo && ts >= new Date(dateTo).getTime()) return false;
  return true;
}

function funnelSource(row = {}) {
  return row.utm_source || (row.referrer ? (() => { try { return new URL(row.referrer).hostname; } catch { return 'referral'; } })() : 'direct');
}

async function buildFunnelsReport(query = {}) {
  const { dateFrom = '', dateTo = '' } = query;
  const funnels = discoverFunnels();
  const [events, registrations, manualOrders, payments] = await Promise.all([
    getEvents(), getRegistrations(), getFunnelOrders(), getPayments(),
  ]);
  const report = funnels.map(funnel => {
    const funnelEvents = (events || []).filter(event => {
      const meta = event.data || {};
      return findFunnel(funnels, meta.page_id || event.page_id, meta.url || event.url)?.id === funnel.id
        && inFunnelDateRange(event.timestamp || event.event_timestamp || event.created_at, dateFrom, dateTo);
    });
    const funnelRegs = (registrations || []).filter(reg => findFunnel(funnels, reg.page_id, reg.event_source_url || reg.referrer)?.id === funnel.id
      && inFunnelDateRange(reg.registered_at, dateFrom, dateTo));
    const regIds = new Set(funnelRegs.map(reg => reg.id));
    const paidGateway = (payments || []).filter(payment => payment.status === 'paid' && regIds.has(payment.registration_id)
      && inFunnelDateRange(payment.paid_at || payment.updated_at || payment.created_at, dateFrom, dateTo));
    const wonManual = (manualOrders || []).filter(sale => sale.status === 'won'
      && (sale.funnel_id === funnel.id || regIds.has(sale.registration_id))
      && inFunnelDateRange(sale.sold_at || sale.updated_at || sale.created_at, dateFrom, dateTo));
    const manuallyTracked = new Set(wonManual.map(sale => sale.registration_id));
    const gatewayOnly = paidGateway.filter(payment => !manuallyTracked.has(payment.registration_id));
    const sales = wonManual.length + gatewayOnly.length;
    const revenue = wonManual.reduce((sum, sale) => sum + Number(sale.amount || 0), 0)
      + gatewayOnly.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const rawPageviews = funnelEvents.filter(event => event.event === 'pageview');
    const seenPageviews = new Set();
    const pageviews = rawPageviews.filter(event => {
      const meta = event.data || {};
      const ts = new Date(event.timestamp || event.event_timestamp || event.created_at || 0).getTime();
      const key = meta.navigation_id
        ? `nav:${meta.navigation_id}`
        : `legacy:${meta.page_id || event.page_id || ''}:${meta.url || ''}:${Math.floor(ts / 1000)}`;
      if (seenPageviews.has(key)) return false;
      seenPageviews.add(key);
      return true;
    });
    const uniqueVisitors = new Set(pageviews.map(event => event.session_id || event.data?.session_id || event.ip).filter(Boolean)).size;
    const steps = ['home', 'thank-you'].map(step => {
      const stepEvents = pageviews.filter(event => isThankYou(event.data?.page_id || event.page_id || event.data?.url || event.url) === (step === 'thank-you'));
      const unique = new Set(stepEvents.map(event => event.session_id || event.data?.session_id || event.ip).filter(Boolean)).size;
      return {
        id: step,
        name: step === 'home' ? 'Home / Landing page' : 'Thank-you page',
        pageviews: stepEvents.length,
        unique_visitors: unique,
        optins: step === 'home' ? funnelRegs.length : 0,
        optin_rate: unique > 0 && step === 'home' ? Number((funnelRegs.length / unique * 100).toFixed(1)) : 0,
        sales: step === 'home' ? sales : 0,
        revenue: step === 'home' ? revenue : 0,
      };
    });
    const sources = {};
    funnelRegs.forEach(reg => { const source = funnelSource(reg); sources[source] = (sources[source] || 0) + 1; });
    return {
      ...funnel,
      unique_visitors: uniqueVisitors,
      pageviews: pageviews.length,
      optins: funnelRegs.length,
      optin_rate: uniqueVisitors ? Number((funnelRegs.length / uniqueVisitors * 100).toFixed(1)) : 0,
      sales,
      revenue,
      orders: sales,
      earnings_per_visit: uniqueVisitors ? Math.round(revenue / uniqueVisitors) : 0,
      average_order_value: sales ? Math.round(revenue / sales) : 0,
      steps,
      sources,
    };
  });
  return report;
}

// Funnel dashboard: one automatically discovered funnel per folder in /pages.
router.get('/funnels', adminAuth, wrap(async (req, res) => {
  const rows = await buildFunnelsReport(req.query);
  res.setHeader('Cache-Control', 'private, max-age=15');
  res.json({ rows, generated_at: new Date().toISOString() });
}));

router.get('/funnels/:slug', adminAuth, wrap(async (req, res) => {
  const rows = await buildFunnelsReport(req.query);
  const funnel = rows.find(row => row.slug === req.params.slug);
  if (!funnel) return res.status(404).json({ error: 'Funnel not found' });
  res.setHeader('Cache-Control', 'private, max-age=15');
  res.json(funnel);
}));

// GET /admin/leads — paginated + searchable leads list (backs the Leads tab table)
router.get('/leads', adminAuth, wrap(async (req, res) => {
  const {
    q = '',
    page: pageFilter = '',
    dateFrom, dateTo,
    pageNum = '1',
    pageSize = '20',
    all = '',
    assignee = '',
    filters = '',
    includeCustomFields = '',
  } = req.query;

  const pn        = Math.max(1, parseInt(pageNum, 10) || 1);
  const ps        = Math.min(500, Math.max(1, parseInt(pageSize, 10) || 20));
  const exportAll = all === '1' || all === 'true';
  const term      = sanitizeLeadSearch(q);
  const advancedFilters = parseAdvancedFilters(filters);
  const hasAdvancedFilters = advancedFilters.length > 0;
  const shouldIncludeCustomFields = includeCustomFields === '1' || includeCustomFields === 'true';

  res.setHeader('Cache-Control', 'no-store');
  const profiles = await getCrmProfiles({ includeInactive: true });
  const byId = profileMap(profiles);

  const applyLeadFilters = query => {
    if (pageFilter) query = query.eq('page_id', pageFilter);
    if (assignee) query = query.eq('assigned_to', assignee);
    if (dateFrom)   query = query.gte('registered_at', new Date(dateFrom).toISOString());
    if (dateTo)     query = query.lt('registered_at', new Date(dateTo).toISOString());
    if (term)       query = query.or(`email.ilike.%${term}%,phone.ilike.%${term}%`);
    query = query.order('registered_at', { ascending: false });
    return (exportAll || hasAdvancedFilters) ? query.limit(10000) : query.range((pn - 1) * ps, (pn - 1) * ps + ps - 1);
  };

  const applyAdvancedFilters = async rows => {
    if (!hasAdvancedFilters) return rows;
    const customFields = await getCustomFields({ includeInactive: false });
    const customById = Object.fromEntries(customFields.map(f => [f.id, f]));
    const needsCustom = advancedFilters.some(f => String(f.field).startsWith('custom:'));
    const needsTags = advancedFilters.some(f => f.field === 'tags');
    const customValues = needsCustom ? await getLeadCustomFieldValuesForIds(rows.map(r => r.id)) : {};
    const tagValues = needsTags ? await getLeadTagsForIds(rows.map(r => r.id)) : {};
    return rows.filter(row => advancedFilters.every(filter => {
      if (String(filter.field).startsWith('custom:')) {
        const fieldId = String(filter.field).slice(7);
        const field = customById[fieldId];
        if (!field) return false;
        const value = customValues[row.id]?.[fieldId] ?? '';
        return matchFilterValue(value, filter, field.type);
      }
      if (filter.field === 'tags') {
        return matchFilterValue(tagValues[row.id] || [], filter, 'tag');
      }
      return matchFilterValue(standardFilterValue(row, filter.field, byId), filter, filter.type || standardFilterType(filter.field));
    }));
  };

  if (await checkSupabase()) {
    try {
      let query = applyLeadFilters(supabase.from('registrations').select(LEADS_LIST_COLS, { count: 'exact' }));

      let { data, count, error } = await query;
      if (error && /last_interaction_at/i.test(error.message || '')) {
        if (!warnedMissingLastInteractionColumn) {
          console.warn('[admin/leads] registrations.last_interaction_at is unavailable; retrying with base CRM columns.');
          warnedMissingLastInteractionColumn = true;
        }
        ({ data, count, error } = await applyLeadFilters(supabase.from('registrations').select(LEADS_LIST_COLS_BASE, { count: 'exact' })));
      }
      if (!error) {
        let rows = await hydrateLeadInteractions(data || []);
        rows = await applyAdvancedFilters(rows);
        const total = hasAdvancedFilters ? rows.length : (count || 0);
        let pageRows = hasAdvancedFilters && !exportAll ? rows.slice((pn - 1) * ps, (pn - 1) * ps + ps) : rows;
        pageRows = await hydrateLatestStaffNotes(pageRows, profiles);
        if (shouldIncludeCustomFields) {
          const customValues = await getLeadCustomFieldValuesForIds(pageRows.map(r => r.id));
          pageRows = pageRows.map(row => ({ ...row, custom_values: customValues[row.id] || {} }));
        }
        return res.json({ rows: pageRows.map(r => mapLeadRow(r, byId)), total, pageNum: pn, pageSize: ps });
      }
      console.error('[admin/leads] Supabase error:', error.message);
    } catch (e) {
      console.warn('[admin/leads] Supabase unavailable, using fallback storage:', e.message);
    }
  }

  // Fallback: filter/paginate in memory (file storage or Supabase unavailable)
  let rows = await getRegistrations();
  if (pageFilter) rows = rows.filter(r => r.page_id === pageFilter);
  if (assignee) rows = rows.filter(r => r.assigned_to === assignee);
  if (dateFrom || dateTo) {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTs   = dateTo   ? new Date(dateTo).getTime()   : Infinity;
    rows = rows.filter(r => { const ts = new Date(r.registered_at).getTime(); return ts >= fromTs && ts < toTs; });
  }
  if (term) {
    const needle = term.toLowerCase().replace(/\\([%_\\])/g, '$1');
    rows = rows.filter(r => (r.email || '').toLowerCase().includes(needle) || (r.phone || '').includes(needle));
  }
  rows = rows.slice().reverse(); // newest first
  rows = await applyAdvancedFilters(rows);
  const total = rows.length;
  const pageRows = exportAll ? rows : rows.slice((pn - 1) * ps, (pn - 1) * ps + ps);
  let hydratedRows = await hydrateLeadInteractions(pageRows);
  hydratedRows = await hydrateLatestStaffNotes(hydratedRows, profiles);
  if (shouldIncludeCustomFields) {
    const customValues = await getLeadCustomFieldValuesForIds(hydratedRows.map(r => r.id));
    hydratedRows = hydratedRows.map(row => ({ ...row, custom_values: customValues[row.id] || {} }));
  }
  res.json({ rows: hydratedRows.map(r => mapLeadRow(r, byId)), total, pageNum: pn, pageSize: ps });
}));

// GET /admin/leads/duplicates — read-only duplicate lead report.
router.get('/leads/duplicates', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const report = await buildDuplicateLeadGroups({
    type: String(req.query.type || 'all'),
    q: String(req.query.q || ''),
    limit: req.query.limit || 100,
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ...report,
    generated_at: new Date().toISOString(),
  });
}));

// POST /admin/leads/merge — merge one duplicate lead into a primary lead.
router.post('/leads/merge', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const primaryId = String(req.body?.primary_id || '').trim();
  const duplicateId = String(req.body?.duplicate_id || '').trim();
  const mergedFields = req.body?.merged_fields && typeof req.body.merged_fields === 'object'
    ? req.body.merged_fields
    : {};
  if (!primaryId || !duplicateId || primaryId === duplicateId) {
    return res.status(400).json({ error: 'Can chon lead goc va lead bi merge khac nhau.' });
  }
  try {
    const result = await mergeRegistrations(primaryId, duplicateId, {
      merged_fields: mergedFields,
      reason: String(req.body?.reason || 'manual duplicate merge'),
      author: req.adminUser,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Khong merge duoc lead.' });
  }
}));

// POST /admin/leads — create a manual lead with minimal contact fields
router.post('/leads', adminAuth, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 160);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = String(req.body?.phone || '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Ho va ten la bat buoc' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email khong hop le' });
  }
  if (!phone) return res.status(400).json({ error: 'So dien thoai la bat buoc' });

  const registrations = await getRegistrations();
  const duplicate = registrations.find(r => String(r.email || '').trim().toLowerCase() === email);
  if (duplicate) {
    return res.status(409).json({ error: 'Email nay da ton tai trong danh sach lead', lead: duplicate });
  }

  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    name,
    email,
    phone,
    attendance: 'Manual lead',
    page_id: 'manual',
    region: '',
    interest: '',
    registered_at: now,
    utm_source: 'manual',
    utm_medium: 'crm',
    utm_campaign: '',
    utm_content: '',
    utm_term: '',
    referrer: '',
    session_id: `manual_${Date.now()}`,
    user_agent: 'CRM manual',
    created_by: req.adminUser?.id || '',
    created_by_email: req.adminUser?.email || '',
  };
  if (req.adminUser?.role === 'sale') {
    record.assigned_to = req.adminUser.id;
    record.assigned_at = now;
  }

  await insertRegistration(record);
  const lead = await getRegistrationById(record.id).catch(() => null);
  res.status(201).json({ success: true, lead: lead || record });
}));

// GET /admin/crm/users
router.get('/crm/users', adminAuth, wrap(async (req, res) => {
  const profiles = await getCrmProfiles({ includeInactive: true });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ rows: profiles });
}));

// POST /admin/crm/users - create a sale/admin login and CRM profile
router.post('/crm/users', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const fullName = String(req.body?.full_name || '').trim() || email;
  const role = req.body?.role === 'admin' ? 'admin' : 'sale';
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email không hợp lệ' });
  if (password.length < 8) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 8 ký tự' });
  if (await findAuthUserByEmail(email)) return res.status(409).json({ error: 'Email đã tồn tại trong hệ thống' });

  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.error || !created.data?.user) {
    return res.status(500).json({ error: created.error?.message || 'Không tạo được tài khoản nhân viên' });
  }
  try {
    await upsertCrmProfile({
      user_id: created.data.user.id,
      email,
      full_name: fullName,
      role,
      active: true,
    });
  } catch (error) {
    await supabase.auth.admin.deleteUser(created.data.user.id).catch(() => null);
    throw error;
  }
  res.status(201).json({ success: true, user_id: created.data.user.id, email, full_name: fullName, role });
}));

// DELETE /admin/crm/users/:userId - permanently remove a member and revoke access
router.delete('/crm/users/:userId', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const profiles = await getCrmProfiles({ includeInactive: true });
  const target = profiles.find(profile => profile.user_id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  const requesterId = String(req.adminUser?.id || '');
  const requesterEmail = String(req.adminUser?.email || '').toLowerCase();
  if ((requesterId && requesterId === target.user_id) || (requesterEmail && requesterEmail === String(target.email || '').toLowerCase())) {
    return res.status(400).json({ error: 'Bạn không thể tự xóa tài khoản đang đăng nhập' });
  }
  if (target.role === 'admin') {
    const remainingAdmins = profiles.filter(profile => profile.role === 'admin' && profile.active !== false && profile.user_id !== target.user_id);
    if (!remainingAdmins.length) return res.status(400).json({ error: 'Không thể xóa admin cuối cùng' });
  }

  await supabase.from('business_members').update({ invited_by: null }).eq('invited_by', target.user_id);
  await supabase.from('business_members').delete().eq('user_id', target.user_id);
  const deleted = await supabase.auth.admin.deleteUser(target.user_id);
  if (deleted.error) return res.status(500).json({ error: deleted.error.message || 'Không xóa được tài khoản nhân viên' });
  res.json({ success: true });
}));

// PUT /admin/crm/users/:userId
router.put('/crm/users/:userId', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const profiles = await getCrmProfiles({ includeInactive: true });
  const current = profiles.find(p => p.user_id === req.params.userId);
  const nextRole = req.body?.role === 'admin' ? 'admin' : 'sale';
  const nextActive = req.body?.active !== false;
  if (current?.role === 'admin' && (nextRole !== 'admin' || !nextActive)) {
    const otherAdmins = profiles.filter(profile => profile.user_id !== current.user_id && profile.role === 'admin' && profile.active !== false);
    if (!otherAdmins.length) return res.status(400).json({ error: 'Không thể hạ quyền hoặc vô hiệu hóa admin cuối cùng' });
  }
  await upsertCrmProfile({
    user_id: req.params.userId,
    email: req.body?.email || current?.email || '',
    full_name: req.body?.full_name || current?.full_name || req.body?.email || '',
    role: nextRole,
    active: nextActive,
  });
  res.json({ success: true });
}));

function assignmentPayload({ profiles, weights, counts }) {
  const activeSales = profiles.filter(p => p.active !== false && p.role === 'sale');
  const totalWeight = activeSales.reduce((sum, p) => sum + Math.max(0, Number(weights[p.user_id] || 0)), 0);
  const totalAssigned = activeSales.reduce((sum, p) => sum + Number(counts[p.user_id] || 0), 0);
  return activeSales.map(p => {
    const weight = Math.max(0, Number(weights[p.user_id] || 0));
    const assigned = Number(counts[p.user_id] || 0);
    return {
      user_id: p.user_id,
      email: p.email,
      full_name: p.full_name,
      weight,
      assigned_count: assigned,
      target_share: totalWeight > 0 ? Math.round((weight / totalWeight) * 1000) / 10 : 0,
      actual_share: totalAssigned > 0 ? Math.round((assigned / totalAssigned) * 1000) / 10 : 0,
    };
  });
}

// GET /admin/crm/settings
router.get('/crm/settings', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const [assignmentStats, customFields, scoringRules] = await Promise.all([
    getLeadAssignmentStats(),
    getCustomFields({ includeInactive: true }),
    getLeadScoringRules(),
  ]);
  const [tagCategories, tags, tagCounts] = await Promise.all([
    getTagCategories(),
    getCrmTags({ includeInactive: true }),
    getTagPeopleCounts(),
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    assignment: assignmentPayload(assignmentStats),
    customFields,
    scoringRules,
    tagCategories,
    tags: tags.map(t => ({ ...t, people_count: tagCounts[t.id] || 0 })),
  });
}));

// GET /admin/crm/webinar-settings
router.get('/crm/webinar-settings', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ settings: publicEverWebinarSettings(await getEverWebinarSettings()) });
}));

// PUT /admin/crm/webinar-settings
router.put('/crm/webinar-settings', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const current = await getEverWebinarSettings();
  const body = req.body || {};
  const apiKey = String(body.api_key || '').trim();
  const next = normalizeEverWebinarSettings({
    ...current,
    enabled: body.enabled === true,
    api_key: apiKey && apiKey !== '********' ? apiKey : current.api_key,
    webinar_id: body.webinar_id,
    schedule: body.schedule,
    timezone: body.timezone,
    timezone_id: body.timezone_id,
    date: body.date,
    phone_country_code: body.phone_country_code,
    twilio_consent: body.twilio_consent === true,
    require_phone: body.require_phone === true,
    join_url_type: body.join_url_type,
  });
  await setCrmSetting(EVERWEBINAR_SETTINGS_KEY, next);
  res.json({ success: true, settings: publicEverWebinarSettings(next) });
}));

// GET /admin/crm/scoring-rules
router.get('/crm/scoring-rules', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ rules: await getLeadScoringRules() });
}));

// PUT /admin/crm/scoring-rules
router.put('/crm/scoring-rules', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const rules = normalizeScoringRules(req.body?.rules || []);
  await setCrmSetting(LEAD_SCORING_RULES_KEY, rules);
  res.json({ success: true, rules });
}));

// GET /admin/crm/custom-fields
router.get('/crm/custom-fields', adminAuth, wrap(async (req, res) => {
  const rows = await getCustomFields({ includeInactive: false });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ rows });
}));

// GET /admin/crm/tags
router.get('/crm/tags', adminAuth, wrap(async (req, res) => {
  const includeCounts = req.query.counts !== '0';
  const [categories, tags, tagCounts] = await Promise.all([
    getTagCategories(),
    getCrmTags({ includeInactive: false }),
    includeCounts ? getTagPeopleCounts() : Promise.resolve({}),
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ categories, tags: tags.map(t => ({ ...t, people_count: tagCounts[t.id] || 0 })) });
}));

// GET /admin/crm/tags/:id/people-count
router.get('/crm/tags/:id/people-count', adminAuth, wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ tag_id: req.params.id, people_count: await getTagPeopleCount(req.params.id) });
}));

// GET /admin/crm/page-tags
router.get('/crm/page-tags', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const config = await getPageTagConfig({ ensureTags: true });
  if (!pageTagSyncRunning) {
    pageTagSyncRunning = true;
    syncAllPageTags(req.adminUser)
      .catch(e => console.warn('[crm/page-tags] background sync failed:', e.message))
      .finally(() => { pageTagSyncRunning = false; });
  }
  res.json(config);
}));

// PUT /admin/crm/page-tags/:pageId
router.put('/crm/page-tags/:pageId', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  try {
    const result = await setPageTagMapping(req.params.pageId, req.body?.tag_id || '', req.adminUser);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Invalid page tag mapping' });
  }
}));

// POST /admin/crm/page-tags/backfill
router.post('/crm/page-tags/backfill', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const results = await syncAllPageTags(req.adminUser);
  res.json({
    success: true,
    results,
    updated: results.reduce((sum, row) => sum + Number(row.updated || 0), 0),
  });
}));

// POST /admin/crm/tag-categories
router.post('/crm/tag-categories', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  try {
    const category = await upsertTagCategory(req.body || {});
    res.status(201).json({ success: true, category });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Invalid tag category' });
  }
}));

// PUT /admin/crm/tag-categories/:id
router.put('/crm/tag-categories/:id', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  try {
    const current = (await getTagCategories()).find(c => c.id === req.params.id);
    const category = await upsertTagCategory({ ...(current || {}), ...(req.body || {}), id: req.params.id });
    res.json({ success: true, category });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Invalid tag category' });
  }
}));

// DELETE /admin/crm/tag-categories/:id
router.delete('/crm/tag-categories/:id', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  await deleteTagCategory(req.params.id);
  res.json({ success: true });
}));

// POST /admin/crm/tags
router.post('/crm/tags', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  try {
    const tag = await upsertCrmTag(req.body || {});
    res.status(201).json({ success: true, tag });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Invalid tag' });
  }
}));

// PUT /admin/crm/tags/:id
router.put('/crm/tags/:id', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  try {
    const tag = await upsertCrmTag({ ...(req.body || {}), id: req.params.id });
    res.json({ success: true, tag });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Invalid tag' });
  }
}));

// DELETE /admin/crm/tags/:id
router.delete('/crm/tags/:id', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  await deleteCrmTag(req.params.id);
  res.json({ success: true });
}));

// PUT /admin/crm/lead-assignment
router.put('/crm/lead-assignment', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  await setLeadAssignmentConfig(req.body?.weights || {});
  const stats = await getLeadAssignmentStats();
  res.json({ success: true, assignment: assignmentPayload(stats) });
}));

// POST /admin/crm/custom-fields
router.post('/crm/custom-fields', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  let field;
  try {
    field = await upsertCustomField(req.body || {});
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Invalid custom field' });
  }
  res.status(201).json({ success: true, field });
}));

// PUT /admin/crm/custom-fields/:id
router.put('/crm/custom-fields/:id', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  let field;
  try {
    field = await upsertCustomField({ ...(req.body || {}), id: req.params.id });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Invalid custom field' });
  }
  res.json({ success: true, field });
}));

// DELETE /admin/crm/custom-fields/:id
router.delete('/crm/custom-fields/:id', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const fields = await getCustomFields({ includeInactive: true });
  const field = fields.find(f => f.id === req.params.id);
  if (!field) return res.status(404).json({ error: 'Custom field not found' });
  if (String(req.query.confirm || '') !== field.key) {
    return res.status(400).json({ error: 'Confirm key does not match' });
  }
  await deleteCustomField(req.params.id);
  res.json({ success: true });
}));

// PUT /admin/leads/:id/assignee
router.put('/leads/:id/assignee', adminAuth, wrap(async (req, res) => {
  const { user_id } = req.body || {};
  const lead = await getRegistrationById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const profiles = await getCrmProfiles({ includeInactive: false });
  if (user_id) {
    if (!profiles.some(p => p.user_id === user_id && p.role === 'sale')) return res.status(400).json({ error: 'Invalid assignee' });
  }

  if (req.adminUser.role !== 'admin' && !user_id) {
    return res.status(400).json({ error: 'Sale cannot clear assignee' });
  }

  await assignRegistration(req.params.id, user_id || null);
  res.json({ success: true });
}));

// POST /admin/leads/:id/notes
router.post('/leads/:id/notes', adminAuth, wrap(async (req, res) => {
  const r = await getRegistrationById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Lead not found' });
  if (!leadVisibleToUser(r, req.adminUser)) return res.status(403).json({ error: 'Forbidden' });
  if (!leadNoteWritableByUser(r, req.adminUser)) {
    return res.status(403).json({ error: 'You cannot add notes to this lead' });
  }
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Missing note body' });
  if (body.length > 4000) return res.status(400).json({ error: 'Note too long' });
  const interactionType = String(req.body?.interaction_type || 'note');
  const note = await addLeadNote(req.params.id, body, req.adminUser, interactionType);
  res.json({ success: true, note });
}));

// DELETE /admin/leads/:id/notes/:noteId - admin only
router.delete('/leads/:id/notes/:noteId', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const r = await getRegistrationById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Lead not found' });
  const deleted = await deleteLeadNote(req.params.id, req.params.noteId);
  if (!deleted) return res.status(404).json({ error: 'Note not found' });
  res.json({ success: true });
}));

// PUT /admin/leads/:id/custom-fields
router.put('/leads/:id/custom-fields', adminAuth, wrap(async (req, res) => {
  const r = await getRegistrationById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Lead not found' });
  if (!leadVisibleToUser(r, req.adminUser)) return res.status(403).json({ error: 'Forbidden' });
  try {
    await setLeadCustomFieldValues(req.params.id, req.body?.values || {}, req.adminUser);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message || 'Invalid custom field values' });
  }
  res.json({ success: true });
}));

// PUT /admin/leads/:id/tags
router.put('/leads/:id/tags', adminAuth, wrap(async (req, res) => {
  const r = await getRegistrationById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Lead not found' });
  if (!leadVisibleToUser(r, req.adminUser)) return res.status(403).json({ error: 'Forbidden' });
  await setLeadTags(req.params.id, req.body?.tag_ids || [], req.adminUser);
  res.json({ success: true });
}));

// DELETE /admin/leads/:id
router.delete('/leads/:id', adminAuth, requireRole('admin'), wrap(async (req, res) => {
  const r = await getRegistrationById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Lead not found' });
  await deleteRegistration(req.params.id);
  res.json({ success: true });
}));

// GET /admin/leads/:id/summary
router.get('/leads/:id/summary', adminAuth, wrap(async (req, res) => {
  const r = await getRegistrationById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Khong tim thay lead.' });
  if (!leadVisibleToUser(r, req.adminUser)) return res.status(403).json({ error: 'Forbidden' });
  await tagLeadByPage(r, req.adminUser).catch(e => console.warn('[admin/leads/:id/summary] page tag sync failed:', e.message));
  const [profiles, scoring] = await Promise.all([
    getCrmProfiles({ includeInactive: true }),
    calculateLeadScore(r).catch(e => {
      console.warn('[admin/leads/:id/summary] scoring failed:', e.message);
      return { score: 0, matched_rules: [] };
    }),
  ]);
  const assignee = r.assigned_to ? profileMap(profiles)[r.assigned_to] : null;
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email || '',
    page_id: r.page_id || 'default',
    region: r.region || '',
    attendance: r.attendance || '',
    registered_at: r.registered_at,
    assigned_to: r.assigned_to || '',
    assigned_profile: assignee || null,
    score: scoring.score || 0,
    score_matches: scoring.matched_rules?.length || 0,
    last_interaction_at: r.last_interaction_at || null,
    channel: classifyChannel(r.utm_source, r.utm_medium, r.referrer),
    source: r.utm_source || 'direct',
    medium: r.utm_medium || '(none)',
    campaign: r.utm_campaign || '',
    country: r.geo?.country || '',
    city: r.geo?.city || '',
  });
}));

// GET /admin/leads/:id/sections/:section
router.get('/leads/:id/sections/:section', adminAuth, wrap(async (req, res) => {
  const r = await getRegistrationById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Khong tim thay lead.' });
  if (!leadVisibleToUser(r, req.adminUser)) return res.status(403).json({ error: 'Forbidden' });
  const section = String(req.params.section || '');
  res.setHeader('Cache-Control', 'no-store');

  if (section === 'crm') {
    const profiles = await getCrmProfiles({ includeInactive: true });
    const assignee = r.assigned_to ? profileMap(profiles)[r.assigned_to] : null;
    return res.json({
      assigned_to: r.assigned_to || '',
      assigned_profile: assignee || null,
      last_interaction_at: r.last_interaction_at || null,
      users: profiles,
    });
  }

  if (section === 'notes') {
    const notes = await getLeadNotes(req.params.id);
    return res.json({ notes, last_interaction_at: r.last_interaction_at || notes?.[0]?.created_at || null });
  }

  if (section === 'tags') {
    await tagLeadByPage(r, req.adminUser).catch(e => console.warn('[admin/leads/:id/sections/tags] page tag sync failed:', e.message));
    const [tags, availableTags] = await Promise.all([
      getLeadTags(req.params.id),
      getCrmTags({ includeInactive: false }),
    ]);
    return res.json({ tags, available_tags: availableTags });
  }

  if (section === 'campaign') {
    const email = String(r.email || '').trim().toLowerCase();
    if (!email) {
      return res.json({
        email: '',
        summary: null,
        email_stats: null,
        rows: [],
        total_rows: 0,
      });
    }
    const [summary, detail] = await Promise.all([
      fetchTrainingProcessLeadSummary(email).catch(e => {
        console.warn('[admin/leads/:id/sections/campaign] summary failed:', e.message);
        return null;
      }),
      fetchTrainingProcessEmailDetail(email).catch(e => {
        console.warn('[admin/leads/:id/sections/campaign] email detail failed:', e.message);
        return null;
      }),
    ]);
    const rows = detail?.rows || [];
    return res.json({
      email,
      summary: summary || null,
      email_stats: detail ? {
        sent: rows.length,
        opened: detail.opened || 0,
        clicked: detail.clicked || 0,
        bounced: detail.bounced || 0,
      } : null,
      rows: rows.slice(0, 50),
      total_rows: rows.length,
    });
  }

  if (section === 'custom-fields') {
    const [customFields, customValues, registrationData] = await Promise.all([
      getCustomFields({ includeInactive: false }),
      getLeadCustomFieldValues(req.params.id),
      getRegistrationData(req.params.id).catch(() => ({})),
    ]);
    return res.json({
      custom_fields: customFields.map(f => ({ ...f, value: customValues[f.id] ?? f.default_value ?? '' })),
      registration_forms: Array.isArray(registrationData.registration_forms) ? registrationData.registration_forms : [],
    });
  }

  if (section === 'survey') {
    const extra = await getLeadExtraInfo(r);
    return res.json({ interest: extra.interest || r.interest || '', survey: extra.survey || null });
  }

  if (section === 'zoom') {
    return res.json({ zoom_attendances: await getLeadZoomAttendances(req.params.id, r.email) });
  }

  if (section === 'geo-device') {
    return res.json({ geo: r.geo || null, device: r.device || null, ip: r.ip || '', user_agent: r.user_agent || '' });
  }

  if (section === 'tracking') {
    return res.json({
      channel: classifyChannel(r.utm_source, r.utm_medium, r.referrer),
      utm_source: r.utm_source || '',
      utm_medium: r.utm_medium || '',
      utm_campaign: r.utm_campaign || '',
      utm_content: r.utm_content || '',
      utm_term: r.utm_term || '',
      referrer: r.referrer || '',
      fbclid: r.fbclid || '',
      gclid: r.gclid || '',
      ttclid: r.ttclid || '',
      msclkid: r.msclkid || '',
      twclid: r.twclid || '',
      fbc: r.fbc || '',
      fbp: r.fbp || '',
      ga: r.ga || '',
      ip: r.ip || '',
      user_agent: r.user_agent || '',
    });
  }

  return res.status(404).json({ error: 'Unknown lead section' });
}));

function normalizeOrderBody(body = {}) {
  const status = ['pending', 'won', 'lost', 'refunded'].includes(body.status) ? body.status : 'pending';
  return {
    status,
    amount: Math.max(0, Math.round(Number(body.amount || 0))),
    currency: String(body.currency || 'VND').toUpperCase().slice(0, 8),
    payment_method: String(body.payment_method || '').trim().slice(0, 100),
    note: String(body.note || '').trim().slice(0, 2000),
  };
}

// POST /admin/leads/:id/orders - every lead may have multiple orders.
router.post('/leads/:id/orders', adminAuth, wrap(async (req, res) => {
  const lead = await getRegistrationById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead.' });
  if (!leadVisibleToUser(lead, req.adminUser)) return res.status(403).json({ error: 'Forbidden' });
  const input = normalizeOrderBody(req.body);
  const funnels = discoverFunnels();
  const funnel = findFunnel(funnels, lead.page_id, lead.event_source_url || lead.referrer);
  const order = await createFunnelOrder({
    registration_id: lead.id,
    funnel_id: funnel?.id || lead.page_id || 'unknown',
    page_id: lead.page_id || '',
    ...input,
    sold_at: input.status === 'won' ? new Date().toISOString() : null,
    updated_by: req.adminUser?.id || null,
    updated_by_email: req.adminUser?.email || '',
    created_by: req.adminUser?.id || null,
    created_by_email: req.adminUser?.email || '',
  });
  adminAnalyticsCache.clear();
  res.status(201).json({ success: true, order });
}));

router.put('/leads/:id/orders/:orderId', adminAuth, wrap(async (req, res) => {
  const lead = await getRegistrationById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead.' });
  if (!leadVisibleToUser(lead, req.adminUser)) return res.status(403).json({ error: 'Forbidden' });
  const existing = await getFunnelOrder(req.params.orderId);
  if (!existing || existing.registration_id !== lead.id) return res.status(404).json({ error: 'Không tìm thấy đơn hàng.' });
  const input = normalizeOrderBody(req.body);
  const order = await updateFunnelOrder(req.params.orderId, {
    ...input,
    sold_at: input.status === 'won' ? (existing.sold_at || new Date().toISOString()) : null,
    updated_by: req.adminUser?.id || null,
    updated_by_email: req.adminUser?.email || '',
  }, req.adminUser);
  adminAnalyticsCache.clear();
  res.json({ success: true, order });
}));

router.delete('/leads/:id/orders/:orderId', adminAuth, wrap(async (req, res) => {
  const lead = await getRegistrationById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead.' });
  if (!leadVisibleToUser(lead, req.adminUser)) return res.status(403).json({ error: 'Forbidden' });
  const existing = await getFunnelOrder(req.params.orderId);
  if (!existing || existing.registration_id !== lead.id) return res.status(404).json({ error: 'Không tìm thấy đơn hàng.' });
  await deleteFunnelOrder(existing.id);
  adminAnalyticsCache.clear();
  res.json({ success: true });
}));

// GET /admin/leads/:id
router.get('/leads/:id', adminAuth, wrap(async (req, res) => {
  const r = await getRegistrationById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Không tìm thấy lead.' });
  if (!leadVisibleToUser(r, req.adminUser)) return res.status(403).json({ error: 'Forbidden' });
  const profiles = await getCrmProfiles({ includeInactive: true });
  const assignee = r.assigned_to ? profileMap(profiles)[r.assigned_to] : null;
  const notes = await getLeadNotes(req.params.id);
  const lastInteractionAt = r.last_interaction_at || notes?.[0]?.created_at || null;
  const extra = await getLeadExtraInfo(r);
  const [customFields, customValues, zoomAttendances, orders, allEvents] = await Promise.all([
    getCustomFields({ includeInactive: false }),
    getLeadCustomFieldValues(req.params.id),
    getLeadZoomAttendances(req.params.id, r.email),
    getFunnelOrders(req.params.id),
    getEvents(),
  ]);
  const activityEvents = (allEvents || [])
    .filter(event => r.session_id && (event.session_id || event.data?.session_id) === r.session_id)
    .map(event => ({
      id: event.id,
      type: event.event,
      occurred_at: event.timestamp || event.event_timestamp,
      page_id: event.data?.page_id || event.page_id || r.page_id || '',
      url: event.data?.url || '',
      position: event.data?.position || '',
    }))
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
  await tagLeadByPage(r, req.adminUser).catch(e => console.warn('[admin/leads/:id] page tag sync failed:', e.message));
  const tags = await getLeadTags(req.params.id);
  res.json({
    ...r,
    interest: extra.interest || r.interest || '',
    survey: extra.survey || null,
    custom_fields: customFields.map(f => ({ ...f, value: customValues[f.id] ?? f.default_value ?? '' })),
    tags,
    last_interaction_at: lastInteractionAt,
    assigned_profile: assignee || null,
    notes,
    activity_events: activityEvents,
    permissions: { can_delete_notes: req.adminUser.role === 'admin' },
    zoom_attendances: zoomAttendances,
    orders: orders || [],
    channel: classifyChannel(r.utm_source, r.utm_medium, r.referrer),
  });
}));

// GET /admin/survey
router.get('/survey', adminAuth, wrap(async (req, res) => {
  const [rows, regRows] = await Promise.all([getSurveys(), getRegistrations()]);

  function countChoices(field) {
    const counts = {};
    rows.forEach(r => {
      if (!r[field]) return;
      r[field].split(',').map(s => s.trim()).filter(Boolean).forEach(c => {
        counts[c] = (counts[c] || 0) + 1;
      });
    });
    return counts;
  }

  const interest = {};
  (regRows || []).forEach(r => {
    const v = (r.interest || r.data?.interest || '').trim();
    if (v) interest[v] = (interest[v] || 0) + 1;
  });

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    total:    rows.length,
    answered: rows.filter(r => r.q1_stage || r.q2_problem || r.q8_expectation).length,
    q1: countChoices('q1_stage'),
    q2: countChoices('q2_problem'),
    q3: countChoices('q3_error'),
    q4: countChoices('q4_goal'),
    q5: countChoices('q5_learning'),
    q6: countChoices('q6_time'),
    q7: countChoices('q7_concern'),
    q8: rows.map(r => r.q8_expectation).filter(Boolean),
    q9: rows.map(r => r.q9_priority).filter(Boolean),
    interest,
    totalWithInterest: Object.values(interest).reduce((s, v) => s + v, 0),
  });
}));

const ADMIN_VIEWS = new Set([
  'overview', 'traffic', 'behavior', 'devices', 'survey',
  'leads', 'duplicates', 'zoom', 'connector', 'users', 'tags', 'custom-fields', 'scoring', 'webhooks',
  'webinar-settings', 'cms',
]);

const ADMIN_TOOLS = new Set(['ads', 'cms']);

// Deep-link support for the admin SPA shell.
router.get('/view/:view', (req, res, next) => {
  if (!ADMIN_VIEWS.has(String(req.params.view || ''))) return next();
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

router.get('/settings/:view', (req, res, next) => {
  const view = String(req.params.view || '');
  if (!['connector', 'users', 'tags', 'custom-fields', 'scoring', 'webhooks', 'webinar-settings'].includes(view)) return next();
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

router.get('/tools/:view', (req, res, next) => {
  const view = String(req.params.view || '');
  if (!ADMIN_TOOLS.has(view)) return next();
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

router.get('/:view', (req, res, next) => {
  if (!ADMIN_VIEWS.has(String(req.params.view || ''))) return next();
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

module.exports = router;
