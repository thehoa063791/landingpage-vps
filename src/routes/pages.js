const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { parseCookies, extractClientIp } = require('../utils');
const { getZoomEventService, PAGE_ID: ZOOM_PAGE_ID } = require('../zoomEvent');
const { render: renderZoomPage } = require('../zoomEventPage');
const { withSiteUrl } = require('../site');
const customCode = require('../customCode');
const router = express.Router();

// Funnel pages carry the admin's header/body code (src/customCode.js).
router.use((req, res, next) => { customCode.ready().then(() => next(), () => next()); });

const ROOT = path.join(__dirname, '..', '..');

function sendFunnelPage(res, slug, filename, { step: stepOverride, transform, pixel = true } = {}) {
  const file = path.join(ROOT, 'pages', slug, filename);
  if (!fs.existsSync(file)) return res.status(404).send('Page not found');
  // og:/canonical addresses follow SITE_URL (src/site.js).
  let html = withSiteUrl(fs.readFileSync(file, 'utf8'));
  if (transform) html = transform(html);
  // This React landing previously loaded tracking after its vendor scripts,
  // allowing the shared fallback to send a second PageView first.
  if (slug === 'hoc-trading' && !/<script\b[^>]*src=["'][^"']*\/tracking\.js["']/i.test(html)) {
    html = html.replace(/<\/head>/i, '<script src="/p/hoc-trading/tracking.js" defer></script>\n</head>');
  }
  // All HTML landing pages share the browser Pixel rules, including new pages.
  if (pixel && !/<script\b[^>]*\bsrc\s*=\s*["']\/js\/meta-pixel\.js(?:\?[^"']*)?["']/i.test(html)) {
    const pixelTag = '<script src="/js/meta-pixel.js" defer></script>';
    html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${pixelTag}\n</head>`) : `${pixelTag}\n${html}`;
  }
  const step = stepOverride || (/thank|success|sucess/i.test(filename) ? 'thank-you' : 'home');
  // Thank-you pages are only for people who just registered: never in search results.
  // A robots tag that allows indexing (kept from WordPress) is replaced; a missing one added.
  if (step === 'thank-you') {
    const robots = /<meta\s+name=["']robots["'][^>]*>/i;
    if (!robots.test(html)) html = html.replace(/<head([^>]*)>/i, '<head$1>\n<meta name="robots" content="noindex, follow">');
    else if (!/noindex/i.test(robots.exec(html)[0])) html = html.replace(robots, '<meta name="robots" content="noindex, follow">');
  }
  const tag = `<script src="/js/funnel-tracker.js" data-funnel="${slug}" data-step="${step}" defer></script>`;
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${tag}\n</head>`) : `${tag}\n${html}`;
  html = customCode.inject(html, slug);
  res.type('html').send(html);
}

// /trading and /dong-tien are served by the Next.js learning app (deploy/nginx.conf).
const redirectWithQuery = (destination, permanent = false) => (req, res) => {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(permanent ? 301 : 302, destination + query);
};

// phamthanhbien.com: the pages kept from the WordPress site (pages/website, copied with
// scripts/mirror-wp-pages.cjs). They keep their own tracking (GTM), so no shared Pixel is added.
const WEBSITE_HOSTS = (process.env.WEBSITE_HOSTS || 'phamthanhbien.com,www.phamthanhbien.com').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
const WEBSITE_PAGES = ['ve-toi', 'chinh-sach-quy-dinh', 'cashching', 'cashchingclub', 'playlist-2', 'loinhuan', 'vong-quay-von',
  'tai-san-va-dong-tien', 'phan-bo-danh-muc-dau-tu', 'quan-tri-cam-xuc', 'phuong-phap-hoi-tu-ky-thuat', 'thank-you-webinar'];
const websitePage = slug => (req, res) => sendFunnelPage(res, 'website', `${slug}.html`, { pixel: false });

// The website home on phamthanhbien.com (and at /home anywhere); other hosts keep /trading.
router.get('/', (req, res, next) => WEBSITE_HOSTS.includes(String(req.hostname || '').toLowerCase()) ? websitePage('home')(req, res) : next(), redirectWithQuery('/trading'));
router.get('/home', websitePage('home'));
for (const slug of WEBSITE_PAGES) router.get(`/${slug}`, websitePage(slug));

router.get('/thank-you', (req, res) => res.redirect(301, '/trading/learn'));

router.get('/workshop', (req, res) => res.redirect(301, '/hoc-trading'));

router.get('/thank-you-workshop', (req, res) => res.redirect(301, '/thank-you-hoc-trading'));

router.get('/30s', (req, res) => sendFunnelPage(res, '30s', 'index.html'));

router.get('/thank-you-30s', (req, res) => sendFunnelPage(res, '30s', 'thank-you.html'));

router.get(['/hoc-trading', '/p/hoc-trading'], (req, res) => sendFunnelPage(res, 'hoc-trading', 'home.html'));

router.get(['/thank-you-hoc-trading', '/hoc-trading/thank-you'], (req, res) => sendFunnelPage(res, 'hoc-trading', 'register-sucess.html'));

router.get('/richlife-v2', (req, res) =>
  res.redirect(301, '/richlife'));

router.get('/richlife-v2/thank-you', (req, res) =>
  res.redirect(301, '/richlife/thank-you'));

// A/B test trên cùng URL /richlife: bản ngắn (pages/richlife-short) và bản vừa
// (pages/richlife-medium), chia 50/50. Cookie giữ mỗi khách ở một bản, kể cả trang
// cảm ơn, để admin Funnels đếm riêng từng bản theo page_id. ?v=short / ?v=medium để xem
// thử. Bản đầy đủ (pages/richlife) không còn trong test, vẫn xem được ở /p/richlife.
// Cookie đổi tên khi đổi cặp test để khách cũ được chia lại từ đầu.
const RICHLIFE_AB_COOKIE = 'ab_richlife2';
const RICHLIFE_VARIANTS = { short: 'richlife-short', medium: 'richlife-medium' };

function richlifeVariant(req, res, assign) {
  const forced = RICHLIFE_VARIANTS[String(req.query.v || '').toLowerCase()];
  let saved = '';
  try { saved = parseCookies(req)[RICHLIFE_AB_COOKIE] || ''; } catch { /* cookie hỏng → bốc thăm lại */ }
  const current = Object.values(RICHLIFE_VARIANTS).includes(saved) ? saved : '';
  const slug = forced || current || (assign ? (Math.random() < 0.5 ? RICHLIFE_VARIANTS.short : RICHLIFE_VARIANTS.medium) : 'richlife');
  if (slug !== saved && (forced || assign)) {
    res.cookie(RICHLIFE_AB_COOKIE, slug, { maxAge: 60 * 24 * 60 * 60 * 1000, sameSite: 'lax', path: '/' });
  }
  // Không để CDN/trình duyệt lưu cố định một bản cho mọi khách
  res.set({ 'Cache-Control': 'private, no-store', Vary: 'Cookie' });
  return slug;
}

router.get('/richlife', (req, res) => sendFunnelPage(res, richlifeVariant(req, res, true), 'index.html'));

router.get(['/richlife/thank-you', '/thank-you-richlife'], (req, res) =>
  sendFunnelPage(res, richlifeVariant(req, res, false), 'thank-you.html'));

router.get('/richlife-bni', (req, res) => sendFunnelPage(res, 'richlife-bni', 'index.html'));

router.get(['/richlife-bni/thank-you', '/thank-you-richlife-bni'], (req, res) => sendFunnelPage(res, 'richlife-bni', 'thank-you.html'));

router.get('/richlife-live', (req, res) => sendFunnelPage(res, 'richlife-live', 'index.html'));

router.get(['/richlife-live/thank-you', '/thank-you-richlife-live'], (req, res) => sendFunnelPage(res, 'richlife-live', 'thank-you.html'));

// Breakout Trading: paid by bank transfer (src/bankTransfer.js), one thank-you page per region.
router.get('/breakout', (req, res) => sendFunnelPage(res, 'breakout', 'index.html'));
router.get('/breakout/thanh-toan', (req, res) => {
  res.set('Cache-Control', 'no-store');
  sendFunnelPage(res, 'breakout', 'payment.html', { step: 'payment' });
});
router.get('/breakout/thank-you-hn', (req, res) => sendFunnelPage(res, 'breakout', 'thank-you-hn.html'));
router.get('/breakout/thank-you-hcm', (req, res) => sendFunnelPage(res, 'breakout', 'thank-you-hcm.html'));

router.get('/thank-you-trading', redirectWithQuery('/trading/learn', true));
router.get(/^\/p\/trading(?:\/.*)?$/, redirectWithQuery('/trading', true));

router.get(/^\/p\/dong-tien(?:\/(.*))?\/?$/, (req, res) => {
  const suffix = String(req.params[0] || '').replace(/^index\.html$/, '');
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, `/dong-tien${suffix ? `/${suffix}` : ''}${query}`);
});
router.get(/^\/(?:p\/)?(?:free|dongtien)(?:\/(.*))?\/?$/, (req, res) => {
  const suffix = String(req.params[0] || '');
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const destination = /^(thank-you(?:\.html)?)\/?$/.test(suffix) ? '/trading/learn' : '/trading';
  res.redirect(301, destination + query);
});
router.get(['/thank-you-free', '/thank-you-dong-tien', '/thank-you-dongtien'], (req, res) => res.redirect(301, '/trading/learn'));

// /zoom: email check against the CRM, info completion for new people, personal Zoom
// link page (src/zoomEvent.js). Templates are filled with the admin settings.
const zoomPage = (filename, step) => async (req, res, next) => {
  try {
    const settings = await getZoomEventService().settings();
    res.set('Cache-Control', 'no-store');
    sendFunnelPage(res, ZOOM_PAGE_ID, filename, { step, transform: html => renderZoomPage(html, settings) });
  } catch (error) { next(error); }
};
router.get('/zoom', zoomPage('index.html', 'home'));
router.get('/zoom/hoan-tat', zoomPage('complete.html', 'complete'));
router.get('/zoom/vao-hoc/:key', zoomPage('join.html', 'join'));
// "Vào học ngay": counts the click, then opens the person's own Zoom link.
router.get('/zoom/join/:key', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.redirect(302, await getZoomEventService().join(req.params.key, { ip: extractClientIp(req), user_agent: req.headers['user-agent'] || '', url: `/zoom/vao-hoc/${req.params.key}` }));
  } catch (error) {
    if (!error.status) console.error('[zoom-event] join failed:', error.message);
    const back = error.code === 'not_found' ? '/zoom' : `/zoom/vao-hoc/${encodeURIComponent(req.params.key)}?error=${encodeURIComponent(error.code || 'unavailable')}`;
    res.redirect(302, back);
  }
});
router.get(/^\/p\/zoom-event(?:\/(?:index\.html)?)?$/, redirectWithQuery('/zoom'));
router.get(/^\/p\/zoom-event\/[^/]+\.html$/, (req, res) => res.redirect(302, '/zoom'));

router.get('/p/:slug', (req, res) => {
  const index = path.join(ROOT, 'pages', req.params.slug, 'index.html');
  const home = path.join(ROOT, 'pages', req.params.slug, 'home.html');
  if (fs.existsSync(index)) return sendFunnelPage(res, req.params.slug, 'index.html');
  if (fs.existsSync(home)) return sendFunnelPage(res, req.params.slug, 'home.html');
  return res.status(404).send('Page not found');
});

router.get('/p/:slug/:filename', (req, res) => {
  if (!/^[a-z0-9._-]+\.html$/i.test(req.params.filename)) return res.status(404).send('Page not found');
  return sendFunnelPage(res, req.params.slug, req.params.filename);
});

// The blog (/blog...) lives in src/routes/blog.js; it lists these pages in the sitemap.
router.WEBSITE_PAGES = WEBSITE_PAGES;

module.exports = router;
