// node scripts/import-ebila-learners.js <export.json> [--apply]
// Brings the Dong Tien learners of the old Ebila academic-survey backend (brand dong-tien)
// into the dong-tien funnel: one registration per learner plus their lesson progress,
// matched to lessons by Vimeo ID. Without --apply it only reports what it would do.
// Silent import: no Meta CAPI/Pixel, webhooks, HubCRM, emails, events or sales assignment;
// only the funnel's CRM tag. Emails already registered in the funnel are skipped, and
// registration IDs derive from the Ebila user ID, so re-running adds only new learners.
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs/promises');
const { getCourse } = require('../src/learningCourses');
const { mergeRanges } = require('../src/learningService');

const SOURCE = 'ebila_academic_survey';
const emailKey = value => String(value || '').trim().toLowerCase();
const text = value => (value == null ? '' : String(value).trim());
const baseVideo = value => String(value || '').split('/')[0];

// A stable UUID (v5 layout) per Ebila user, so the same learner always maps to one row.
function registrationId(ebilaUserId) {
  const hash = crypto.createHash('sha256').update(`ebila:dong-tien:${ebilaUserId}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function registration(user, page) {
  const registered_at = new Date(user.created_at).toISOString();
  const record = {
    id: registrationId(user.id), name: text(user.full_name), email: emailKey(user.email), phone: text(user.phone), region: text(user.region), interest: text(user.interest),
    page_id: page, registered_at,
    utm_source: text(user.utm_source), utm_medium: text(user.utm_medium), utm_campaign: text(user.utm_campaign), utm_content: text(user.utm_content), utm_term: text(user.utm_term),
    referrer: text(user.referrer), fbclid: text(user.fbclid), gclid: text(user.gclid), fbc: text(user.fbc), fbp: text(user.fbp), ip: text(user.ip_address), user_agent: text(user.user_agent),
  };
  const form = { id: crypto.randomUUID(), source: SOURCE, submitted_at: registered_at, captured_at: new Date().toISOString(), name: record.name, phone: record.phone, email: record.email, page_id: page, region: record.region, interest: record.interest, utm_source: record.utm_source, utm_medium: record.utm_medium, utm_campaign: record.utm_campaign, utm_content: record.utm_content, utm_term: record.utm_term, referrer: record.referrer, fbclid: record.fbclid, gclid: record.gclid };
  record.data = { ...record, imported_from: { source: SOURCE, ebila_user_id: user.id, registration_source: text(user.registration_source), imported_at: new Date().toISOString() }, registration_forms: [form] };
  return record;
}

function progressRow(row, lesson, regId, courseId) {
  const duration = Number(lesson.duration);
  const watched_ranges = mergeRanges(Array.isArray(row.watched_ranges) ? row.watched_ranges : [], duration);
  const watched = watched_ranges.reduce((sum, [start, end]) => sum + end - start, 0);
  const watch_percent = Math.min(100, watched / duration * 100);
  const is_completed = !!row.is_completed || watch_percent >= 95;
  const updated_at = new Date(row.updated_at || row.created_at).toISOString();
  return {
    id: `${regId}:${lesson.id}`, user_id: regId, registration_id: regId, course_id: courseId, lesson_id: Number(lesson.id), duration,
    last_position: Math.min(duration, Math.max(0, Number(row.last_position) || 0)), furthest_position: Math.min(duration, Math.max(0, Number(row.furthest_position) || 0)),
    watched_ranges, watch_percent, is_completed, completed_at: is_completed ? new Date(row.completed_at || row.updated_at || row.created_at).toISOString() : null,
    playback_speed: Number(row.playback_speed) || 100, created_at: new Date(row.created_at).toISOString(), updated_at, imported_from: SOURCE,
  };
}

async function importEbilaLearners({ data, db, store, tagLead, course = getCourse('dong-tien'), apply = false }) {
  if (!Array.isArray(data?.users) || !Array.isArray(data?.progress) || !Array.isArray(data?.videos)) throw new Error('Export must contain users, progress and videos.');
  const page = course.page_id;
  const existing = new Set((await db.query('select lower(email) as email from public.registrations where page_id = $1', [page])).rows.map(r => r.email));
  const imported = new Set((await db.query("select id from public.registrations where page_id = $1 and data->'imported_from'->>'source' = $2", [page, SOURCE])).rows.map(r => r.id));
  const lessons = (await store.list('lessons')).filter(l => !l.is_deleted && l.vimeo_video_id && Number(l.duration) > 0);
  const lessonByVideo = new Map(lessons.map(l => [baseVideo(l.vimeo_video_id), l]));
  const lessonFor = new Map(data.videos.map(v => [Number(v.id), lessonByVideo.get(baseVideo(v.vimeo_video_id))]));
  const progressByUser = new Map();
  for (const row of data.progress) progressByUser.set(Number(row.user_id), [...(progressByUser.get(Number(row.user_id)) || []), row]);

  const report = { learners: data.users.length, added: 0, already_imported: 0, skipped_existing_email: 0, skipped_invalid: 0, progress_rows: 0, progress_completed: 0, progress_unmatched_lesson: 0, unmatched_lessons: [] };
  const seen = new Set();
  for (const user of data.users) {
    const email = emailKey(user.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email) || !Number.isFinite(new Date(user.created_at).getTime())) { report.skipped_invalid++; continue; }
    seen.add(email);
    const record = registration(user, page);
    // Learners imported on an earlier run still receive progress they made on Ebila since.
    const again = imported.has(record.id);
    if (!again && existing.has(email)) { report.skipped_existing_email++; continue; }
    const rows = [];
    for (const row of progressByUser.get(Number(user.id)) || []) {
      const lesson = lessonFor.get(Number(row.lesson_id));
      if (!lesson) { report.progress_unmatched_lesson++; continue; }
      rows.push(progressRow(row, lesson, record.id, course.id));
    }
    report.progress_rows += rows.length;
    report.progress_completed += rows.filter(r => r.is_completed).length;
    if (again) report.already_imported++; else report.added++;
    if (!apply) continue;
    if (!again) {
      const columns = ['id', 'data', 'name', 'email', 'phone', 'interest', 'page_id', 'region', 'registered_at', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer', 'ip', 'fbc', 'fbp', 'fbclid', 'gclid', 'user_agent', 'created_at'];
      const values = columns.map(c => c === 'data' ? JSON.stringify(record.data) : c === 'created_at' ? record.registered_at : record[c] || (['name', 'email', 'phone'].includes(c) ? '' : null));
      await db.query(`insert into public.registrations (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) on conflict (id) do nothing`, values);
      await tagLead(record);
    }
    await store.update('learners', record.id, previous => ({ ...previous, registration_id: record.id, tour_completed: !!(previous?.tour_completed || user.tour_completed), imported_from: SOURCE }));
    // Progress made here after the import is kept; Ebila coverage is merged into it.
    for (const row of rows) {
      await store.update('progress', row.id, previous => {
        if (!previous) return row;
        const watched_ranges = mergeRanges([...previous.watched_ranges, ...row.watched_ranges], row.duration);
        const watch_percent = Math.min(100, watched_ranges.reduce((sum, [a, b]) => sum + b - a, 0) / row.duration * 100);
        const is_completed = previous.is_completed || row.is_completed || watch_percent >= 95;
        const newer = String(row.updated_at) > String(previous.updated_at);
        return { ...previous, watched_ranges, watch_percent, is_completed, completed_at: previous.completed_at || (is_completed ? row.completed_at || row.updated_at : null), furthest_position: Math.max(previous.furthest_position, row.furthest_position), ...(newer ? { last_position: row.last_position, updated_at: row.updated_at } : {}) };
      });
    }
  }
  report.unmatched_lessons = data.videos.filter(v => !lessonFor.get(Number(v.id))).map(v => `${v.vimeo_video_id} ${v.title}`);
  return report;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/import-ebila-learners.js <export.json> [--apply]');
  const apply = process.argv.includes('--apply');
  const { pool } = require('../src/db');
  const { createRepository } = require('../src/learningRepository');
  const { tagLeadByPage } = require('../src/storage');
  try {
    const course = getCourse('dong-tien');
    const report = await importEbilaLearners({ data: JSON.parse(await fs.readFile(file, 'utf8')), db: pool, store: createRepository({ course: course.id, fallback: false }), tagLead: tagLeadByPage, course, apply });
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...report }, null, 2));
  } finally { await pool.end(); }
}

// storage.js keeps its own timers and connections open; exit once the import is done.
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => process.exit(process.exitCode || 0));
module.exports = { importEbilaLearners, registrationId };
