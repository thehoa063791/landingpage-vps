// Short links and old URLs (table redirects), managed in Admin > Redirect. The middleware runs
// after every page route, so a system page always wins over a redirect with the same path.
// Rules live in memory and reload after each change (and every minute, for changes made by
// scripts); hits are counted in memory and written in batches. Without PostgreSQL in
// development, rules live in data/redirects.json.
const fs = require('fs/promises');
const path = require('path');
const { pool } = require('./db');

const OFFLINE = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
const CODES = [301, 302, 307, 308];
const QUERY_MODES = ['pass', 'ignore'];
// Links to these hosts become relative paths, so they keep working on any of our domains.
const OWN_HOSTS = process.env.REDIRECT_OWN_HOSTS ? process.env.REDIRECT_OWN_HOSTS.split(',').map(h => h.trim().toLowerCase()).filter(Boolean) : require('./site').OWN_HOSTS;
// Served by the Next.js learning app or by the system itself, never by a redirect.
const RESERVED_PREFIXES = ['/admin', '/api', '/ads', '/p', '/storage', '/_next', '/dong-tien', '/trading', '/js', '/css'];
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });

// What requests are matched on: lowercase path, no query, no trailing slash.
function sourceKey(value) {
  let p = String(value || '').trim().split(/[?#]/)[0];
  try { p = decodeURI(p); } catch { /* keep as typed */ }
  p = ('/' + p.replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
  return p.toLowerCase();
}

// Relative paths get a leading slash; absolute links to our own hosts become relative.
function normalizeTarget(value) {
  const target = String(value || '').trim();
  if (!target) return '';
  if (/^https?:\/\//i.test(target)) {
    try {
      const url = new URL(target);
      if (OWN_HOSTS.includes(url.hostname.toLowerCase())) return `${url.pathname}${url.search}${url.hash}` || '/';
    } catch { return target; }
    return target;
  }
  return target.startsWith('/') ? target : `/${target}`;
}

// Paths that belong to the system: page routes, the learning app and system prefixes.
function systemPath(key, pagesRouter = require('./routes/pages')) {
  if (RESERVED_PREFIXES.some(prefix => key === prefix || key.startsWith(prefix + '/'))) return true;
  return pagesRouter.stack.some(layer => layer.route && layer.route.methods.get && layer.match(key));
}

function validateInput(input, { partial = false } = {}) {
  const out = {};
  if (!partial || input.source !== undefined) {
    const source = String(input.source ?? '').trim();
    if (!source.startsWith('/') || source.length > 500 || /[\s?#]/.test(source)) throw invalid('Đường dẫn nguồn phải bắt đầu bằng "/", không có dấu cách hay tham số (?...).');
    out.source = source;
  }
  if (!partial || input.target !== undefined) {
    out.target = normalizeTarget(input.target);
    if (!out.target || out.target.length > 2000 || /\s/.test(out.target)) throw invalid('Nhập đường dẫn đích: một link đầy đủ (https://...) hoặc một đường dẫn bắt đầu bằng "/".');
  }
  if (!partial || input.code !== undefined) {
    out.code = input.code === undefined || input.code === '' ? 301 : Number(input.code);
    if (!CODES.includes(out.code)) throw invalid(`Mã chuyển hướng phải là ${CODES.join(', ')}.`);
  }
  if (!partial || input.query_mode !== undefined) {
    out.query_mode = input.query_mode || 'pass';
    if (!QUERY_MODES.includes(out.query_mode)) throw invalid('Cách xử lý tham số không hợp lệ.');
  }
  if (!partial || input.enabled !== undefined) out.enabled = input.enabled === undefined ? true : input.enabled === true;
  for (const field of ['group_name', 'title', 'note']) {
    if (!partial || input[field] !== undefined) {
      out[field] = String(input[field] ?? '').trim();
      if (out[field].length > 500) throw invalid('Tên nhóm, tiêu đề và ghi chú tối đa 500 ký tự.');
    }
  }
  if (out.source && out.target && !/^https?:\/\//i.test(out.target) && sourceKey(out.target) === sourceKey(out.source)) throw invalid('Đích trùng với nguồn: link sẽ chuyển vòng mãi.');
  return out;
}

function normalize(row) {
  if (!row) return null;
  const iso = value => value ? new Date(value).toISOString() : null;
  return {
    id: Number(row.id), source: row.source, source_key: row.source_key, target: row.target, code: Number(row.code),
    query_mode: row.query_mode, enabled: row.enabled !== false, position: Number(row.position || 0),
    group_name: row.group_name || '', title: row.title || '', note: row.note || '',
    hits: Number(row.hits || 0), last_access_at: iso(row.last_access_at), wp_id: row.wp_id == null ? null : Number(row.wp_id),
    created_by: row.created_by || null, updated_by: row.updated_by || null, created_at: iso(row.created_at), updated_at: iso(row.updated_at),
  };
}

const FIELDS = ['source', 'source_key', 'target', 'code', 'query_mode', 'enabled', 'position', 'group_name', 'title', 'note', 'hits', 'last_access_at', 'wp_id'];

function createRedirectStore({ database = pool, directory = path.join(__dirname, '..', 'data'), fallback = process.env.NODE_ENV !== 'production', reloadMs = 60000, flushMs = 15000, isSystemPath = systemPath } = {}) {
  const file = path.join(directory, 'redirects.json');
  const mayFallback = error => fallback && OFFLINE.includes(error.code);
  let rules = null, loadedAt = 0, loading = null;
  const pending = new Map(); // id -> hits not yet written
  let lastHit = new Map();

  async function readFile() {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async function writeFile(rows) {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(file, JSON.stringify(rows, null, 2));
  }
  async function query(sql, params, offline) {
    try { return await database.query(sql, params); }
    catch (error) { if (!mayFallback(error)) throw error; return offline(await readFile()); }
  }

  async function list() {
    const { rows } = await query('select * from public.redirects order by position, id', [], all => ({ rows: [...all].sort((a, b) => a.position - b.position || a.id - b.id) }));
    return rows.map(normalize);
  }
  async function get(id) {
    const { rows } = await query('select * from public.redirects where id=$1', [id], all => ({ rows: all.filter(r => Number(r.id) === Number(id)) }));
    return normalize(rows[0]);
  }

  // One enabled rule per path: a new rule may not hide or duplicate another one.
  async function checkFree(values, exceptId) {
    if (values.enabled === false) return;
    const key = sourceKey(values.source);
    if (isSystemPath(key)) throw invalid(`${values.source} đang là trang của hệ thống, redirect sẽ không có tác dụng. Chọn đường dẫn khác.`, 409);
    const other = (await list()).find(r => r.enabled && r.source_key === key && r.id !== Number(exceptId));
    if (other) throw invalid(`Đã có redirect đang bật cho ${other.source} (đến ${other.target}). Sửa redirect đó hoặc tắt nó trước.`, 409);
  }

  async function create(input, { by = null } = {}) {
    await checkFree(input);
    const row = { ...input, source_key: sourceKey(input.source), position: 0, hits: 0, last_access_at: null, wp_id: null };
    const { rows } = await query(
      `insert into public.redirects (source, source_key, target, code, query_mode, enabled, position, group_name, title, note, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,(select coalesce(max(position),0)+1 from public.redirects),$7,$8,$9,$10,$10) returning *`,
      [row.source, row.source_key, row.target, row.code, row.query_mode, row.enabled, row.group_name, row.title, row.note, by],
      async all => {
        const created = { ...row, id: Math.max(0, ...all.map(r => Number(r.id))) + 1, position: Math.max(0, ...all.map(r => r.position)) + 1, created_by: by, updated_by: by, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        await writeFile([...all, created]);
        return { rows: [created] };
      });
    invalidate();
    return normalize(rows[0]);
  }

  async function update(id, patch, { by = null } = {}) {
    const current = await get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    // Imported duplicates stay editable: only a new path or switching a rule on is checked.
    if (sourceKey(next.source) !== current.source_key || (next.enabled && !current.enabled)) await checkFree(next, id);
    if (!/^https?:\/\//i.test(next.target) && sourceKey(next.target) === sourceKey(next.source)) throw invalid('Đích trùng với nguồn: link sẽ chuyển vòng mãi.');
    if (patch.source !== undefined) patch = { ...patch, source_key: sourceKey(patch.source) };
    const fields = Object.keys(patch).filter(f => FIELDS.includes(f));
    const { rows } = await query(
      `update public.redirects set ${[...fields.map((f, i) => `${f}=$${i + 3}`), 'updated_by=$2', 'updated_at=now()'].join(', ')} where id=$1 returning *`,
      [id, by, ...fields.map(f => patch[f])],
      async all => {
        const row = all.find(r => Number(r.id) === Number(id));
        if (row) { for (const f of fields) row[f] = patch[f]; Object.assign(row, { updated_by: by, updated_at: new Date().toISOString() }); await writeFile(all); }
        return { rows: row ? [row] : [] };
      });
    invalidate();
    return normalize(rows[0]);
  }

  async function remove(id) {
    const { rowCount } = await query('delete from public.redirects where id=$1', [id], async all => {
      const rest = all.filter(r => Number(r.id) !== Number(id));
      if (rest.length !== all.length) await writeFile(rest);
      return { rowCount: all.length - rest.length };
    });
    invalidate();
    return rowCount > 0;
  }

  // Import (scripts/import-wp-redirects.cjs): rows with a wp_id are inserted or replaced by it,
  // keeping hits counted here since the previous import.
  async function importRows(rows) {
    const result = { inserted: 0, updated: 0 };
    try {
      const client = typeof database.connect === 'function' ? await database.connect() : database;
      try {
        if (client !== database) await client.query('begin');
        for (const row of rows) {
          const values = FIELDS.map(f => row[f] ?? (f === 'note' || f === 'group_name' || f === 'title' ? '' : null));
          const { rows: [saved] } = await client.query(
            `insert into public.redirects (${FIELDS.join(', ')}, created_by, updated_by) values (${FIELDS.map((_, i) => `$${i + 1}`).join(', ')}, 'import', 'import')
             on conflict (wp_id) do update set ${FIELDS.filter(f => !['hits', 'last_access_at', 'wp_id'].includes(f)).map(f => `${f}=excluded.${f}`).join(', ')},
               hits=greatest(public.redirects.hits, excluded.hits), last_access_at=greatest(public.redirects.last_access_at, excluded.last_access_at), updated_by='import', updated_at=now()
             returning (xmax = 0) as inserted`, values);
          result[saved.inserted ? 'inserted' : 'updated']++;
        }
        if (client !== database) await client.query('commit');
      } catch (error) {
        if (client !== database) await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        if (client !== database) client.release();
      }
    } catch (error) {
      if (!mayFallback(error)) throw error;
      const all = await readFile();
      for (const row of rows) {
        const existing = all.find(r => r.wp_id != null && r.wp_id === row.wp_id);
        if (existing) { Object.assign(existing, row, { hits: Math.max(existing.hits || 0, row.hits || 0) }); result.updated++; }
        else { all.push({ ...row, id: Math.max(0, ...all.map(r => Number(r.id))) + 1, created_by: 'import', created_at: new Date().toISOString() }); result.inserted++; }
      }
      await writeFile(all);
    }
    invalidate();
    return result;
  }

  // ── Serving ────────────────────────────────────────────────────────────────
  function invalidate() { loadedAt = 0; }
  async function activeRules() {
    if (rules && Date.now() - loadedAt < reloadMs) return rules;
    if (!loading) loading = list().then(all => {
      const map = new Map();
      for (const rule of all) if (rule.enabled && !map.has(rule.source_key)) map.set(rule.source_key, rule);
      rules = map; loadedAt = Date.now();
      return map;
    }).finally(() => { loading = null; });
    return loading;
  }

  function count(rule) {
    pending.set(rule.id, (pending.get(rule.id) || 0) + 1);
    lastHit.set(rule.id, new Date());
  }
  async function flush() {
    if (!pending.size) return;
    const batch = [...pending], at = lastHit;
    pending.clear(); lastHit = new Map();
    for (const [id, hits] of batch) {
      await query('update public.redirects set hits = hits + $2, last_access_at = $3 where id=$1', [id, hits, at.get(id)], async all => {
        const row = all.find(r => Number(r.id) === id);
        if (row) { row.hits = Number(row.hits || 0) + hits; row.last_access_at = at.get(id).toISOString(); await writeFile(all); }
        return { rowCount: row ? 1 : 0 };
      }).catch(error => console.warn('[redirects] hits not saved:', error.message));
    }
  }
  const timer = setInterval(() => { flush(); }, flushMs);
  timer.unref?.();

  function middleware() {
    return (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const key = sourceKey(req.path);
      activeRules().then(map => {
        const rule = map.get(key);
        if (!rule) return next();
        let location = rule.target;
        const search = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : '';
        if (rule.query_mode === 'pass' && search) {
          const [base, hash = ''] = location.split('#');
          location = `${base}${base.includes('?') ? '&' : '?'}${search}${hash ? `#${hash}` : ''}`;
        }
        count(rule);
        res.setHeader('Cache-Control', 'no-store');
        res.redirect(rule.code, location);
      }).catch(error => { console.warn('[redirects] rules unavailable:', error.message); next(); });
    };
  }

  return { list, get, create, update, remove, importRows, middleware, flush, invalidate, activeRules };
}

// ── WordPress Redirection plugin export ──────────────────────────────────────
// "22 Tháng 10, 2026" (the plugin's localized last access) as midnight in Vietnam.
function parseWpDate(value) {
  const m = /(\d{1,2})\s+Tháng\s+(\d{1,2}),\s*(\d{4})/i.exec(String(value || ''));
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]) - 7 * 3600e3).toISOString() : null;
}

// Rows for importRows from a Redirection JSON export, plus a report of every change made:
// a rule whose target is its own path (a link to this system) is disabled; a rule on a path
// the system now serves moves to the first free "<path>-2", "<path>-3"...
function planWordPressImport(exported, { isSystemPath = systemPath, targets = {}, extra = [] } = {}) {
  const groups = new Map((exported.groups || []).map(g => [g.id, g.name]));
  const report = { disabled: [], renamed: [], retargeted: [], skipped: [], extra: [] };
  const used = new Set();
  const rows = [];
  const items = [...(exported.redirects || [])].sort((a, b) => a.position - b.position || a.id - b.id);
  for (const item of items) used.add(sourceKey(item.match_url || item.url));
  for (const item of items) {
    if (item.action_type !== 'url' || item.match_type !== 'url' || item.regex) { report.skipped.push({ wp_id: item.id, source: item.url, reason: 'Kiểu redirect không hỗ trợ' }); continue; }
    let source = (item.match_url || item.url).replace(/\/+$/, '') || '/';
    let target = normalizeTarget(item.action_data?.url);
    const notes = [];
    let enabled = item.enabled !== false;
    const override = targets[sourceKey(source)];
    if (override) { report.retargeted.push({ wp_id: item.id, source, from: target, to: override }); notes.push(`Đổi đích từ ${target}`); target = override; }
    if (!/^https?:\/\//i.test(target) && sourceKey(target) === sourceKey(source)) {
      if (enabled) report.disabled.push({ wp_id: item.id, source, target });
      enabled = false;
      notes.push('Tắt khi nhập: đích là chính trang này trên hệ thống mới');
    } else if (isSystemPath(sourceKey(source))) {
      let n = 2, next;
      do next = `${source}-${n++}`; while (used.has(sourceKey(next)) || isSystemPath(sourceKey(next)));
      used.add(sourceKey(next));
      report.renamed.push({ wp_id: item.id, from: source, to: next, enabled });
      notes.push(`Đổi từ ${source} vì trùng trang của hệ thống`);
      source = next;
    }
    rows.push({
      source, source_key: sourceKey(source), target, code: CODES.includes(item.action_code) ? item.action_code : 301,
      query_mode: item.match_data?.source?.flag_query === 'pass' ? 'pass' : 'ignore', enabled, position: item.position,
      group_name: groups.get(item.group_id) || '', title: item.title || '', note: notes.join('. '),
      hits: Number(item.hits || 0), last_access_at: parseWpDate(item.last_access), wp_id: item.id,
    });
  }
  // Extra rules (e.g. old WordPress pages that are not kept) get negative wp_ids, so a
  // re-import replaces them too.
  let nextPosition = Math.max(0, ...rows.map(r => r.position)) + 1;
  extra.forEach((rule, i) => {
    const key = sourceKey(rule.source);
    if (used.has(key) || isSystemPath(key)) { report.skipped.push({ source: rule.source, reason: 'Đường dẫn đã có redirect hoặc là trang của hệ thống' }); return; }
    used.add(key);
    rows.push({ source: rule.source, source_key: key, target: normalizeTarget(rule.target), code: 301, query_mode: 'pass', enabled: true, position: nextPosition++,
      group_name: rule.group_name || '', title: rule.title || '', note: rule.note || '', hits: 0, last_access_at: null, wp_id: -(i + 1) });
    report.extra.push({ source: rule.source, target: rule.target });
  });
  return { rows, report };
}

let instance;
const getRedirectStore = () => instance || (instance = createRedirectStore());

module.exports = { createRedirectStore, getRedirectStore, validateInput, sourceKey, normalizeTarget, systemPath, planWordPressImport, parseWpDate, CODES, QUERY_MODES };
