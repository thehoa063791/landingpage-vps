// Partner API keys (table api_clients). Only a SHA-256 hash of each key is stored; the key
// itself is shown once, when created or rotated. Managed in Admin > Cài đặt > API đối tác
// or with scripts/partner-key.cjs. Without PostgreSQL in development, keys live in
// data/api_clients.json.
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../db');

const hashKey = key => crypto.createHash('sha256').update(String(key)).digest('hex');
const generateKey = () => `ptb_${crypto.randomBytes(24).toString('base64url')}`;
const OFFLINE = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
const invalid = message => Object.assign(new Error(message), { status: 400 });

function normalize(row) {
  if (!row) return null;
  const data = row.data || {};
  return {
    id: row.id, name: row.name, key_prefix: row.key_prefix, key_hash: row.key_hash,
    scopes: [...(row.scopes || [])], courses: [...(row.courses || [])], ip_allowlist: [...(row.ip_allowlist || [])],
    rate_limit_per_minute: Number(row.rate_limit_per_minute || 60),
    created_by: data.created_by || null, updated_by: data.updated_by || null,
    rotated_at: data.rotated_at || null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    revoked_at: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    last_used_at: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
  };
}

// Checks a key's settings against the scopes and courses that exist. `partial` validates
// only the fields present (editing).
function validateClientInput(input, { scopes: knownScopes, courses: knownCourses, partial = false }) {
  const out = {};
  const list = value => Array.isArray(value) ? value.map(v => String(v).trim()).filter(Boolean) : String(value ?? '').split(/[\s,]+/).filter(Boolean);
  if (!partial || input.name !== undefined) {
    out.name = String(input.name ?? '').trim();
    if (!out.name || out.name.length > 200) throw invalid('Nhập tên đối tác (tối đa 200 ký tự).');
  }
  if (!partial || input.scopes !== undefined) {
    out.scopes = [...new Set(list(input.scopes))];
    const unknown = out.scopes.find(s => !knownScopes.includes(s));
    if (unknown) throw invalid(`Quyền không tồn tại: ${unknown}.`);
    if (!out.scopes.includes('contact:basic')) throw invalid('Khóa cần quyền contact:basic để tra cứu khách hàng.');
  }
  if (!partial || input.courses !== undefined) {
    out.courses = [...new Set(list(input.courses))];
    const unknown = out.courses.find(c => !knownCourses.includes(c));
    if (unknown) throw invalid(`Khóa học không tồn tại: ${unknown}.`);
  }
  if (!partial || input.rate_limit_per_minute !== undefined) {
    out.rate_limit_per_minute = input.rate_limit_per_minute === undefined || input.rate_limit_per_minute === '' ? 60 : Number(input.rate_limit_per_minute);
    if (!Number.isInteger(out.rate_limit_per_minute) || out.rate_limit_per_minute < 1 || out.rate_limit_per_minute > 6000) throw invalid('Giới hạn lượt gọi phải là số nguyên từ 1 đến 6000.');
  }
  if (!partial || input.ip_allowlist !== undefined) {
    out.ip_allowlist = [...new Set(list(input.ip_allowlist))];
    const bad = out.ip_allowlist.find(ip => !/^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i.test(ip));
    if (bad) throw invalid(`Địa chỉ IP không hợp lệ: ${bad}.`);
    if (out.ip_allowlist.length > 50) throw invalid('Tối đa 50 địa chỉ IP.');
  }
  return out;
}

function createClientStore({ database = pool, directory = path.join(__dirname, '..', '..', 'data'), fallback = process.env.NODE_ENV !== 'production', cacheMs = 30000 } = {}) {
  const file = path.join(directory, 'api_clients.json');
  const cache = new Map(), touched = new Map();
  const mayFallback = error => fallback && OFFLINE.includes(error.code);
  async function readFile() {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async function writeFile(rows) {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(file, JSON.stringify(rows, null, 2));
  }
  // Changes made in this process apply at once; another process (the CLI) waits for `cacheMs`.
  function forget(id) { for (const [hash, hit] of cache) if (hit.client?.id === id) cache.delete(hash); }

  // Active client for a presented key, or null.
  async function authenticate(key) {
    if (!/^ptb_[A-Za-z0-9_-]{20,100}$/.test(String(key || ''))) return null;
    const hash = hashKey(key), hit = cache.get(hash);
    if (hit && hit.until > Date.now()) return hit.client;
    let client;
    try { client = normalize((await database.query('select * from public.api_clients where key_hash=$1', [hash])).rows[0]); }
    catch (error) { if (!mayFallback(error)) throw error; client = normalize((await readFile()).find(row => row.key_hash === hash)); }
    if (client?.revoked_at) client = null;
    cache.set(hash, { client, until: Date.now() + cacheMs });
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    return client;
  }

  async function get(id) {
    try { return normalize((await database.query('select * from public.api_clients where id=$1', [id])).rows[0]); }
    catch (error) { if (!mayFallback(error)) throw error; return normalize((await readFile()).find(row => row.id === id)); }
  }

  async function create({ name, scopes, courses = [], rate_limit_per_minute = 60, ip_allowlist = [] }, { by = null } = {}) {
    const key = generateKey();
    const row = { id: crypto.randomUUID(), name, key_prefix: key.slice(0, 12), key_hash: hashKey(key), scopes, courses, ip_allowlist, rate_limit_per_minute, data: { created_by: by }, created_at: new Date().toISOString(), revoked_at: null, last_used_at: null };
    try {
      await database.query('insert into public.api_clients (id, name, key_prefix, key_hash, scopes, courses, ip_allowlist, rate_limit_per_minute, data) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [row.id, row.name, row.key_prefix, row.key_hash, scopes, courses, ip_allowlist, rate_limit_per_minute, row.data]);
    } catch (error) {
      if (!mayFallback(error)) throw error;
      await writeFile([...await readFile(), row]);
    }
    return { client: normalize(row), key };
  }

  // Edits the settings of an active key; the key itself does not change.
  async function update(id, patch, { by = null } = {}) {
    const fields = ['name', 'scopes', 'courses', 'rate_limit_per_minute', 'ip_allowlist'].filter(f => patch[f] !== undefined);
    let client;
    try {
      const sets = fields.map((f, i) => `${f}=$${i + 3}`);
      const { rows } = await database.query(`update public.api_clients set ${[...sets, `data = data || jsonb_build_object('updated_by', $2::text)`].join(', ')} where id=$1 and revoked_at is null returning *`, [id, by, ...fields.map(f => patch[f])]);
      client = normalize(rows[0]);
    } catch (error) {
      if (!mayFallback(error)) throw error;
      const rows = await readFile(), row = rows.find(r => r.id === id && !r.revoked_at);
      if (row) { for (const f of fields) row[f] = patch[f]; row.data = { ...row.data, updated_by: by }; await writeFile(rows); }
      client = normalize(row);
    }
    forget(id);
    return client;
  }

  // A new key for the same partner and settings; the old key stops working at once.
  async function rotate(id, { by = null } = {}) {
    const key = generateKey(), at = new Date().toISOString();
    let client;
    try {
      const { rows } = await database.query(`update public.api_clients set key_hash=$2, key_prefix=$3, data = data || jsonb_build_object('rotated_at', $4::text, 'updated_by', $5::text) where id=$1 and revoked_at is null returning *`, [id, hashKey(key), key.slice(0, 12), at, by]);
      client = normalize(rows[0]);
    } catch (error) {
      if (!mayFallback(error)) throw error;
      const rows = await readFile(), row = rows.find(r => r.id === id && !r.revoked_at);
      if (row) { Object.assign(row, { key_hash: hashKey(key), key_prefix: key.slice(0, 12) }); row.data = { ...row.data, rotated_at: at, updated_by: by }; await writeFile(rows); }
      client = normalize(row);
    }
    forget(id);
    return client ? { client, key } : null;
  }

  async function list() {
    try { return (await database.query('select * from public.api_clients order by created_at')).rows.map(normalize); }
    catch (error) { if (!mayFallback(error)) throw error; return (await readFile()).map(normalize); }
  }

  async function revoke(id) {
    let done;
    try { done = (await database.query('update public.api_clients set revoked_at=now() where id=$1 and revoked_at is null', [id])).rowCount > 0; }
    catch (error) {
      if (!mayFallback(error)) throw error;
      const rows = await readFile(), row = rows.find(r => r.id === id && !r.revoked_at);
      done = !!row;
      if (row) { row.revoked_at = new Date().toISOString(); await writeFile(rows); }
    }
    forget(id);
    return done;
  }

  // Permanent deletion, only for revoked keys (revoke first, so no partner breaks by accident).
  // The access log keeps the client ID.
  async function remove(id) {
    try { return (await database.query('delete from public.api_clients where id=$1 and revoked_at is not null', [id])).rowCount > 0; }
    catch (error) {
      if (!mayFallback(error)) throw error;
      const rows = await readFile(), rest = rows.filter(r => !(r.id === id && r.revoked_at));
      if (rest.length === rows.length) return false;
      await writeFile(rest);
      return true;
    }
  }

  // Bookkeeping never fails or delays a request.
  function touch(client) {
    if ((touched.get(client.id) || 0) > Date.now() - 60000) return;
    touched.set(client.id, Date.now());
    Promise.resolve().then(() => database.query('update public.api_clients set last_used_at=now() where id=$1', [client.id])).catch(() => {});
  }
  // Access log without personal data: who read which contact and facets, with what result.
  function log(entry) {
    Promise.resolve().then(() => database.query('insert into public.api_access_log (client_id, request_id, method, route, contact_id, facets, status, duration_ms) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [entry.client_id || null, entry.request_id, entry.method, entry.route, entry.contact_id || null, entry.facets || [], entry.status, entry.duration_ms]))
      .catch(error => { if (!mayFallback(error)) console.warn('[partner-api] access log not written:', error.message); });
  }

  return { authenticate, get, create, update, rotate, list, revoke, remove, touch, log };
}

let instance;
const getClientStore = () => instance || (instance = createClientStore());

module.exports = { createClientStore, getClientStore, validateClientInput, hashKey, generateKey };
