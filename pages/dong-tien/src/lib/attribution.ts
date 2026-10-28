// First touch / last touch cookies for the course app (middleware). Same rules as
// src/attribution.js of the root project, which sets them for every other page and reads
// them at registration: ptb_ft once (12 months, a direct first visit counts), ptb_lt for
// each visit with UTM, an ad click ID or another site as referrer (whole set replaced,
// 90 days). Server-set, on .phamthanhbien.com; no personal data.
type Touch = Record<string, unknown> & { source: string; at: string };

const FT_COOKIE = 'ptb_ft';
const LT_COOKIE = 'ptb_lt';
const FT_SECONDS = 365 * 24 * 3600;
const LT_SECONDS = 90 * 24 * 3600;
const FB_COOKIE = 'ptb_fb';
const FB_SECONDS = 90 * 24 * 3600;
const FB_PARAMS = ['fb_page_id', 'fb_id'];
const UTM: Record<string, string> = { utm_source: 'source', utm_medium: 'medium', utm_campaign: 'campaign', utm_content: 'content', utm_term: 'term' };
const CLICK_SOURCE: Record<string, string> = { fbclid: 'facebook', gclid: 'google', wbraid: 'google', gbraid: 'google', ttclid: 'tiktok', msclkid: 'bing', twclid: 'twitter' };
const SEARCH = /(^|\.)(google|bing|coccoc|yahoo|duckduckgo|yandex)\./;
const OWN = /(^|\.)phamthanhbien\.com$/;
const clip = (value: string | null, max = 300) => String(value || '').trim().slice(0, max);

function sourceFromHost(host: string) {
  const known = /(facebook|messenger|instagram|zalo|youtube|tiktok|google|bing|coccoc|threads|linkedin|twitter|x)\.(com|me|vn|net)$/.exec(host);
  return known ? (known[1] === 'x' ? 'twitter' : known[1]) : host.replace(/^www\./, '');
}

export function touchFrom(params: URLSearchParams, referer: string, path: string, now = new Date()): Touch | null {
  const touch: Record<string, unknown> = {};
  for (const [param, field] of Object.entries(UTM)) { const v = clip(params.get(param)); if (v) touch[field] = v; }
  const clickIds: Record<string, string> = {};
  for (const key of Object.keys(CLICK_SOURCE)) { const v = clip(params.get(key), 500); if (v) clickIds[key] = v; }
  let referrerHost = '';
  try { referrerHost = referer ? new URL(referer).hostname.toLowerCase() : ''; } catch { referrerHost = ''; }
  const external = !!referrerHost && !OWN.test(referrerHost);
  const hasClick = Object.keys(clickIds).length > 0;
  if (!Object.keys(touch).length && !hasClick && !external) return null;
  if (!touch.source) touch.source = Object.keys(clickIds).map(k => CLICK_SOURCE[k])[0] || (external ? sourceFromHost(referrerHost) : '');
  if (!touch.medium) touch.medium = hasClick ? 'cpc' : external ? (SEARCH.test(referrerHost) ? 'organic' : 'referral') : '';
  if (hasClick) touch.click_ids = clickIds;
  if (external) touch.referrer_host = referrerHost;
  touch.landing_path = clip(path, 200) || '/';
  touch.at = now.toISOString();
  return touch as Touch;
}

function hasTouch(value: string | undefined) {
  if (!value) return false;
  try { const t = JSON.parse(decodeURIComponent(value)); return !!t && typeof t.source === 'string' && typeof t.at === 'string'; } catch { return false; }
}

function cookieString(name: string, touch: Record<string, unknown>, seconds: number, host: string, secure: boolean) {
  const domain = OWN.test(host.split(':')[0]) ? '; Domain=.phamthanhbien.com' : '';
  return `${name}=${encodeURIComponent(JSON.stringify(touch))}; Path=/; Max-Age=${seconds}; SameSite=Lax${domain}${secure ? '; Secure' : ''}`;
}

/** Set-Cookie values for one page load (empty when nothing changes). */
export function attributionCookies(input: { params: URLSearchParams; referer: string; path: string; host: string; secure: boolean; ft?: string; now?: Date }): string[] {
  const now = input.now || new Date();
  const touch = touchFrom(input.params, input.referer, input.path, now);
  const out: string[] = [];
  if (!hasTouch(input.ft)) out.push(cookieString(FT_COOKIE, touch || { source: '(direct)', medium: '(none)', landing_path: clip(input.path, 200) || '/', at: now.toISOString() }, FT_SECONDS, input.host, input.secure));
  if (touch) out.push(cookieString(LT_COOKIE, touch, LT_SECONDS, input.host, input.secure));
  // Messenger links of the customer-care bot (?fb_page_id=&fb_id=), as src/attribution.js:
  // read back at registration for our own webhooks, never sent to ad platforms.
  const fb: Record<string, string> = {};
  for (const key of FB_PARAMS) { const v = clip(input.params.get(key), 100); if (v) fb[key] = v; }
  if (Object.keys(fb).length) out.push(cookieString(FB_COOKIE, fb, FB_SECONDS, input.host, input.secure));
  return out;
}

export { FT_COOKIE, LT_COOKIE };
