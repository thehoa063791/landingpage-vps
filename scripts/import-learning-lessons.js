// node scripts/import-learning-lessons.js <course> <catalog.json>   (course: see src/learningCourses.js)
// Each lesson requires id, title, vimeo_video_id, duration (seconds), position. Lessons go
// through the admin save path, so validation and local Vimeo thumbnails match the admin UI.
// Re-running updates the listed lessons and keeps chapters, surveys and progress.
require('dotenv').config();
const fs = require('fs/promises');
const { pool } = require('../src/db');
const { getCourse } = require('../src/learningCourses');
const { createAdminService } = require('../src/learningAdmin');
async function main() {
  const [courseId, file] = process.argv.slice(2);
  if (!courseId || !file) throw new Error('Usage: node scripts/import-learning-lessons.js <course> <catalog.json>');
  const course = getCourse(courseId);
  const input = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!Array.isArray(input) || !input.length) throw new Error('Catalog must be a non-empty array.');
  const ids = new Set();
  const rows = input.map((row, index) => {
    const id = Number(row.id), duration = Number(row.duration), video = String(row.vimeo_video_id || row.video_id || '');
    if (!Number.isSafeInteger(id) || id < 1 || ids.has(id) || !String(row.title || '').trim() || !/^\d+(?:\/[a-zA-Z0-9]+)?$/.test(video) || !Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid lesson at row ${index + 1}`);
    ids.add(id);
    return { ...row, id, duration, title: String(row.title).trim(), vimeo_video_id: video, position: Number(row.position || index + 1), is_visible: row.is_visible !== false, unlock_after_seconds: Number(row.unlock_after_seconds || 0) };
  });
  const admin = createAdminService({ course });
  const existing = new Set((await admin.configuration()).lessons.map(lesson => Number(lesson.id)));
  for (const row of rows) await admin.saveLesson(existing.has(row.id) ? row.id : null, row);
  console.log(`Imported ${rows.length} lessons into the ${course.id} learning catalog.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
