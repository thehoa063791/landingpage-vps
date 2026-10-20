const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createRepository } = require('../src/learningRepository');
const { pool } = require('../src/db');
const { importEbilaLearners, registrationId } = require('./import-ebila-learners');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ebila-import-'));
  try {
    const offline = Object.assign(new Error('offline'), { code: 'ECONNREFUSED' });
    const store = createRepository({ course: 'dong-tien', database: { query: async () => { throw offline; }, connect: async () => { throw offline; } }, directory, fallback: true });
    await store.update('lessons', 5, () => ({ id: 5, title: 'Bài 2', vimeo_video_id: '1215059283/abcd12', duration: 600, is_visible: true }));
    await store.update('lessons', 6, () => ({ id: 6, title: 'Bài 3', vimeo_video_id: '1215059190', duration: 1000, is_visible: true }));
    // Registrations table: one learner already registered here.
    const registrations = [{ id: 'local-1', email: 'Co.San@Example.com', page_id: 'dong-tien', data: {} }];
    const tagged = [];
    const db = { query: async (sql, values) => {
      if (/^select lower\(email\)/.test(sql)) return { rows: registrations.filter(r => r.page_id === values[0]).map(r => ({ email: r.email.toLowerCase() })) };
      if (/^select id from/.test(sql)) return { rows: registrations.filter(r => r.page_id === values[0] && r.data?.imported_from?.source === values[1]).map(r => ({ id: r.id })) };
      if (/^insert into public.registrations/.test(sql)) {
        const columns = sql.match(/\(([^)]+)\) values/)[1].split(', ');
        const row = Object.fromEntries(columns.map((c, i) => [c, c === 'data' ? JSON.parse(values[i]) : values[i]]));
        if (!registrations.some(r => r.id === row.id)) registrations.push(row);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    } };
    const data = {
      videos: [{ id: 19, vimeo_video_id: '1215059283', title: 'Bài 2 Công thức tích luỹ Vốn' }, { id: 24, vimeo_video_id: '1215059190', title: 'Bài 3' }, { id: 23, vimeo_video_id: '1215057891', title: 'Bài 0 (không có ở đây)' }],
      users: [
        { id: 1, full_name: 'Học Viên A', email: ' A@Example.com ', phone: '0901234567', region: 'Hà Nội', created_at: '2026-09-01T03:00:00+00:00', utm_source: 'facebook', tour_completed: 1 },
        { id: 2, full_name: 'Đã có', email: 'co.san@example.com', phone: '0907654321', region: 'HCM', created_at: '2026-09-02T03:00:00+00:00' },
        { id: 3, full_name: 'Sai email', email: 'not-an-email', phone: '', created_at: '2026-09-03T03:00:00+00:00' },
      ],
      progress: [
        { user_id: 1, lesson_id: 19, watched_ranges: [[0, 300], [250, 590]], watch_percent: 98, is_completed: 1, completed_at: '2026-09-01T04:00:00+00:00', last_position: 590, furthest_position: 590, created_at: '2026-09-01T03:10:00+00:00', updated_at: '2026-09-01T04:00:00+00:00', playback_speed: 125 },
        { user_id: 1, lesson_id: 24, watched_ranges: [[0, 1200]], watch_percent: 50, is_completed: 0, last_position: 500, furthest_position: 1200, created_at: '2026-09-01T05:00:00+00:00', updated_at: '2026-09-01T05:30:00+00:00' },
        { user_id: 1, lesson_id: 23, watched_ranges: [[0, 100]], is_completed: 0, created_at: '2026-09-01T05:00:00+00:00', updated_at: '2026-09-01T05:00:00+00:00' },
        { user_id: 2, lesson_id: 19, watched_ranges: [[0, 600]], is_completed: 1, created_at: '2026-09-02T05:00:00+00:00', updated_at: '2026-09-02T05:00:00+00:00' },
      ],
    };
    const run = apply => importEbilaLearners({ data, db, store, tagLead: async record => tagged.push(record.id), apply });

    const dry = await run(false);
    assert.deepEqual({ added: dry.added, existing: dry.skipped_existing_email, invalid: dry.skipped_invalid, rows: dry.progress_rows, completed: dry.progress_completed, unmatched: dry.progress_unmatched_lesson }, { added: 1, existing: 1, invalid: 1, rows: 2, completed: 2, unmatched: 1 });
    assert.deepEqual(dry.unmatched_lessons, ['1215057891 Bài 0 (không có ở đây)']);
    assert.equal(registrations.length, 1, 'A dry run writes nothing');
    assert.equal((await store.list('progress')).length, 0);

    await run(true);
    const id = registrationId(1);
    const row = registrations.find(r => r.id === id);
    assert.equal(row.email, 'a@example.com');
    assert.equal(row.registered_at, '2026-09-01T03:00:00.000Z', 'Registration keeps the original Ebila date');
    assert.equal(row.utm_source, 'facebook');
    assert.equal(row.data.imported_from.ebila_user_id, 1);
    assert.equal(row.assigned_to, undefined, 'Imported learners are not assigned to sales');
    assert.deepEqual(tagged, [id], 'Only the funnel tag is added');
    assert.ok(!registrations.some(r => r.email === 'co.san@example.com' && r.id !== 'local-1'), 'Emails already in the funnel are skipped');
    assert.equal((await store.get('learners', id)).tour_completed, true);
    const p5 = await store.get('progress', `${id}:5`);
    assert.deepEqual(p5.watched_ranges, [[0, 590]]);
    assert.equal(p5.is_completed, true);
    assert.equal(p5.playback_speed, 125);
    const p6 = await store.get('progress', `${id}:6`);
    assert.deepEqual(p6.watched_ranges, [[0, 1000]], 'Ranges are clamped to the lesson duration here');
    assert.equal(p6.watch_percent, 100);
    assert.equal(p6.is_completed, true, 'Full coverage counts as completed, as in the learning service');

    // Progress made here after the import is kept when the import runs again.
    await store.update('progress', `${id}:5`, p => ({ ...p, watched_ranges: [[0, 600]], watch_percent: 100, last_position: 600, updated_at: '2026-10-21T00:00:00.000Z' }));
    const again = await run(true);
    assert.equal(again.added, 0);
    assert.equal(again.already_imported, 1);
    assert.equal(registrations.length, 2, 'Re-running adds no duplicate registration');
    assert.equal(tagged.length, 1);
    const kept = await store.get('progress', `${id}:5`);
    assert.deepEqual(kept.watched_ranges, [[0, 600]]);
    assert.equal(kept.last_position, 600);
    console.log('PASS: Ebila learner import — dry run, silent registrations with original dates, skipped existing emails, progress matched by Vimeo ID and clamped, idempotent re-runs that keep newer local progress.');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool.end(); process.exit(process.exitCode || 0); });
