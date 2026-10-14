const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('./db');

const tables = { learners: 'learning_learners', lessons: 'learning_lessons', progress: 'learning_progress', stages: 'learning_stages' };
// Every query is scoped to one course; rows of other courses are never visible.
function createRepository({ course = 'dong-tien', database = pool, directory = path.join(__dirname, '..', 'data'), fallback = process.env.NODE_ENV !== 'production' } = {}) {
  const pending = new Map();
  async function serial(key, fn) {
    const previous = pending.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(fn);
    pending.set(key, current);
    try { return await current; } finally { if (pending.get(key) === current) pending.delete(key); }
  }
  function table(kind) { if (!tables[kind]) throw new Error('Unknown learning table'); return tables[kind]; }
  function mayFallback(error) {
    // Missing migrations and SQL errors must never silently create a separate store.
    return fallback && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code);
  }
  const fallbackFile = kind => path.join(directory, `${table(kind)}.${course}.json`);
  async function readFile(kind) {
    try { return JSON.parse(await fs.readFile(fallbackFile(kind), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  async function list(kind) {
    try { return (await database.query(`select data from public.${table(kind)} where course=$1`, [course])).rows.map(row => row.data); }
    catch (error) { if (!mayFallback(error)) throw error; return Object.values(await readFile(kind)); }
  }
  async function get(kind, key) {
    try { return (await database.query(`select data from public.${table(kind)} where course=$1 and key=$2`, [course, String(key)])).rows[0]?.data || null; }
    catch (error) { if (!mayFallback(error)) throw error; return (await readFile(kind))[String(key)] || null; }
  }
  // One learner's progress rows through idx_learning_progress_lead, not the whole course.
  async function listForLearner(registrationId) {
    try { return (await database.query(`select data from public.learning_progress where course=$1 and data->>'registration_id'=$2`, [course, String(registrationId)])).rows.map(row => row.data); }
    catch (error) { if (!mayFallback(error)) throw error; return Object.values(await readFile('progress')).filter(row => String(row.registration_id) === String(registrationId)); }
  }
  async function update(kind, key, mutate) {
    const name = table(kind);
    return serial(name, async () => {
      let client;
      try {
        client = await database.connect();
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${name}:${course}:${key}`]);
        const previous = (await client.query(`select data from public.${name} where course=$1 and key=$2`, [course, String(key)])).rows[0]?.data || null;
        const next = await mutate(previous);
        await client.query(`insert into public.${name}(course,key,data) values($1,$2,$3) on conflict(course,key) do update set data=excluded.data,updated_at=now()`, [course, String(key), next]);
        await client.query('commit');
        return next;
      } catch (error) {
        if (client) await client.query('rollback').catch(() => {});
        if (!mayFallback(error)) throw error;
        const rows = await readFile(kind);
        const next = await mutate(rows[String(key)] || null);
        rows[String(key)] = next;
        await fs.mkdir(directory, { recursive: true });
        const destination = fallbackFile(kind);
        const temp = `${destination}.${crypto.randomUUID()}.tmp`;
        await fs.writeFile(temp, JSON.stringify(rows, null, 2));
        // Windows refuses to replace a file another request is reading; retry briefly.
        for (let attempt = 0; ; attempt++) {
          try { await fs.rename(temp, destination); break; }
          catch (renameError) {
            if (attempt >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(renameError.code)) { await fs.rm(temp, { force: true }); throw renameError; }
            await new Promise(resolve => setTimeout(resolve, 25));
          }
        }
        return next;
      } finally { client?.release(); }
    });
  }
  return { course, list, listForLearner, get, update, serial };
}

// Progress rows of the given courses changed after a cursor, oldest first, for the partner
// change feed. A cursor is { at, course, key }; `at` is UTC ISO with Postgres' microseconds.
async function progressChanges({ courses, after = null, limit = 100, database = pool, directory = path.join(__dirname, '..', 'data'), fallback = process.env.NODE_ENV !== 'production' } = {}) {
  if (!courses.length) return [];
  try {
    const params = [courses, limit];
    let where = 'course = any($1)';
    if (after) { params.push(after.at, after.course, after.key); where += ' and (updated_at, course, key) > ($3::timestamptz, $4, $5)'; }
    const { rows } = await database.query(`select course, key, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at, data->>'registration_id' as registration_id from public.learning_progress where ${where} order by updated_at, course, key limit $2`, params);
    return rows;
  } catch (error) {
    if (!(fallback && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code))) throw error;
    const rows = [];
    for (const course of courses) {
      let data = {};
      try { data = JSON.parse(await fs.readFile(path.join(directory, `learning_progress.${course}.json`), 'utf8')); }
      catch (readError) { if (readError.code !== 'ENOENT') throw readError; }
      for (const [key, row] of Object.entries(data)) rows.push({ course, key, at: row.updated_at || row.created_at || '', registration_id: row.registration_id });
    }
    const order = (a, b) => a.at.localeCompare(b.at) || a.course.localeCompare(b.course) || a.key.localeCompare(b.key);
    return rows.filter(row => !after || order(row, after) > 0).sort(order).slice(0, limit);
  }
}

module.exports = { createRepository, progressChanges };
