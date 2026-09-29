const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { supabase } = require('../storage');
const router = express.Router();

const ROOT = path.join(__dirname, '..', '..');

function sendFunnelPage(res, slug, filename) {
  const file = path.join(ROOT, 'pages', slug, filename);
  if (!fs.existsSync(file)) return res.status(404).send('Page not found');
  let html = fs.readFileSync(file, 'utf8');
  const step = /thank|success|sucess/i.test(filename) ? 'thank-you' : 'home';
  const tag = `<script src="/js/funnel-tracker.js" data-funnel="${slug}" data-step="${step}" defer></script>`;
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${tag}\n</head>`) : `${tag}\n${html}`;
  res.type('html').send(html);
}

router.get('/', (req, res) => sendFunnelPage(res, 'dongtien', 'index.html'));

router.get('/thank-you', (req, res) => sendFunnelPage(res, 'dongtien', 'thank-you.html'));

router.get('/workshop', (req, res) => sendFunnelPage(res, 'workshop', 'index.html'));

router.get('/thank-you-workshop', (req, res) => sendFunnelPage(res, 'workshop', 'thank-you.html'));

router.get('/30s', (req, res) => sendFunnelPage(res, '30s', 'index.html'));

router.get('/thank-you-30s', (req, res) => sendFunnelPage(res, '30s', 'thank-you.html'));

router.get(['/hoc-trading', '/p/hoc-trading'], (req, res) => sendFunnelPage(res, 'hoc-trading', 'home.html'));

router.get(['/thank-you-hoc-trading', '/hoc-trading/thank-you'], (req, res) => sendFunnelPage(res, 'hoc-trading', 'register-sucess.html'));

router.get('/richlife-v2', (req, res) =>
  res.redirect(301, '/richlife'));

router.get('/richlife-v2/thank-you', (req, res) =>
  res.redirect(301, '/richlife/thank-you'));

router.get('/richlife', (req, res) => sendFunnelPage(res, 'richlife', 'index.html'));

router.get('/richlife/thank-you', (req, res) => sendFunnelPage(res, 'richlife', 'thank-you.html'));

router.get('/thank-you-richlife', (req, res) => sendFunnelPage(res, 'richlife', 'thank-you.html'));

router.get('/richlife-bni', (req, res) => sendFunnelPage(res, 'richlife-bni', 'index.html'));

router.get(['/richlife-bni/thank-you', '/thank-you-richlife-bni'], (req, res) => sendFunnelPage(res, 'richlife-bni', 'thank-you.html'));

router.get('/free', (req, res) => sendFunnelPage(res, 'free', 'index.html'));

router.get(['/free/thank-you', '/thank-you-free'], (req, res) => sendFunnelPage(res, 'free', 'thank-you.html'));

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

// ── Blog list ─────────────────────────────────────────────────────────────────
router.get('/blog', async (req, res) => {
  const { data: posts, error } = await supabase
    .from('blog_posts')
    .select('id, title, slug, excerpt, cover_image, author, tags, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).send('Lỗi tải danh sách bài viết.');

  const cards = (posts || []).map(p => `
    <article class="card">
      ${p.cover_image ? `<a href="/blog/${esc(p.slug)}"><img src="${esc(p.cover_image)}" alt="${esc(p.title)}" loading="lazy"></a>` : ''}
      <div class="card-body">
        <div class="meta">${fmtDate(p.created_at)}${p.author ? ` · ${esc(p.author)}` : ''}</div>
        <h2><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h2>
        ${p.excerpt ? `<p class="excerpt">${esc(p.excerpt)}</p>` : ''}
        <a class="read-more" href="/blog/${esc(p.slug)}">Đọc tiếp →</a>
      </div>
    </article>`).join('');

  res.send(blogListHtml(cards, posts?.length || 0));
});

// ── Blog single post ──────────────────────────────────────────────────────────
router.get('/blog/:slug', async (req, res) => {
  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', req.params.slug)
    .eq('status', 'published')
    .single();

  if (error || !post) return res.status(404).send(notFoundHtml());

  res.send(blogPostHtml(post));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function baseHead(title, desc, img) {
  return `<!DOCTYPE html><html lang="vi"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${img ? `<meta property="og:image" content="${esc(img)}">` : ''}
<meta property="og:title" content="${esc(title)}">
<meta property="og:type" content="article">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--gold:#f5a623;--dark:#0d1117;--dark2:#161b22;--green:#22c55e;--gray:#8b949e;--font:'Be Vietnam Pro',sans-serif;--max-w:780px}
body{font-family:var(--font);color:#1a202c;background:#f8fafc;line-height:1.7}
a{text-decoration:none;color:var(--gold)}
a:hover{text-decoration:underline}
img{max-width:100%;height:auto;border-radius:8px}
nav{background:var(--dark);padding:0 24px;height:60px;display:flex;align-items:center;gap:20px}
nav .logo{color:#fff;font-weight:700;font-size:1.1rem}
nav a{color:#ccc;font-size:.9rem}nav a:hover{color:#fff;text-decoration:none}
.container{max-width:var(--max-w);margin:0 auto;padding:40px 20px 80px}
</style>`;
}

function blogListHtml(cards, count) {
  return baseHead('Blog', 'Các bài viết mới nhất') + `
<style>
.page-title{font-size:2rem;font-weight:700;margin-bottom:8px}
.sub{color:var(--gray);margin-bottom:32px}
.card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.07);overflow:hidden;margin-bottom:28px;display:flex;flex-direction:column}
.card img{width:100%;height:220px;object-fit:cover;border-radius:0}
.card-body{padding:24px}
.meta{font-size:.8rem;color:var(--gray);margin-bottom:8px}
h2{font-size:1.3rem;margin-bottom:8px}h2 a{color:#1a202c}h2 a:hover{color:var(--gold)}
.excerpt{color:#4a5568;font-size:.95rem;margin-bottom:12px}
.read-more{font-size:.88rem;font-weight:600;color:var(--gold)}
@media(min-width:600px){.card{flex-direction:row}.card img{width:260px;height:auto;flex-shrink:0;border-radius:0}}
</style></head><body>
<nav><span class="logo">Blog</span><a href="/">← Trang chủ</a></nav>
<div class="container">
<h1 class="page-title">Bài viết</h1>
<p class="sub">${count} bài viết được xuất bản</p>
${cards || '<p style="color:var(--gray)">Chưa có bài viết nào.</p>'}
</div></body></html>`;
}

function blogPostHtml(post) {
  return baseHead(post.title, post.excerpt || post.title, post.cover_image) + `
<style>
.hero{width:100%;max-height:420px;object-fit:cover;border-radius:12px;margin-bottom:32px}
.post-title{font-size:2rem;font-weight:700;line-height:1.3;margin-bottom:16px}
.post-meta{color:var(--gray);font-size:.85rem;margin-bottom:32px;display:flex;gap:16px;flex-wrap:wrap}
.tag{background:#e9ecef;color:#495057;padding:2px 10px;border-radius:20px;font-size:.8rem}
.content{background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.07)}
.content h1,.content h2,.content h3{margin:1.4em 0 .6em;line-height:1.3}
.content p{margin-bottom:1em}
.content ul,.content ol{padding-left:1.5em;margin-bottom:1em}
.content li{margin-bottom:.3em}
.content img{margin:1em 0;border-radius:8px}
.content blockquote{border-left:4px solid var(--gold);padding:8px 16px;background:#fffbf0;margin:1em 0;border-radius:0 8px 8px 0;color:#555}
.content pre{background:#1e293b;color:#e2e8f0;padding:16px;border-radius:8px;overflow-x:auto;margin:1em 0;font-size:.88rem}
.content a{color:var(--gold)}
.back{display:inline-flex;align-items:center;gap:6px;color:var(--gray);font-size:.88rem;margin-bottom:24px}
.back:hover{color:var(--gold);text-decoration:none}
</style></head><body>
<nav><span class="logo">Blog</span><a href="/blog">← Tất cả bài viết</a><a href="/">Trang chủ</a></nav>
<div class="container">
  <a class="back" href="/blog">← Quay lại</a>
  ${post.cover_image ? `<img class="hero" src="${esc(post.cover_image)}" alt="${esc(post.title)}">` : ''}
  <h1 class="post-title">${esc(post.title)}</h1>
  <div class="post-meta">
    <span>${fmtDate(post.created_at)}</span>
    ${post.author ? `<span>${esc(post.author)}</span>` : ''}
    ${(post.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
  </div>
  <div class="content">${post.content || ''}</div>
</div></body></html>`;
}

function notFoundHtml() {
  return baseHead('Không tìm thấy', '') + `</head><body>
<nav><span class="logo">Blog</span><a href="/blog">← Tất cả bài viết</a></nav>
<div class="container" style="text-align:center;padding-top:80px">
<h1 style="font-size:3rem">404</h1>
<p style="color:var(--gray);margin:16px 0">Bài viết không tồn tại hoặc chưa được xuất bản.</p>
<a href="/blog">← Về trang Blog</a>
</div></body></html>`;
}

module.exports = router;
