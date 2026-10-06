const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('./db');

const tables = { learners: 'dong_tien_learners', lessons: 'dong_tien_lessons', progress: 'dong_tien_progress', stages: 'dong_tien_stages' };
function createRepository({ database = pool, directory = path.join(__dirname, '..', 'data'), fallback = process.env.NODE_ENV !== 'production' } = {}) {
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
  async function readFile(kind) {
    try { return JSON.parse(await fs.readFile(path.join(directory, `${table(kind)}.json`), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  async function list(kind) {
    try { return (await database.query(`select data from public.${table(kind)}`)).rows.map(row => row.data); }
    catch (error) { if (!mayFallback(error)) throw error; return Object.values(await readFile(kind)); }
  }
  async function get(kind, key) {
    try { return (await database.query(`select data from public.${table(kind)} where key=$1`, [String(key)])).rows[0]?.data || null; }
    catch (error) { if (!mayFallback(error)) throw error; return (await readFile(kind))[String(key)] || null; }
  }
  async function update(kind, key, mutate) {
    const name = table(kind);
    return serial(name, async () => {
      let client;
      try {
        client = await database.connect();
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${name}:${key}`]);
        const previous = (await client.query(`select data from public.${name} where key=$1`, [String(key)])).rows[0]?.data || null;
        const next = await mutate(previous);
        await client.query(`insert into public.${name}(key,data) values($1,$2) on conflict(key) do update set data=excluded.data,updated_at=now()`, [String(key), next]);
        await client.query('commit');
        return next;
      } catch (error) {
        if (client) await client.query('rollback').catch(() => {});
        if (!mayFallback(error)) throw error;
        const rows = await readFile(kind);
        const next = await mutate(rows[String(key)] || null);
        rows[String(key)] = next;
        await fs.mkdir(directory, { recursive: true });
        const destination = path.join(directory, `${name}.json`);
        const temp = `${destination}.${crypto.randomUUID()}.tmp`;
        await fs.writeFile(temp, JSON.stringify(rows, null, 2));
        await fs.rename(temp, destination);
        return next;
      } finally { client?.release(); }
    });
  }
  return { list, get, update, serial };
}
module.exports = { createRepository };
