// First touch / last touch (docs/attribution-plan.md, roadmap 1.1–1.2).
// A touch is where a visit came from: UTM, ad click IDs, landing path, referrer host, time.
// The server keeps two first-party cookies on .phamthanhbien.com (set by the server, so Safari
// does not cut them to 7 days as it does for cookies written by JavaScript):
//   ptb_ft  the first touch, written once, 12 months;
//   ptb_lt  the last non-direct touch (UTM, click ID or another site), the whole set
//           replaced each time, 90 days.
// A direct visit (no UTM, no click ID, no other site) never replaces the last touch.
// Touches hold no personal data. pages/dong-tien/src/lib/attribution.ts is the same logic
// for the course app's middleware.
const FT_COOKIE = 'ptb_ft';
const LT_COOKIE = 'ptb_lt';
const FT_SECONDS = 365 * 24 * 3600;
const LT_SECONDS = 90 * 24 * 3600;
const UTM = { utm_source: 'source', utm_medium: 'medium', utm_campaign: 'campaign', utm_content: 'content', utm_term: 'term' };
const CLICK_IDS = ['fbclid', 'gclid', 'wbraid', 'gbraid', 'ttclid', 'msclkid', 'twclid'];
const CLICK_SOURCE = { fbclid: 'facebook', gclid: 'google', wbraid: 'google', gbraid: 'google', ttclid: 'tiktok', msclkid: 'bing', twclid: 'twitter' };
const SEARCH = /(^|\.)(google|bing|coccoc|yahoo|duckduckgo|yandex)\./;
const OWN = /(^|\.)phamthanhbien\.com$/;
const clip = (value, max = 300) => String(value || '').trim().slice(0, max);

// Referrer host as a source name: m.facebook.com → facebook, l.messenger.com → messenger...
function sourceFromHost(host) {
  const known = /(facebook|messenger|instagram|zalo|youtube|tiktok|google|bing|coccoc|threads|linkedin|twitter|x)\.(com|me|vn|net)$/.exec(host);
  return known ? (known[1] === 'x' ? 'twitter' : known[1]) : host.replace(/^www\./, '');
}

// The touch of one page load, or null for a direct visit / a page of our own site.
function touchFrom({ query = {}, referer = '', path = '/', now = new Date() } = {}) {
  const get = key => clip(Array.isArray(query[key]) ? query[key][0] : query[key]);
  const touch = {};
  for (const [param, field] of Object.entries(UTM)) { const v = get(param); if (v) touch[field] = v; }
  const clickIds = {};
  for (const key of CLICK_IDS) { const v = get(key); if (v) clickIds[key] = clip(v, 500); }
  let referrerHost = '';
  try { referrerHost = referer ? new URL(referer).hostname.toLowerCase() : ''; } catch { referrerHost = ''; }
  const external = referrerHost && !OWN.test(referrerHost);
  const campaign = Object.keys(touch).length || Object.keys(clickIds).length;
  if (!campaign && !external) return null;
  if (!touch.source) touch.source = Object.keys(clickIds).map(k => CLICK_SOURCE[k])[0] || (external ? sourceFromHost(referrerHost) : '');
  if (!touch.medium) touch.medium = Object.keys(clickIds).length ? 'cpc' : external ? (SEARCH.test(referrerHost) ? 'organic' : 'referral') : '';
  if (Object.keys(clickIds).length) touch.click_ids = clickIds;
  if (external) touch.referrer_host = referrerHost;
  touch.landing_path = clip(path, 200) || '/';
  touch.at = now.toISOString();
  return touch;
}

// Messenger links of the customer-care bot carry ?fb_page_id=&fb_id= (Facebook page, person
// in that page). Kept apart from the touches: they identify a person, so they go to our own
// webhooks only, never to ad platforms. Cookie ptb_fb, 90 days, replaced by the next link.
const FB_COOKIE = 'ptb_fb';
const FB_SECONDS = 90 * 24 * 3600;
const FB_PARAMS = ['fb_page_id', 'fb_id'];
const fbFrom = get => {
  const ids = {};
  for (const key of FB_PARAMS) { const v = clip(get(key), 100); if (v) ids[key] = v; }
  return Object.keys(ids).length ? ids : null;
};

const DIRECT = (path, now) =>({ source: '(direct)', medium: '(none)', landing_path: clip(path, 200) || '/', at: now.toISOString() });

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function readTouch(value) {
  if (!value) return null;
  try {
    const touch = JSON.parse(decodeURIComponent(value));
    return touch && typeof touch === 'object' && typeof touch.source === 'string' && typeof touch.at === 'string' ? touch : null;
  } catch { return null; }
}
function cookieString(name, touch, seconds, { host = '', secure = false } = {}) {
  const domain = OWN.test(String(host).split(':')[0]) ? '; Domain=.phamthanhbien.com' : '';
  return `${name}=${encodeURIComponent(JSON.stringify(touch))}; Path=/; Max-Age=${seconds}; SameSite=Lax${domain}${secure ? '; Secure' : ''}`;
}

// Cookies to set for one page load: first touch once (a direct first visit counts), last
// touch when this visit has a source.
function cookiesFor({ query, referer, path, host, secure, cookies, now = new Date() }) {
  const touch = touchFrom({ query, referer, path, now });
  const out = [];
  if (!readTouch(cookies[FT_COOKIE])) out.push(cookieString(FT_COOKIE, touch || DIRECT(path, now), FT_SECONDS, { host, secure }));
  if (touch) out.push(cookieString(LT_COOKIE, touch, LT_SECONDS, { host, secure }));
  const fb = fbFrom(key => Array.isArray(query?.[key]) ? query[key][0] : query?.[key]);
  if (fb) out.push(cookieString(FB_COOKIE, fb, FB_SECONDS, { host, secure }));
  return out;
}

// Express middleware for HTML page loads (landings, website pages, redirects).
function middleware() {
  return (req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html') || /^\/(api|admin|ads|storage|js|css|_next)(\/|$)/.test(req.path) || /\.[a-z0-9]{2,5}$/i.test(req.path)) return next();
    try {
      const set = cookiesFor({ query: req.query, referer: req.get('referer') || '', path: req.path, host: req.get('host') || '',
        secure: req.secure || req.get('x-forwarded-proto') === 'https', cookies: parseCookies(req.headers.cookie) });
      if (set.length) res.append('Set-Cookie', set);
    } catch (error) { console.warn('[attribution]', error.message); }
    next();
  };
}

// First and last touch for a registration: the cookies, or the UTM sent with the form when
// there are none (cookies blocked). The last touch falls back to the first.
function touchesFor(req, body = {}) {
  const cookies = parseCookies(req.headers?.cookie);
  const first = readTouch(cookies[FT_COOKIE]);
  let last = readTouch(cookies[LT_COOKIE]);
  if (!last) {
    const query = { ...body };
    last = touchFrom({ query, referer: body.referrer || '', path: (() => { try { return new URL(body.event_source_url).pathname; } catch { return '/'; } })() }) || first;
  }
  return { first_touch: first || last || null, last_touch: last || null };
}

// fb_page_id/fb_id for a registration: the page address sent with the form, the form fields,
// then the cookie. Empty strings when none.
function fbIdsFor(req, body = {}) {
  let fromUrl = null;
  try { const params = new URL(body.event_source_url).searchParams; fromUrl = fbFrom(key => params.get(key)); } catch { fromUrl = null; }
  let fromCookie = null;
  try { fromCookie = JSON.parse(decodeURIComponent(parseCookies(req.headers?.cookie)[FB_COOKIE] || '')); } catch { fromCookie = null; }
  const ids = fromUrl || fbFrom(key => typeof body[key] === 'string' ? body[key] : '') || (fromCookie && typeof fromCookie === 'object' ? fbFrom(key => typeof fromCookie[key] === 'string' ? fromCookie[key] : '') : null) || {};
  return { fb_page_id: ids.fb_page_id || '', fb_id: ids.fb_id || '' };
}

// Flat fields for webhooks (n8n/HubCRM): ft_source, ft_campaign... lt_source...
function flatTouch(prefix, touch) {
  const t = touch || {};
  return {
    [`${prefix}_source`]: t.source || '', [`${prefix}_medium`]: t.medium || '', [`${prefix}_campaign`]: t.campaign || '',
    [`${prefix}_content`]: t.content || '', [`${prefix}_term`]: t.term || '', [`${prefix}_landing_path`]: t.landing_path || '',
    [`${prefix}_referrer_host`]: t.referrer_host || '', [`${prefix}_at`]: t.at || '',
  };
}

module.exports = { touchFrom, cookiesFor, middleware, touchesFor, fbIdsFor, readTouch, parseCookies, flatTouch, FT_COOKIE, LT_COOKIE, FB_COOKIE, CLICK_IDS };
