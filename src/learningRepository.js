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
  return { course, list, get, update, serial };
}
module.exports = { createRepository };
