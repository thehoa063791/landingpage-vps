// ── Express async wrapper ─────────────────────────────────────────────────────
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const ADMIN_ACCESS_COOKIE = 'crm_admin_access';

function getAdminCookieSecret() {
  return process.env.ADMIN_COOKIE_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.ADMIN_PASSWORD
    || 'change-me-admin-cookie-secret';
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return acc;
      acc[decodeURIComponent(part.slice(0, idx))] = decodeURIComponent(part.slice(idx + 1));
      return acc;
    }, {});
}

function signAdminAccessValue(payload) {
  const crypto = require('crypto');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getAdminCookieSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

function verifyAdminAccessValue(value) {
  const crypto = require('crypto');
  const [body, sig] = String(value || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac('sha256', getAdminCookieSecret())
    .update(body)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.role !== 'admin' || Number(payload.exp || 0) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function makeAdminAccessCookie(user, maxAgeSeconds = 8 * 60 * 60) {
  const payload = {
    id: user?.id || null,
    email: user?.email || '',
    full_name: user?.full_name || user?.email || 'admin',
    role: 'admin',
    exp: Date.now() + maxAgeSeconds * 1000,
  };
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${ADMIN_ACCESS_COOKIE}=${encodeURIComponent(signAdminAccessValue(payload))}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

async function adminCookieOrAuth(req, res, next) {
  const payload = verifyAdminAccessValue(parseCookies(req)[ADMIN_ACCESS_COOKIE]);
  if (payload) {
    req.adminUser = {
      id: payload.id,
      email: payload.email,
      full_name: payload.full_name,
      role: 'admin',
      active: true,
    };
    return next();
  }
  return adminAuth(req, res, next);
}

// ── Admin auth middleware ─────────────────────────────────────────────────────
async function adminAuth(req, res, next) {
  try {
    const { supabase } = require('./storage');
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const cookiePayload = verifyAdminAccessValue(parseCookies(req)[ADMIN_ACCESS_COOKIE]);
    if (cookiePayload) {
      req.adminUser = {
        id: cookiePayload.id,
        email: cookiePayload.email,
        full_name: cookiePayload.full_name,
        role: 'admin',
        active: true,
      };
      return next();
    }
    const bootstrapAdminEmails = String(process.env.CRM_BOOTSTRAP_ADMIN_EMAILS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) {
        const { data: profile } = await supabase
          .from('crm_profiles')
          .select('user_id,email,full_name,role,active')
          .eq('user_id', data.user.id)
          .single();

        if (profile && profile.active !== false) {
          req.adminUser = {
            id: data.user.id,
            email: profile?.email || data.user.email || '',
            full_name: profile?.full_name || data.user.user_metadata?.full_name || data.user.email || '',
            role: profile?.role === 'admin' ? 'admin' : 'sale',
            active: profile?.active !== false,
          };
          return next();
        }
        const userEmail = String(data.user.email || '').toLowerCase();
        if (bootstrapAdminEmails.includes(userEmail)) {
          const bootProfile = {
            user_id: data.user.id,
            email: data.user.email || '',
            full_name: data.user.user_metadata?.full_name || data.user.email || '',
            role: 'admin',
            active: true,
            updated_at: new Date().toISOString(),
          };
          const { error: bootErr } = await supabase
            .from('crm_profiles')
            .upsert(bootProfile, { onConflict: 'user_id' });
          if (!bootErr) {
            req.adminUser = {
              id: data.user.id,
              email: bootProfile.email,
              full_name: bootProfile.full_name,
              role: 'admin',
              active: true,
            };
            return next();
          }
          console.warn('[adminAuth] Bootstrap CRM profile failed:', bootErr.message);
        }
        console.warn('[adminAuth] Auth user has no active CRM profile', {
          user_id: data.user.id,
          email: data.user.email,
          profile_found: !!profile,
          profile_active: profile?.active,
        });
      }
      if (error) console.warn('[adminAuth] Internal auth token rejected:', error.message);
    }

    if (process.env.ADMIN_BASIC_AUTH_ENABLED === 'true') {
      const user    = process.env.ADMIN_USERNAME || 'admin';
      const pass    = process.env.ADMIN_PASSWORD || 'changeme123';
      const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
      if (auth === `Basic ${encoded}`) {
        req.adminUser = { id: null, email: user, full_name: user, role: 'admin', active: true };
        return next();
      }
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    }

    return res.status(401).json({ error: 'Unauthorized' });
  } catch (e) {
    return next(e);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.adminUser || !roles.includes(req.adminUser.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// ── User-Agent parser ─────────────────────────────────────────────────────────
function parseUA(ua) {
  if (!ua) return { browser: 'Unknown', browser_version: '', os: 'Unknown', device_type: 'Unknown', raw: '' };
  const mobile = /Mobile|Android|iPhone|iPod/i.test(ua);
  const tablet = /iPad|Android(?!.*Mobile)/i.test(ua);

  let os = 'Unknown';
  const osMatch = ua.match(/Windows NT ([\d.]+)|Mac OS X ([\d_]+)|Android ([\d.]+)|iPhone OS ([\d_]+)|iPad.*OS ([\d_]+)|Linux/i);
  if (osMatch) {
    if (/Windows/i.test(ua)) {
      const v = { '10.0':'10','6.3':'8.1','6.2':'8','6.1':'7','6.0':'Vista','5.1':'XP' };
      const n = ua.match(/Windows NT ([\d.]+)/)?.[1] || '';
      os = 'Windows ' + (v[n] || n);
    } else if (/Android/i.test(ua))  os = 'Android '  + (ua.match(/Android ([\d.]+)/)?.[1] || '');
    else if (/iPhone/i.test(ua))     os = 'iOS '       + (ua.match(/iPhone OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') || '');
    else if (/iPad/i.test(ua))       os = 'iPadOS '    + (ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') || '');
    else if (/Mac OS X/i.test(ua))   os = 'macOS '     + (ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') || '');
    else if (/Linux/i.test(ua))      os = 'Linux';
  }

  let browser = 'Unknown', bver = '';
  if      (/Edg\/([\d.]+)/i.test(ua))        { browser = 'Edge';    bver = ua.match(/Edg\/([\d.]+)/i)?.[1] || ''; }
  else if (/OPR\/([\d.]+)/i.test(ua))        { browser = 'Opera';   bver = ua.match(/OPR\/([\d.]+)/i)?.[1] || ''; }
  else if (/SamsungBrowser\/([\d.]+)/i.test(ua)) { browser = 'Samsung'; bver = ua.match(/SamsungBrowser\/([\d.]+)/i)?.[1] || ''; }
  else if (/CriOS\/([\d.]+)/i.test(ua))      { browser = 'Chrome';  bver = ua.match(/CriOS\/([\d.]+)/i)?.[1] || ''; }
  else if (/FxiOS\/([\d.]+)/i.test(ua))      { browser = 'Firefox'; bver = ua.match(/FxiOS\/([\d.]+)/i)?.[1] || ''; }
  else if (/Chrome\/([\d.]+)/i.test(ua))     { browser = 'Chrome';  bver = ua.match(/Chrome\/([\d.]+)/i)?.[1] || ''; }
  else if (/Firefox\/([\d.]+)/i.test(ua))    { browser = 'Firefox'; bver = ua.match(/Firefox\/([\d.]+)/i)?.[1] || ''; }
  else if (/Safari\/([\d.]+)/i.test(ua))     { browser = 'Safari';  bver = ua.match(/Version\/([\d.]+)/i)?.[1] || ''; }

  return {
    browser, browser_version: bver,
    os, device_type: tablet ? 'Tablet' : mobile ? 'Mobile' : 'Desktop',
    raw: ua
  };
}

// ── Client IP extraction (IPv4 + IPv6) ───────────────────────────────────────
// Trả về IP thật của client. Ưu tiên x-real-ip (Vercel inject IP thật ở đây),
// sau đó x-forwarded-for (lấy IP đầu tiên). Tự động normalize:
//   - ::ffff:1.2.3.4  → 1.2.3.4  (IPv4-mapped IPv6)
//   - [::1]:port      → ::1      (bracket + port notation)
// Bỏ qua loopback và các dải private (IPv4 & IPv6).
function extractClientIp(req) {
  const candidates = [
    req.headers['x-real-ip'],
    (req.headers['x-forwarded-for'] || '').split(',')[0],
    req.socket?.remoteAddress,
  ];
  for (let raw of candidates) {
    let ip = String(raw || '').trim();
    if (!ip) continue;
    // Strip bracket notation với port: [::1]:8080 → ::1
    const bracket = ip.match(/^\[([^\]]+)\]/);
    if (bracket) ip = bracket[1];
    // Normalize IPv4-mapped IPv6: ::ffff:1.2.3.4 → 1.2.3.4
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    // Bỏ qua loopback
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') continue;
    // Bỏ qua IPv4 private
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) continue;
    // Bỏ qua IPv6 private / link-local / ULA
    const ipLow = ip.toLowerCase();
    if (ipLow.startsWith('fe80') || ipLow.startsWith('fc') || ipLow.startsWith('fd')) continue;
    return ip;
  }
  return '';
}

// ── IP geolocation (ip-api.com, hỗ trợ cả IPv4 lẫn IPv6) ────────────────────
async function lookupGeo(ip) {
  const local = ['127.0.0.1', '::1', 'localhost'];
  if (!ip || local.includes(ip) || ip.startsWith('192.168') || ip.startsWith('10.') || ip.startsWith('172.')) return null;
  // Bỏ qua IPv6 private / link-local / ULA
  const ipLow = ip.toLowerCase();
  if (ipLow.startsWith('fe80') || ipLow.startsWith('fc') || ipLow.startsWith('fd')) return null;
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,zip,isp,org,lat,lon&lang=vi`,
      { signal: AbortSignal.timeout(3000) }
    );
    const d = await res.json();
    if (d.status === 'success') return {
      country: d.country, country_code: d.countryCode,
      region: d.regionName, city: d.city, zip: d.zip || '',
      isp: d.isp, org: d.org, lat: d.lat, lon: d.lon
    };
  } catch { /* geo không ảnh hưởng flow chính */ }
  return null;
}

// ── Device & geo aggregation for admin stats ──────────────────────────────────
function buildDeviceGeoStats(registrations) {
  const deviceType = {}, os = {}, browser = {}, country = {}, city = {}, isp = {};

  registrations.forEach(r => {
    const d = r.device || {};
    const g = r.geo   || {};

    if (d.device_type) deviceType[d.device_type] = (deviceType[d.device_type] || 0) + 1;
    if (d.os) {
      const osName = d.os.replace(/\s[\d._]+$/, '').trim();
      os[osName] = (os[osName] || 0) + 1;
    }
    if (d.browser) browser[d.browser] = (browser[d.browser] || 0) + 1;
    if (g.country) country[g.country] = (country[g.country] || 0) + 1;
    if (g.city)    city[g.city]       = (city[g.city]       || 0) + 1;
    if (g.isp) {
      const ispShort = g.isp.replace(/Vietnam|Viet Nam|Corporation|Company|Limited|Group/gi, '').trim().slice(0, 30);
      isp[ispShort || g.isp] = (isp[ispShort || g.isp] || 0) + 1;
    }
  });

  const topN = (obj, n = 8) => Object.fromEntries(
    Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
  );

  return { deviceType, os, browser, country, city: topN(city), isp: topN(isp) };
}

// ── Traffic channel classifier ────────────────────────────────────────────────
function classifyChannel(src, medium, referrer) {
  src    = (src    || '').toLowerCase().trim();
  medium = (medium || '').toLowerCase().trim();
  if (!src && !medium && !referrer) return 'Direct';
  if (src === 'direct' && (!medium || medium === '(none)')) return 'Direct';
  if (['cpc','ppc','paid','paidsearch','paid_search'].includes(medium)) return 'Paid Search';
  if (medium === 'email')  return 'Email';
  if (medium === 'sms')    return 'SMS';
  if (['facebook','instagram','tiktok','twitter','zalo','linkedin','youtube'].some(s => src.includes(s))) return 'Social';
  if (medium === 'organic') return 'Organic Search';
  if (medium === 'referral' || referrer) return 'Referral';
  if (medium.includes('display') || medium.includes('banner')) return 'Display';
  if (src || medium) return 'Other Campaign';
  return 'Direct';
}

module.exports = {
  wrap,
  adminAuth,
  adminCookieOrAuth,
  makeAdminAccessCookie,
  parseCookies,
  requireRole,
  parseUA,
  lookupGeo,
  extractClientIp,
  buildDeviceGeoStats,
  classifyChannel,
};
