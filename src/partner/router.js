// Partner API v1, mounted at /api/partner/v1 (docs/PARTNER_API.md). Read-only, server to
// server: a partner key (Authorization: Bearer ptb_...) grants scopes per facet and course.
// v1 only ever adds fields; partners ignore fields they do not know.
const express = require('express');
const crypto = require('crypto');
const storage = require('../storage');
const { extractClientIp } = require('../utils');
const { createContactIndex, isEmail, phoneKey } = require('./contacts');
const { createFacets, scopeDescriptions } = require('./facets');
const { getClientStore } = require('./clients');

const VERSION = '1.0';
const localSecret = crypto.randomBytes(32).toString('hex');
const apiError = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });
const meta = req => ({ api_version: VERSION, request_id: req.partner?.request_id || '', generated_at: new Date().toISOString() });
const encodeCursor = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function decodeCursor(raw, facet) {
  try {
    const value = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (value.f === facet && typeof value.at === 'string' && Number.isFinite(new Date(value.at).getTime()) && typeof value.course === 'string' && typeof value.key === 'string') return value;
  } catch {}
  throw apiError(400, 'invalid_cursor', 'Cursor không hợp lệ.');
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  // Malformed JSON bodies come from express.json before the router runs.
  if (error.type === 'entity.parse.failed') error = apiError(400, 'invalid_json', 'Body không phải JSON hợp lệ.');
  else if (error.type === 'entity.too.large') error = apiError(413, 'payload_too_large', 'Body quá lớn.');
  if (!error.code || !error.status) { console.error('[partner-api]', error); error = apiError(500, 'internal_error', 'Lỗi hệ thống. Vui lòng thử lại sau.'); }
  // Errors raised before the router (malformed JSON) still get a request ID.
  if (!req.partner) { req.partner = { request_id: crypto.randomUUID() }; res.setHeader('X-Request-Id', req.partner.request_id); }
  res.setHeader('Cache-Control', 'no-store');
  res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }, meta: meta(req) });
}

function createRouter({ clients = getClientStore(), crm = storage, facets = createFacets(), secret = process.env.PARTNER_ID_SECRET || (process.env.NODE_ENV !== 'production' ? localSecret : '') } = {}) {
  const router = express.Router();
  const contacts = secret ? createContactIndex({ secret }) : null;
  const buckets = new Map();
  const run = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const step = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).then(() => next(), next);

  router.use((req, res, next) => {
    req.partner = { request_id: crypto.randomUUID(), started: Date.now(), facets: [] };
    res.setHeader('X-Request-Id', req.partner.request_id);
    res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () => clients.log({ client_id: req.partner.client?.id, request_id: req.partner.request_id, method: req.method, route: req.route?.path || req.path.slice(0, 200), contact_id: req.partner.contact_id, facets: req.partner.facets, status: res.statusCode, duration_ms: Date.now() - req.partner.started }));
    next();
  });

  router.use(step(async (req, res) => {
    const key = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''))?.[1];
    if (!key) throw apiError(401, 'unauthorized', 'Thiếu khóa API (Authorization: Bearer ...).');
    const client = await clients.authenticate(key);
    if (!client) throw apiError(401, 'invalid_api_key', 'Khóa API không hợp lệ hoặc đã bị thu hồi.');
    if (client.ip_allowlist.length && !client.ip_allowlist.includes(extractClientIp(req))) throw apiError(403, 'ip_not_allowed', 'Địa chỉ IP này không được phép dùng khóa API.');
    // Fixed one-minute window per key; a single PM2 process serves the API.
    const now = Date.now(), limit = client.rate_limit_per_minute;
    let bucket = buckets.get(client.id);
    if (!bucket || bucket.until <= now) buckets.set(client.id, bucket = { until: now + 60000, count: 0 });
    bucket.count++;
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    req.partner.client = client;
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.until - now) / 1000)));
      throw apiError(429, 'rate_limited', 'Vượt giới hạn số lượt gọi mỗi phút.');
    }
    clients.touch(client);
    if (!contacts) throw apiError(503, 'not_configured', 'API đối tác chưa được cấu hình (PARTNER_ID_SECRET).');
  }));

  const requireScope = (client, scope) => { if (!client.scopes.includes(scope)) throw apiError(403, 'scope_denied', `Khóa API chưa được cấp quyền ${scope}.`, { scope }); };
  // `include` names facets and their optional parts (learning, learning.lessons), plus
  // identities.all (every email/phone of the contact). Without it, every top-level facet the
  // key may read is returned; optional parts are opt-in.
  const CORE_INCLUDES = { 'identities.all': 'contact:basic' };
  function includes(raw, client) {
    const values = (Array.isArray(raw) ? raw : String(raw ?? '').split(',')).map(v => String(v).trim()).filter(Boolean);
    if (!values.length) return new Set(Object.values(facets).filter(f => client.scopes.includes(f.scope)).map(f => f.name));
    const known = [...Object.keys(CORE_INCLUDES), ...Object.values(facets).flatMap(f => f.includes)];
    for (const value of values) {
      if (!known.includes(value)) throw apiError(400, 'invalid_include', `Giá trị include không hỗ trợ: ${value}.`, { allowed: known });
      requireScope(client, CORE_INCLUDES[value] || facets[value.split('.')[0]].scope);
    }
    return new Set(values.flatMap(value => [value, value.split('.')[0]]));
  }
  // `match` (lookup) picks the email/phone shown by default: the one the partner searched by.
  async function present(req, contact, include, match = null) {
    const client = req.partner.client;
    req.partner.contact_id = contact.contact_id;
    const funnels = [];
    for (const row of contact.registrations) if (!funnels.some(f => f.page_id === row.page_id)) funnels.push({ page_id: row.page_id, registered_at: row.registered_at || null });
    const data = {
      contact_id: contact.contact_id,
      name: contact.name,
      identities: identities(contact, client, include.has('identities.all'), match),
      funnels,
      first_registered_at: contact.registrations[0]?.registered_at || null,
    };
    for (const facet of Object.values(facets)) {
      if (!include.has(facet.name)) continue;
      req.partner.facets.push(facet.name);
      data[facet.name] = await facet.load(contact, { client, include });
    }
    return data;
  }
  // One email (and phone, with contact:phone) by default; every one with identities.all.
  // `emails`/`phones` stay arrays for compatibility.
  function identities(contact, client, all, match) {
    const email = match?.by === 'email' ? match.value : contact.latest_email;
    const phone = match?.by === 'phone' ? match.value : contact.latest_phone;
    return {
      email: email || null,
      emails: all ? contact.emails : email ? [email] : [],
      ...(client.scopes.includes('contact:phone') ? { phone: phone || null, phones: all ? contact.phones : phone ? [phone] : [] } : {}),
    };
  }
  const send = (req, res, data, extra = {}) => res.json({ data, meta: { ...meta(req), ...extra } });

  router.get('/capabilities', run(async (req, res) => {
    const client = req.partner.client, scopes = scopeDescriptions(facets);
    send(req, res, {
      client: { id: client.id, name: client.name, key_prefix: client.key_prefix },
      scopes: client.scopes.map(scope => ({ scope, description: scopes[scope] || '' })),
      facets: Object.values(facets).map(f => ({ name: f.name, scope: f.scope, description: f.description, granted: client.scopes.includes(f.scope), includes: f.includes, ...(f.courses ? { courses: f.courses(client) } : {}), change_feed: !!f.changes })),
      rate_limit_per_minute: client.rate_limit_per_minute,
    });
  }));

  // Email and phone travel in the body, so they never reach access logs.
  router.post('/contacts/lookup', run(async (req, res) => {
    const client = req.partner.client, body = req.body && typeof req.body === 'object' ? req.body : {};
    requireScope(client, 'contact:basic');
    const email = String(body.email ?? '').trim(), phone = String(body.phone ?? '').trim();
    if (!email && !phone) throw apiError(400, 'invalid_request', 'Cần email hoặc phone.');
    if (email && !isEmail(email)) throw apiError(400, 'invalid_request', 'Email không hợp lệ.', { field: 'email' });
    if (phone && !phoneKey(phone)) throw apiError(400, 'invalid_request', 'Số điện thoại không hợp lệ.', { field: 'phone' });
    const include = includes(body.include, client);
    const found = contacts.lookup(await crm.getRegistrations(), { email, phone });
    if (!found) throw apiError(404, 'contact_not_found', 'Không tìm thấy khách hàng.');
    // other_contacts > 0: the phone also belongs to other people; ask for the email to be sure.
    send(req, res, await present(req, found.contact, include, found.match), { match: { by: found.match.by, other_contacts: found.match.other_contacts } });
  }));

  router.get('/contacts/:contact_id', run(async (req, res) => {
    const client = req.partner.client;
    requireScope(client, 'contact:basic');
    const include = includes(req.query.include, client);
    const contact = /^ct_[A-Za-z0-9_-]{22}$/.test(req.params.contact_id) ? contacts.byId(await crm.getRegistrations(), req.params.contact_id) : null;
    if (!contact) throw apiError(404, 'contact_not_found', 'Không tìm thấy khách hàng.');
    send(req, res, await present(req, contact, include));
  }));

  // Contacts whose facet data changed, oldest first. Keep `next_cursor` and pass it back;
  // the first sync starts from `since` (ISO time) or from the beginning.
  router.get('/changes', run(async (req, res) => {
    const client = req.partner.client, name = String(req.query.facet || 'learning');
    const facet = facets[name];
    if (!facet?.changes) throw apiError(400, 'invalid_request', 'facet không hỗ trợ change feed.', { allowed: Object.values(facets).filter(f => f.changes).map(f => f.name) });
    requireScope(client, 'contact:basic');
    requireScope(client, facet.scope);
    const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw apiError(400, 'invalid_request', 'limit phải từ 1 đến 500.', { field: 'limit' });
    let after = null;
    if (req.query.cursor) after = decodeCursor(req.query.cursor, name);
    else if (req.query.since) {
      const since = new Date(String(req.query.since));
      if (!Number.isFinite(since.getTime())) throw apiError(400, 'invalid_request', 'since phải là thời gian ISO 8601.', { field: 'since' });
      after = { at: since.toISOString(), course: '', key: '' };
    }
    req.partner.facets.push(name);
    const rows = await facet.changes({ client, after, limit });
    const registrations = await crm.getRegistrations(), latest = new Map();
    for (const row of rows) {
      const contact = contacts.byRegistration(registrations, row.registration_id);
      if (!contact) continue;
      const key = `${contact.contact_id}:${row.cursor.course}`;
      latest.set(key, { contact_id: contact.contact_id, facet: name, course: row.cursor.course, changed_at: new Date(row.changed_at).toISOString() });
    }
    const last = rows.at(-1)?.cursor;
    send(req, res, [...latest.values()], { next_cursor: last ? encodeCursor({ f: name, ...last }) : (req.query.cursor || null), has_more: rows.length === limit });
  }));

  router.use((req, res, next) => next(apiError(404, 'not_found', 'Endpoint không tồn tại.')));
  router.use(errorHandler);
  return router;
}

module.exports = { createRouter, errorHandler, VERSION };
