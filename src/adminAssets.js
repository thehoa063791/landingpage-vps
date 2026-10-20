// Admin shell bundle (public/admin/react-shell.js ~0.9 MB, .css): served gzip-compressed
// (nginx does not compress it) and, when the URL carries the ?v= release stamp that
// public/admin.html uses, cached by browsers for a year. Compressed bytes are kept in
// memory per file version (mtime + size), so each release compresses once.
const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const ROOT = path.join(__dirname, '..', 'public', 'admin');
const TYPES = { '.js': 'application/javascript; charset=UTF-8', '.css': 'text/css; charset=UTF-8' };
const cache = new Map();

function adminAssets() {
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const type = TYPES[path.extname(req.path)];
    if (!type || !/^\/admin\/[\w.-]+$/.test(req.path)) return next();
    const file = path.join(ROOT, path.basename(req.path));
    let stat;
    try { stat = await fs.stat(file); } catch { return next(); }
    if (!stat.isFile()) return next();
    const version = `${stat.mtimeMs}-${stat.size}`;
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    res.setHeader('Content-Type', type);
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) return res.sendFile(file, { headers: { 'Cache-Control': res.getHeader('Cache-Control') }, lastModified: false, etag: false });
    try {
      let entry = cache.get(file);
      if (!entry || entry.version !== version) {
        entry = { version, body: await gzip(await fs.readFile(file), { level: 9 }) };
        cache.set(file, entry);
      }
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', entry.body.length);
      return req.method === 'HEAD' ? res.end() : res.end(entry.body);
    } catch (error) {
      console.warn('[adminAssets] serving uncompressed:', error.message);
      return next();
    }
  };
}

// Logs admin API calls slower than `limit` ms: path only (queries can carry search terms).
function slowAdminRequests(limit = 1000) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      if (ms >= limit) console.warn(`[slow-admin] ${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${Math.round(ms)}ms`);
    });
    next();
  };
}

module.exports = { adminAssets, slowAdminRequests };
