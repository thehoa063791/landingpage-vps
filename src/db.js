// =============================================================================
// db.js — Postgres client with a Supabase-js compatible surface.
//
// The rest of the codebase (storage.js, routes/*.js) uses `supabase.from(...)`,
// `supabase.storage.from(...)`, `supabase.auth.*` and `supabase.rpc(...)`.
// This module exposes the same shape backed by node-postgres + local filesystem
// + bcrypt/JWT so nothing above it has to know we moved off Supabase.
//
// Only the subset of the supabase-js API that this project actually calls is
// implemented — filters (eq/neq/gt/gte/lt/lte/in/is/like/ilike/or/not),
// modifiers (order/limit/range/single/maybeSingle), mutations (insert/update/
// upsert/delete + optional trailing .select().single()), plus rpc(), a
// filesystem-backed storage bucket, and a minimal email/password auth layer.
// =============================================================================

require('dotenv').config();
const path   = require('path');
const fs     = require('fs-extra');
const crypto = require('crypto');
const { Pool } = require('pg');

let bcrypt;   try { bcrypt   = require('bcryptjs'); }         catch { bcrypt   = null; }
let jwt;      try { jwt      = require('jsonwebtoken'); }     catch { jwt      = null; }

// ── Pool ─────────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host:     process.env.PGHOST     || undefined,
  port:     process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user:     process.env.PGUSER     || undefined,
  password: process.env.PGPASSWORD || undefined,
  database: process.env.PGDATABASE || undefined,
  max:      Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => console.error('[db] pool error', err.message));

async function query(text, params) {
  return pool.query(text, params);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;

function pgError(err) {
  return { message: err.message, code: err.code || 'PG_ERROR', details: err.detail || null, hint: err.hint || null };
}

function parseSelectList(sel) {
  if (!sel || sel === '*') return '*';
  return String(sel).split(',').map(s => s.trim()).filter(Boolean).map(ident).join(', ');
}

// ── QueryBuilder ─────────────────────────────────────────────────────────────
class QueryBuilder {
  constructor(table) {
    this.table = table;
    this._op = 'select';           // select | insert | update | upsert | delete
    this._select = '*';
    this._filters = [];            // { kind, col?, val?, sql?, params? }
    this._orders = [];             // { col, asc }
    this._limit = null;
    this._offset = null;
    this._rangeFrom = null;
    this._rangeTo = null;
    this._single = false;
    this._maybeSingle = false;
    this._returnRows = false;      // true if .select() called after mutation
    this._returnCols = '*';
    this._countMode = null;        // null | 'exact'
    this._headOnly = false;
    this._writeRows = null;
    this._updateFields = null;
    this._upsertOnConflict = null;
  }

  // ── Read setup ─────────────────────────────────────────────────────────────
  select(cols = '*', opts = {}) {
    if (this._op === 'select') {
      this._select = cols;
      if (opts.count) this._countMode = opts.count;
      if (opts.head)  this._headOnly = true;
    } else {
      // called after insert/update/upsert/delete to return affected rows
      this._returnRows = true;
      this._returnCols = cols;
    }
    return this;
  }

  // ── Filters (return this) ─────────────────────────────────────────────────
  eq(col, val)  { this._filters.push({ kind: 'op', col, op: '=',  val }); return this; }
  neq(col, val) { this._filters.push({ kind: 'op', col, op: '<>', val }); return this; }
  gt(col, val)  { this._filters.push({ kind: 'op', col, op: '>',  val }); return this; }
  gte(col, val) { this._filters.push({ kind: 'op', col, op: '>=', val }); return this; }
  lt(col, val)  { this._filters.push({ kind: 'op', col, op: '<',  val }); return this; }
  lte(col, val) { this._filters.push({ kind: 'op', col, op: '<=', val }); return this; }
  like(col, val) { this._filters.push({ kind: 'op', col, op: 'LIKE',  val }); return this; }
  ilike(col, val) { this._filters.push({ kind: 'op', col, op: 'ILIKE', val }); return this; }
  in(col, arr)  { this._filters.push({ kind: 'in', col, arr: Array.isArray(arr) ? arr : [] }); return this; }
  is(col, val)  { this._filters.push({ kind: 'is', col, val }); return this; }
  not(col, op, val) { this._filters.push({ kind: 'not', col, op, val }); return this; }
  or(expr)      { this._filters.push({ kind: 'or', expr }); return this; }

  // ── Modifiers ─────────────────────────────────────────────────────────────
  order(col, opts = {}) { this._orders.push({ col, asc: opts.ascending !== false }); return this; }
  limit(n)   { this._limit = Number(n); return this; }
  range(from, to) { this._rangeFrom = Number(from); this._rangeTo = Number(to); return this; }
  single()      { this._single = true;      return this._runPromise(); }
  maybeSingle() { this._maybeSingle = true; return this._runPromise(); }

  // ── Mutations ─────────────────────────────────────────────────────────────
  insert(rows) { this._op = 'insert'; this._writeRows = Array.isArray(rows) ? rows : [rows]; return this; }
  update(fields) { this._op = 'update'; this._updateFields = fields; return this; }
  upsert(rows, opts = {}) {
    this._op = 'upsert';
    this._writeRows = Array.isArray(rows) ? rows : [rows];
    this._upsertOnConflict = opts.onConflict || null;
    return this;
  }
  delete() { this._op = 'delete'; return this; }

  // ── Thenable — awaiting the builder runs the query ────────────────────────
  then(onFulfilled, onRejected) {
    return this._runPromise().then(onFulfilled, onRejected);
  }
  catch(onRejected) { return this._runPromise().catch(onRejected); }

  async _runPromise() {
    try {
      if (this._op === 'select') return await this._runSelect();
      return await this._runMutation();
    } catch (err) {
      return { data: null, error: pgError(err), count: null };
    }
  }

  // ── Filter → SQL ──────────────────────────────────────────────────────────
  _buildWhere(startIndex = 1) {
    const parts = [];
    const params = [];
    let i = startIndex;
    for (const f of this._filters) {
      if (f.kind === 'op') {
        parts.push(`${ident(f.col)} ${f.op} $${i++}`); params.push(f.val);
      } else if (f.kind === 'in') {
        if (f.arr.length === 0) { parts.push('false'); continue; }
        const placeholders = f.arr.map(() => `$${i++}`).join(',');
        parts.push(`${ident(f.col)} IN (${placeholders})`);
        params.push(...f.arr);
      } else if (f.kind === 'is') {
        if (f.val === null) parts.push(`${ident(f.col)} IS NULL`);
        else if (f.val === true || f.val === false) parts.push(`${ident(f.col)} IS ${f.val ? 'TRUE' : 'FALSE'}`);
        else { parts.push(`${ident(f.col)} = $${i++}`); params.push(f.val); }
      } else if (f.kind === 'not') {
        parts.push(`NOT (${ident(f.col)} ${f.op} $${i++})`); params.push(f.val);
      } else if (f.kind === 'or') {
        // supabase syntax: "col.op.val,col.op.val"
        const alts = String(f.expr).split(',').map(s => s.trim()).filter(Boolean);
        const orParts = [];
        for (const alt of alts) {
          const m = alt.match(/^([^.]+)\.([a-z]+)\.(.*)$/i);
          if (!m) continue;
          const [, col, op, rawVal] = m;
          const sqlOp = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE' }[op.toLowerCase()];
          if (!sqlOp) continue;
          orParts.push(`${ident(col)} ${sqlOp} $${i++}`);
          params.push(rawVal);
        }
        if (orParts.length) parts.push(`(${orParts.join(' OR ')})`);
      }
    }
    return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
  }

  _buildOrderLimit(startIndex) {
    let sql = '';
    if (this._orders.length) {
      sql += ' ORDER BY ' + this._orders.map(o => `${ident(o.col)} ${o.asc ? 'ASC' : 'DESC'} NULLS LAST`).join(', ');
    }
    if (this._rangeFrom !== null && this._rangeTo !== null) {
      const limit = this._rangeTo - this._rangeFrom + 1;
      sql += ` LIMIT ${Math.max(0, limit)} OFFSET ${Math.max(0, this._rangeFrom)}`;
    } else if (this._limit !== null) {
      sql += ` LIMIT ${this._limit}`;
    }
    return sql;
  }

  async _runSelect() {
    const cols = parseSelectList(this._select);
    let count = null;
    if (this._countMode === 'exact') {
      const { sql: whereSql, params } = this._buildWhere();
      const q = `SELECT count(*)::bigint AS c FROM ${ident(this.table)} ${whereSql}`;
      const r = await pool.query(q, params);
      count = Number(r.rows[0]?.c || 0);
      if (this._headOnly) return { data: null, error: null, count };
    }
    const { sql: whereSql, params } = this._buildWhere();
    const orderLimit = this._buildOrderLimit(params.length + 1);
    const q = `SELECT ${cols} FROM ${ident(this.table)} ${whereSql} ${orderLimit}`.trim();
    const r = await pool.query(q, params);
    const rows = r.rows;
    if (this._single) {
      if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: rows.length ? 'Multiple rows' : 'No rows' }, count };
      return { data: rows[0], error: null, count };
    }
    if (this._maybeSingle) {
      if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'Multiple rows' }, count };
      return { data: rows[0] || null, error: null, count };
    }
    return { data: rows, error: null, count };
  }

  async _runMutation() {
    if (this._op === 'delete') return this._runDelete();
    if (this._op === 'update') return this._runUpdate();
    if (this._op === 'insert') return this._runInsertOrUpsert(false);
    if (this._op === 'upsert') return this._runInsertOrUpsert(true);
    throw new Error(`Unsupported op: ${this._op}`);
  }

  async _runInsertOrUpsert(isUpsert) {
    const rows = (this._writeRows || []).filter(r => r && typeof r === 'object');
    if (!rows.length) return { data: this._returnRows ? [] : null, error: null };
    // Union of columns across rows
    const colSet = new Set();
    for (const r of rows) for (const k of Object.keys(r)) colSet.add(k);
    const cols = Array.from(colSet);
    const params = [];
    const valueRows = rows.map(r => {
      const placeholders = cols.map(c => {
        params.push(serializeVal(r[c]));
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    let sql = `INSERT INTO ${ident(this.table)} (${cols.map(ident).join(', ')}) VALUES ${valueRows.join(', ')}`;
    if (isUpsert) {
      const conflictCols = (this._upsertOnConflict || 'id').split(',').map(s => s.trim()).map(ident).join(', ');
      const setSql = cols.filter(c => !this._upsertOnConflict?.includes(c))
        .map(c => `${ident(c)} = EXCLUDED.${ident(c)}`).join(', ');
      sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${setSql || `${ident(cols[0])} = EXCLUDED.${ident(cols[0])}`}`;
    }
    if (this._returnRows) sql += ` RETURNING ${parseSelectList(this._returnCols)}`;
    const r = await pool.query(sql, params);
    return this._shapeMutationResult(r.rows);
  }

  async _runUpdate() {
    const fields = this._updateFields || {};
    const cols = Object.keys(fields);
    if (!cols.length) return { data: null, error: null };
    const params = [];
    const setSql = cols.map(c => { params.push(serializeVal(fields[c])); return `${ident(c)} = $${params.length}`; }).join(', ');
    const { sql: whereSql, params: whereParams } = this._buildWhere(params.length + 1);
    params.push(...whereParams);
    let sql = `UPDATE ${ident(this.table)} SET ${setSql} ${whereSql}`;
    if (this._returnRows) sql += ` RETURNING ${parseSelectList(this._returnCols)}`;
    const r = await pool.query(sql, params);
    return this._shapeMutationResult(r.rows);
  }

  async _runDelete() {
    const { sql: whereSql, params } = this._buildWhere();
    let sql = `DELETE FROM ${ident(this.table)} ${whereSql}`;
    if (this._returnRows) sql += ` RETURNING ${parseSelectList(this._returnCols)}`;
    const r = await pool.query(sql, params);
    return this._shapeMutationResult(r.rows);
  }

  _shapeMutationResult(rows) {
    if (!this._returnRows) return { data: null, error: null };
    if (this._single) {
      if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: rows.length ? 'Multiple rows' : 'No rows' } };
      return { data: rows[0], error: null };
    }
    if (this._maybeSingle) {
      if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'Multiple rows' } };
      return { data: rows[0] || null, error: null };
    }
    return { data: rows, error: null };
  }
}

function serializeVal(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) return JSON.stringify(v);
  return v;
}

// ── Storage (filesystem-backed replacement for Supabase Storage) ─────────────
const STORAGE_ROOT   = path.resolve(process.env.STORAGE_ROOT || path.join(__dirname, '..', 'storage'));
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const STORAGE_PUBLIC_PATH = process.env.STORAGE_PUBLIC_PATH || '/storage';

fs.ensureDirSync(STORAGE_ROOT);

class StorageBucket {
  constructor(bucket) {
    this.bucket = bucket;
    this.root   = path.join(STORAGE_ROOT, bucket);
    fs.ensureDirSync(this.root);
  }

  _abs(p) { return path.join(this.root, String(p || '')); }

  async list(prefix = '', opts = {}) {
    const dir = this._abs(prefix || '');
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const out = [];
      for (const e of entries) {
        const stat = await fs.stat(path.join(dir, e.name)).catch(() => null);
        out.push({
          name: e.name,
          id: e.isDirectory() ? null : `${prefix ? prefix + '/' : ''}${e.name}`,
          updated_at: stat?.mtime?.toISOString(),
          created_at: stat?.birthtime?.toISOString() || stat?.mtime?.toISOString(),
          metadata: e.isDirectory() ? null : { size: stat?.size || 0 },
        });
      }
      const limit = Number(opts.limit || 100);
      const sortBy = opts.sortBy?.column;
      if (sortBy === 'created_at') {
        out.sort((a, b) => (opts.sortBy?.order === 'desc' ? -1 : 1) * String(a.created_at || '').localeCompare(String(b.created_at || '')));
      }
      return { data: out.slice(0, limit), error: null };
    } catch (err) {
      if (err.code === 'ENOENT') return { data: [], error: null };
      return { data: null, error: pgError(err) };
    }
  }

  async upload(objectPath, body, opts = {}) {
    try {
      const abs = this._abs(objectPath);
      await fs.ensureDir(path.dirname(abs));
      if (!opts.upsert && await fs.pathExists(abs)) {
        return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
      }
      const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
      await fs.writeFile(abs, data);
      return { data: { path: objectPath }, error: null };
    } catch (err) {
      return { data: null, error: pgError(err) };
    }
  }

  async remove(paths) {
    try {
      for (const p of paths) await fs.remove(this._abs(p)).catch(() => {});
      return { data: paths.map(p => ({ name: p })), error: null };
    } catch (err) {
      return { data: null, error: pgError(err) };
    }
  }

  getPublicUrl(objectPath) {
    const rel = `${STORAGE_PUBLIC_PATH}/${this.bucket}/${String(objectPath || '').replace(/^\/+/, '')}`;
    const publicUrl = PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}${rel}` : rel;
    return { data: { publicUrl } };
  }

  async download(objectPath) {
    try {
      const buf = await fs.readFile(this._abs(objectPath));
      return { data: buf, error: null };
    } catch (err) {
      return { data: null, error: pgError(err) };
    }
  }
}

const storage = {
  from(bucket) { return new StorageBucket(bucket); },
};

// ── Auth (bcrypt + JWT) ──────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_COOKIE_SECRET || 'change-me-please-32bytes-minimum-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

async function _hashPassword(pw) {
  if (!bcrypt) throw new Error('bcryptjs is not installed');
  return bcrypt.hash(String(pw), 10);
}
async function _verifyPassword(pw, hash) {
  if (!bcrypt) throw new Error('bcryptjs is not installed');
  return bcrypt.compare(String(pw), String(hash));
}
function _sign(user) {
  if (!jwt) throw new Error('jsonwebtoken is not installed');
  return jwt.sign(
    { sub: user.id, email: user.email, role: 'authenticated' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function _findUserByEmail(email) {
  const r = await pool.query('SELECT * FROM auth_users WHERE lower(email) = lower($1) LIMIT 1', [email]);
  return r.rows[0] || null;
}

const auth = {
  async getUser(token) {
    try {
      if (!jwt) throw new Error('jsonwebtoken is not installed');
      const payload = jwt.verify(token, JWT_SECRET);
      const r = await pool.query('SELECT id, email, email_confirmed_at, raw_user_meta_data, created_at, last_sign_in_at FROM auth_users WHERE id = $1', [payload.sub]);
      const u = r.rows[0];
      if (!u) return { data: { user: null }, error: { message: 'User not found' } };
      return { data: { user: u }, error: null };
    } catch (err) {
      return { data: { user: null }, error: pgError(err) };
    }
  },

  async signInWithPassword({ email, password }) {
    try {
      const u = await _findUserByEmail(email);
      if (!u) return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } };
      const ok = await _verifyPassword(password, u.password_hash);
      if (!ok) return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } };
      await pool.query('UPDATE auth_users SET last_sign_in_at = now() WHERE id = $1', [u.id]);
      const access_token = _sign(u);
      return {
        data: {
          user: { id: u.id, email: u.email, email_confirmed_at: u.email_confirmed_at, raw_user_meta_data: u.raw_user_meta_data },
          session: { access_token, token_type: 'bearer', expires_in: 60 * 60 * 12 },
        },
        error: null,
      };
    } catch (err) {
      return { data: { session: null, user: null }, error: pgError(err) };
    }
  },

  async signOut() { return { error: null }; },

  // Issues a session for a user already verified by an external provider
  // (e.g. Google OAuth) — skips password comparison.
  async issueSession(user) {
    try {
      await pool.query('UPDATE auth_users SET last_sign_in_at = now() WHERE id = $1', [user.id]);
      const access_token = _sign(user);
      return {
        data: {
          user: { id: user.id, email: user.email, email_confirmed_at: user.email_confirmed_at, raw_user_meta_data: user.raw_user_meta_data },
          session: { access_token, token_type: 'bearer', expires_in: 60 * 60 * 12 },
        },
        error: null,
      };
    } catch (err) {
      return { data: { session: null, user: null }, error: pgError(err) };
    }
  },

  admin: {
    async listUsers({ page = 1, perPage = 1000 } = {}) {
      try {
        const offset = (Number(page) - 1) * Number(perPage);
        const r = await pool.query(
          'SELECT id, email, email_confirmed_at, raw_user_meta_data, created_at, last_sign_in_at FROM auth_users ORDER BY created_at ASC LIMIT $1 OFFSET $2',
          [perPage, offset]
        );
        return { data: { users: r.rows }, error: null };
      } catch (err) {
        return { data: { users: [] }, error: pgError(err) };
      }
    },

    async createUser({ email, password, email_confirm = false, user_metadata = {} } = {}) {
      try {
        const existing = await _findUserByEmail(email);
        if (existing) return { data: { user: existing }, error: { message: 'Email already registered' } };
        const hash = await _hashPassword(password);
        const r = await pool.query(
          `INSERT INTO auth_users (email, password_hash, email_confirmed_at, raw_user_meta_data)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, email_confirmed_at, raw_user_meta_data, created_at`,
          [email, hash, email_confirm ? new Date() : null, user_metadata || {}]
        );
        return { data: { user: r.rows[0] }, error: null };
      } catch (err) {
        return { data: { user: null }, error: pgError(err) };
      }
    },

    async deleteUser(id) {
      try {
        await pool.query('DELETE FROM auth_users WHERE id = $1', [id]);
        return { data: {}, error: null };
      } catch (err) {
        return { data: null, error: pgError(err) };
      }
    },

    async updateUserById(id, attrs = {}) {
      try {
        const sets = [];
        const params = [];
        let i = 1;
        if (attrs.email) { sets.push(`email = $${i++}`); params.push(attrs.email); }
        if (attrs.password) { sets.push(`password_hash = $${i++}`); params.push(await _hashPassword(attrs.password)); }
        if (attrs.email_confirm) { sets.push(`email_confirmed_at = now()`); }
        if (attrs.user_metadata) { sets.push(`raw_user_meta_data = $${i++}`); params.push(attrs.user_metadata); }
        if (!sets.length) return { data: null, error: null };
        params.push(id);
        const r = await pool.query(
          `UPDATE auth_users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, email, email_confirmed_at, raw_user_meta_data`,
          params
        );
        return { data: { user: r.rows[0] || null }, error: null };
      } catch (err) {
        return { data: null, error: pgError(err) };
      }
    },
  },
};

// ── RPC ──────────────────────────────────────────────────────────────────────
async function rpc(name, params = {}) {
  try {
    const keys = Object.keys(params);
    const args = keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ');
    const vals = keys.map(k => params[k]);
    const sql = `SELECT public.${ident(name)}(${args}) AS result`;
    const r = await pool.query(sql, vals);
    return { data: r.rows[0]?.result ?? null, error: null };
  } catch (err) {
    return { data: null, error: pgError(err) };
  }
}

// ── Top-level supabase-like object ───────────────────────────────────────────
const supabase = {
  from(table) { return new QueryBuilder(table); },
  storage,
  auth,
  rpc,
};

module.exports = { supabase, pool, query };
