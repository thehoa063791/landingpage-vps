// The public address of the site, in one place (roadmap 4.1, before the move to phamthanhbien.com).
//   SITE_URL      the canonical origin; links, Zoom join pages, partner API links, og:/canonical tags.
//                 Default https://event.phamthanhbien.com. PUBLIC_BASE_URL stays the address of
//                 uploaded files (src/db.js), which is http://localhost locally.
//   LEGACY_HOSTS  hosts that answer GET/HEAD with a 301 to SITE_URL, same path and query
//                 (e.g. event.phamthanhbien.com after the move). Empty: no redirect.
// API calls (/api/...) and other methods are served on every host, so webhooks, payment
// callbacks and partners keep working on the old address.
const DEFAULT_SITE_URL = 'https://event.phamthanhbien.com';
const SITE_URL = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
const SITE_HOST = new URL(SITE_URL).host.toLowerCase();
const hosts = value => String(value || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
const LEGACY_HOSTS = hosts(process.env.LEGACY_HOSTS).filter(h => h !== SITE_HOST);
const hostOf = url => { try { return new URL(url).host.toLowerCase(); } catch { return ''; } };
// Every host that is this site, for "is this link ours?" (redirect targets, stored media URLs).
const OWN_HOSTS = [...new Set([SITE_HOST, hostOf(process.env.PUBLIC_BASE_URL), ...LEGACY_HOSTS, ...hosts('phamthanhbien.com,www.phamthanhbien.com,event.phamthanhbien.com')].filter(Boolean))];

const absoluteUrl = path => `${SITE_URL}${String(path || '').startsWith('/') ? '' : '/'}${path || ''}`;

// "/storage/x.jpg" for an address of this site (on any of its hosts), else the address unchanged.
function localPath(url) {
  const value = String(url || '');
  const match = /^https?:\/\/([^/?#]+)(\/[^]*)?$/i.exec(value);
  return match && OWN_HOSTS.includes(match[1].toLowerCase()) ? (match[2] || '/') : value;
}

// Static pages carry the address they were written with; served with the current one.
const withSiteUrl = html => SITE_URL === DEFAULT_SITE_URL ? html : html.split(DEFAULT_SITE_URL).join(SITE_URL);

function legacyRedirect({ legacy = LEGACY_HOSTS, siteUrl = SITE_URL } = {}) {
  return (req, res, next) => {
    const host = String(req.headers.host || '').toLowerCase().split(':')[0];
    if (!legacy.includes(host) || !['GET', 'HEAD'].includes(req.method) || req.path.startsWith('/api/')) return next();
    res.redirect(301, `${siteUrl}${req.originalUrl}`);
  };
}

module.exports = { SITE_URL, SITE_HOST, LEGACY_HOSTS, OWN_HOSTS, DEFAULT_SITE_URL, absoluteUrl, localPath, withSiteUrl, legacyRedirect };
