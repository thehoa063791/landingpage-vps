#!/usr/bin/env node
// Copies the kept WordPress pages of phamthanhbien.com into pages/website/: each page's HTML
// as served (pages/website/<slug>.html) plus every file it loads from the WordPress site
// (pages/website/assets/wp-content/..., wp-includes/...), with links rewritten to this system.
// Read-only on WordPress: plain GET requests, no login. Re-run before the domain switch to
// pick up recent edits: node scripts/mirror-wp-pages.cjs [slug ...]
const fs = require('fs/promises');
const path = require('path');

const SITE = 'https://phamthanhbien.com';
const OUT = path.join(__dirname, '..', 'pages', 'website');
const ASSET_BASE = '/p/website/assets';
// slug -> WordPress path. "home" is served at /.
const PAGES = {
  home: '/', 've-toi': '/ve-toi/', 'chinh-sach-quy-dinh': '/chinh-sach-quy-dinh/', cashching: '/cashching/', cashchingclub: '/cashchingclub/',
  'playlist-2': '/playlist-2/', loinhuan: '/loinhuan/', 'vong-quay-von': '/vong-quay-von/', 'tai-san-va-dong-tien': '/tai-san-va-dong-tien/',
  'phan-bo-danh-muc-dau-tu': '/phan-bo-danh-muc-dau-tu/', 'quan-tri-cam-xuc': '/quan-tri-cam-xuc/', 'phuong-phap-hoi-tu-ky-thuat': '/phuong-phap-hoi-tu-ky-thuat/',
  // Where the /loinhuan form leads.
  'thank-you-webinar': '/thank-you-webinar/',
};
// Pages whose forms register through /api/register (pages/website/forms.js).
const FORM_PAGES = ['cashching', 'loinhuan'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
// WordPress files, written plainly or JSON-escaped (https:\/\/phamthanhbien.com\/wp-content\/...).
const ASSET_RE = /(?:https?:)?(?:\\?\/\\?\/)(?:www\.)?phamthanhbien\.com((?:\\?\/)wp-(?:content|includes)(?:\\?\/)[^"'\s)<>,]+)|(?<=["'(\s,])((?:\\?\/)wp-(?:content|includes)(?:\\?\/)[^"'\s)<>,]+)/g;
const SKIP_SCRIPTS = [/litespeed-cache\/guest\.vary\.php/];

const saved = new Map(); // WordPress path -> local path or null (failed)
const stats = { files: 0, bytes: 0, failed: [] };

function clean(raw) {
  const p = raw.replace(/\\\//g, '/').replace(/&amp;/g, '&').split(/[?#]/)[0];
  try { return decodeURI(p); } catch { return p; }
}

async function get(url, binary) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
    } catch (error) {
      if (attempt >= 3 || error.status === 404) throw error;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

// Downloads one WordPress file (and, for CSS, the files it references).
async function asset(wpPath) {
  if (saved.has(wpPath)) return saved.get(wpPath);
  const local = path.join(OUT, 'assets', ...wpPath.split('/').filter(Boolean));
  if (!local.startsWith(path.join(OUT, 'assets'))) { saved.set(wpPath, null); return null; }
  saved.set(wpPath, `${ASSET_BASE}${encodeURI(wpPath)}`);
  try {
    let body = await get(SITE + encodeURI(wpPath), true);
    if (/\.css$/i.test(wpPath)) body = Buffer.from(await rewriteCss(body.toString('utf8'), wpPath));
    await fs.mkdir(path.dirname(local), { recursive: true });
    await fs.writeFile(local, body);
    stats.files++; stats.bytes += body.length;
  } catch (error) {
    stats.failed.push(`${wpPath} (${error.message})`);
    saved.set(wpPath, null);
  }
  return saved.get(wpPath);
}

// url(...) in CSS: relative to the stylesheet; rewritten to the local copies.
async function rewriteCss(css, cssPath) {
  const dir = cssPath.replace(/[^/]*$/, '');
  const refs = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)];
  const map = new Map();
  for (const [, , ref] of refs) {
    if (/^(data:|#|https?:\/\/(?!(www\.)?phamthanhbien\.com))/i.test(ref) || map.has(ref)) continue;
    let target;
    if (/^https?:\/\//i.test(ref) || ref.startsWith('//')) target = clean(new URL(ref, SITE).pathname);
    else target = clean(new URL(ref, SITE + dir).pathname);
    if (!/^\/wp-(content|includes)\//.test(target)) continue;
    map.set(ref, await asset(target));
  }
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, quote, ref) => map.get(ref) ? `url(${quote}${map.get(ref)}${quote})` : whole);
}

async function mirrorPage(slug, wpPath) {
  let html = await get(SITE + wpPath);
  const found = new Map();
  for (const m of html.matchAll(ASSET_RE)) {
    const raw = m[1] || m[2];
    const p = clean(raw);
    if (!found.has(p)) found.set(p, null);
  }
  for (const p of found.keys()) found.set(p, await asset(p));
  html = html.replace(ASSET_RE, (whole, abs, rel) => {
    const raw = abs || rel, local = found.get(clean(raw));
    if (!local) return whole;
    const query = raw.replace(/\\\//g, '/').match(/\?[^#]*/);
    const value = local + (query && !/[?&]ver=/.test(query[0]) ? query[0] : '');
    return whole.includes('\\/') ? value.replace(/\//g, '\\/') : value;
  });
  // Links between pages of the site become relative, so they work on any of our domains.
  html = html.replace(/(href=["'])https?:\/\/(?:www\.)?phamthanhbien\.com(\/[^"']*)?(["'])/gi, (whole, a, p, b) => `${a}${p || '/'}${b}`);
  // WordPress endpoints in script settings (ajaxurl, REST): relative, so they never reach WordPress.
  html = html.replace(/(?:https?:)?\\?\/\\?\/(?:www\.)?phamthanhbien\.com(?=\\?\/wp-(?:admin|json)\b)/gi, '');
  for (const re of SKIP_SCRIPTS) html = html.replace(new RegExp(`<script[^>]*${re.source}[^>]*>\\s*</script>`, 'gi'), '');
  // Cloudflare email obfuscation needs Cloudflare's decoder script: write the addresses out.
  const cfDecode = hex => { const key = parseInt(hex.slice(0, 2), 16); let s = ''; for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key); return decodeURIComponent(escape(s)); };
  html = html.replace(/<(span|a)[^>]*class="__cf_email__"[^>]*data-cfemail="([0-9a-f]+)"[^>]*>[\s\S]*?<\/\1>/gi, (whole, tag, hex) => cfDecode(hex));
  html = html.replace(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi, (whole, hex) => `mailto:${cfDecode(hex)}`);
  html = html.replace(/<script[^>]*cloudflare-static\/email-decode\.min\.js[^>]*>\s*<\/script>/gi, '');
  // WordPress head links that point at the old backend.
  html = html.replace(/<link[^>]+rel=["'](?:EditURI|wlwmanifest|pingback|shortlink|alternate)["'][^>]*>\s*/gi, link => /type=["']application\/(?:rss|atom)/i.test(link) || /EditURI|wlwmanifest|pingback|shortlink|wp-json|oembed/i.test(link) ? '' : link);
  if (FORM_PAGES.includes(slug)) html = html.replace(/<\/head>/i, '<script src="/p/website/forms.js" defer></script>\n</head>');
  await fs.writeFile(path.join(OUT, `${slug}.html`), html);
  return html.length;
}

(async () => {
  const only = process.argv.slice(2);
  await fs.mkdir(OUT, { recursive: true });
  for (const [slug, wpPath] of Object.entries(PAGES)) {
    if (only.length && !only.includes(slug)) continue;
    const size = await mirrorPage(slug, wpPath);
    console.log(`${slug.padEnd(28)} ${(size / 1024).toFixed(0)} KB HTML`);
  }
  console.log(`\n${stats.files} files, ${(stats.bytes / 1048576).toFixed(1)} MB downloaded.`);
  if (stats.failed.length) console.log(`Not downloaded (${stats.failed.length}):\n  ${stats.failed.join('\n  ')}`);
})().catch(error => { console.error(error); process.exit(1); });
