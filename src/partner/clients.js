// Partner API keys (table api_clients). Only a SHA-256 hash of each key is stored; the key
// itself is shown once, when created. One partner may hold several keys (rotation: create
// the new key, switch, revoke the old one). Without PostgreSQL in development, keys live in
// data/api_clients.json.
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../db');

const hashKey = key => crypto.createHash('sha256').update(String(key)).digest('hex');
const generateKey = () => `ptb_${crypto.randomBytes(24).toString('base64url')}`;
const OFFLINE = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];

function normalize(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, key_prefix: row.key_prefix, key_hash: row.key_hash,
    scopes: [...(row.scopes || [])], courses: [...(row.courses || [])], ip_allowlist: [...(row.ip_allowlist || [])],
    rate_limit_per_minute: Number(row.rate_limit_per_minute || 60),
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    revoked_at: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    last_used_at: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
  };
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

  // Active client for a presented key, or null. Cached briefly: a revoked key stops
  // working within `cacheMs` in a running server.
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

  async function create({ name, scopes, courses = [], rate_limit_per_minute = 60, ip_allowlist = [] }) {
    const key = generateKey();
    const row = { id: crypto.randomUUID(), name: String(name).trim().slice(0, 200), key_prefix: key.slice(0, 12), key_hash: hashKey(key), scopes, courses, ip_allowlist, rate_limit_per_minute, created_at: new Date().toISOString(), revoked_at: null, last_used_at: null };
    try {
      await database.query('insert into public.api_clients (id, name, key_prefix, key_hash, scopes, courses, ip_allowlist, rate_limit_per_minute) values ($1,$2,$3,$4,$5,$6,$7,$8)', [row.id, row.name, row.key_prefix, row.key_hash, scopes, courses, ip_allowlist, rate_limit_per_minute]);
    } catch (error) {
      if (!mayFallback(error)) throw error;
      await writeFile([...await readFile(), row]);
    }
    return { client: normalize(row), key };
  }

  async function list() {
    try { return (await database.query('select * from public.api_clients order by created_at')).rows.map(normalize); }
    catch (error) { if (!mayFallback(error)) throw error; return (await readFile()).map(normalize); }
  }

  async function revoke(id) {
    try { return (await database.query('update public.api_clients set revoked_at=now() where id=$1 and revoked_at is null', [id])).rowCount > 0; }
    catch (error) {
      if (!mayFallback(error)) throw error;
      const rows = await readFile(), row = rows.find(r => r.id === id && !r.revoked_at);
      if (!row) return false;
      row.revoked_at = new Date().toISOString();
      await writeFile(rows);
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

  return { authenticate, create, list, revoke, touch, log };
}

let instance;
const getClientStore = () => instance || (instance = createClientStore());

module.exports = { createClientStore, getClientStore, hashKey, generateKey };
