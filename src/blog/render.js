// HTML of the blog pages (docs/blog-seo-plan.md §5): server-rendered, readable without
// JavaScript, one H1, breadcrumbs, table of contents, related posts, CTA to the programmes.
// The CSS is inline (one request for the first paint); the only script loads YouTube on click
// and counts the view (POST /api/blog/view, kept in events, no Meta Pixel or GTM).
const { escapeHtml: esc, excerpt } = require('./content');
const seo = require('./seo');
const { srcsetFor } = require('./images');
const srcsetAttr = (url, sizes) => { const set = url ? srcsetFor(url) : ''; return set ? ` srcset="${set}" sizes="${sizes}"` : ''; };

const { BASE, BRAND } = seo;
const dateVi = value => (value ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '');
const iso = value => (value ? new Date(value).toISOString() : '');
const postUrl = slug => `${BASE}/${slug}`;

const CSS = `
:root{--bg:#fff;--fg:#1d2329;--muted:#5d6670;--line:#e4e7eb;--soft:#f5f6f8;--accent:#a86b12;--accent-fg:#fff;--link:#8a5507;--radius:12px;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#e9ecef;--muted:#a3abb4;--line:#2a2f35;--soft:#1b1f24;--accent:#e0a64a;--accent-fg:#14161a;--link:#f0b85e;color-scheme:dark}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.7 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:var(--link)}img{max-width:100%;height:auto}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}.narrow{max-width:720px;margin:0 auto}
.site-header{border-bottom:1px solid var(--line)}.site-header .wrap{display:flex;align-items:center;gap:20px;min-height:60px;flex-wrap:wrap}
.brand{font-weight:700;color:var(--fg);text-decoration:none;font-size:18px}.nav{display:flex;gap:16px;flex-wrap:wrap;font-size:15px}
.nav a{color:var(--muted);text-decoration:none}.nav a:hover,.nav a[aria-current]{color:var(--fg)}
.crumbs{font-size:14px;color:var(--muted);margin:20px 0 8px}.crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.crumbs li+li::before{content:"›";margin-right:6px}.crumbs a{color:var(--muted)}
h1{font-size:clamp(28px,5vw,40px);line-height:1.25;margin:8px 0 12px;letter-spacing:-.01em}
.lead{color:var(--muted);font-size:18px;margin:0 0 24px}
.meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--muted);font-size:14px;margin-bottom:20px}
.cover{margin:0 0 28px}.cover img{width:100%;border-radius:var(--radius);display:block}
.toc{background:var(--soft);border-radius:var(--radius);padding:12px 18px;margin:0 0 28px;font-size:15px}
.toc summary{cursor:pointer;font-weight:600}.toc ol{margin:8px 0 4px;padding-left:20px}.toc ul{margin:2px 0;padding-left:18px;list-style:circle}
.content h2{font-size:26px;line-height:1.3;margin:40px 0 12px}.content h3{font-size:21px;margin:32px 0 10px}.content h4{font-size:18px;margin:24px 0 8px}
.content h2,.content h3{scroll-margin-top:16px}.content p,.content ul,.content ol{margin:0 0 18px}
.content blockquote{margin:24px 0;padding:4px 20px;border-left:4px solid var(--accent);color:var(--muted)}
.content img{border-radius:8px;display:block;margin:24px auto}.content figure{margin:24px 0}.content figcaption{text-align:center;color:var(--muted);font-size:14px}
.table-wrap{overflow-x:auto;margin:0 0 20px}.content table{border-collapse:collapse;width:100%;font-size:15px}.content th,.content td{border:1px solid var(--line);padding:8px 10px;text-align:left}
.content pre{background:var(--soft);padding:14px;border-radius:8px;overflow-x:auto;font-size:14px}
.callout,.cta{background:var(--soft);border-radius:var(--radius);padding:16px 20px;margin:24px 0}
.yt{position:relative;margin:24px 0;cursor:pointer;aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden}
.yt img{width:100%;height:100%;object-fit:cover;margin:0;border-radius:0;opacity:.85}.yt iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.yt button{position:absolute;inset:0;margin:auto;width:68px;height:48px;border:0;border-radius:12px;background:#e00;color:#fff;font-size:20px;cursor:pointer}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:28px 0}.tags a{font-size:14px;background:var(--soft);padding:4px 12px;border-radius:999px;text-decoration:none;color:var(--fg)}
.author{display:flex;gap:16px;align-items:flex-start;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:20px 0;margin:32px 0}
.author img{width:64px;height:64px;border-radius:50%;object-fit:cover;flex:none}.author p{margin:4px 0 0;color:var(--muted);font-size:15px}
.promo{background:var(--accent);color:var(--accent-fg);border-radius:var(--radius);padding:22px 24px;margin:32px 0}
.promo h2{margin:0 0 6px;font-size:21px;line-height:1.35}.promo p{margin:0 0 14px}.promo a{display:inline-block;background:var(--accent-fg);color:var(--accent);font-weight:700;padding:10px 18px;border-radius:999px;text-decoration:none}
.pager-nav{display:flex;justify-content:space-between;gap:16px;margin:24px 0;font-size:15px}.pager-nav a{max-width:48%}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;margin:24px 0 32px}
.card{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:var(--bg)}
.card .thumb{aspect-ratio:16/9;background:var(--soft);display:block}.card .thumb img{width:100%;height:100%;object-fit:cover;display:block}
.card .body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:6px;flex:1}.card h2,.card h3{font-size:19px;line-height:1.35;margin:0}
.card h2 a,.card h3 a{color:var(--fg);text-decoration:none}.card p{margin:0;color:var(--muted);font-size:15px}.card .meta{margin:auto 0 0;font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}.chips a{font-size:14px;border:1px solid var(--line);padding:4px 12px;border-radius:999px;text-decoration:none;color:var(--fg)}.chips a[aria-current]{background:var(--fg);color:var(--bg)}
.pages{display:flex;gap:8px;justify-content:center;margin:8px 0 40px;flex-wrap:wrap}.pages a,.pages span{min-width:40px;text-align:center;padding:6px 12px;border:1px solid var(--line);border-radius:8px;text-decoration:none;color:var(--fg)}.pages span[aria-current]{background:var(--fg);color:var(--bg)}
.related h2{font-size:22px;margin:40px 0 0}
.site-footer{border-top:1px solid var(--line);margin-top:48px;padding:24px 0 40px;color:var(--muted);font-size:14px}.site-footer p{margin:2px 0}
.empty{padding:40px 0;color:var(--muted)}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:600px){body{font-size:16px}.content h2{font-size:23px}.promo{padding:18px}.site-header .wrap{gap:4px 16px;padding-top:10px}.nav{flex-wrap:nowrap;overflow-x:auto;white-space:nowrap;width:100%;padding-bottom:10px;scrollbar-width:none}.nav::-webkit-scrollbar{display:none}}
`.replace(/\s*\n\s*/g, '');

const SCRIPT = `(function(){document.addEventListener('click',function(e){var y=e.target.closest&&e.target.closest('.yt');if(!y||y.querySelector('iframe'))return;var f=document.createElement('iframe');f.src='https://www.youtube-nocookie.com/embed/'+y.dataset.yt+'?autoplay=1';f.title='Video YouTube';f.allow='autoplay; encrypted-media; picture-in-picture';f.allowFullscreen=true;y.appendChild(f);});
try{var b=JSON.stringify({path:location.pathname,referrer:document.referrer||''});if(navigator.sendBeacon)navigator.sendBeacon('/api/blog/view',new Blob([b],{type:'application/json'}));else fetch('/api/blog/view',{method:'POST',headers:{'Content-Type':'application/json'},body:b,keepalive:true});}catch(e){}})();`;

function layout(headHtml, body, { current = 'blog' } = {}) {
  const nav = [['/', 'Trang chủ', 'home'], [BASE, 'Blog', 'blog'], ['/ve-toi', 'Về tôi', 'about'], ['/trading', 'Chương trình Trading', 'trading'], ['/dong-tien', 'Dòng tiền', 'dong-tien']];
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${headHtml}
<style>${CSS}</style></head><body>
<header class="site-header"><div class="wrap"><a class="brand" href="/">${BRAND}</a><nav class="nav" aria-label="Điều hướng chính">${nav.map(([href, label, key]) => `<a href="${href}"${key === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav></div></header>
<main class="wrap">${body}</main>
<footer class="site-footer"><div class="wrap"><p><strong>${esc(seo.ORGANIZATION.name)}</strong></p><p>Hotline: 086 242 1919 · Email: support@vinmoc.com</p><p>Tầng 37, Tòa C5, KĐT Đông Nam Trần Duy Hưng, Yên Hòa, Hà Nội</p></div></footer>
<script>${SCRIPT}</script></body></html>`;
}

const crumbsHtml = items => `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map((item, i) => `<li>${item.path && i < items.length - 1 ? `<a href="${item.path}">${esc(item.name)}</a>` : `<span aria-current="page">${esc(item.name)}</span>`}</li>`).join('')}</ol></nav>`;

function card(post, { heading = 'h2', eager = false } = {}) {
  const image = post.cover_image ? `<a class="thumb" href="${postUrl(post.slug)}" tabindex="-1" aria-hidden="true"><img src="${esc(post.cover_image)}"${srcsetAttr(post.cover_image, '(max-width: 640px) 100vw, 340px')} alt="${esc(post.cover_alt || post.title)}"${post.cover_width ? ` width="${post.cover_width}" height="${post.cover_height}"` : ''}${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></a>` : '';
  const summary = post.excerpt || post.meta_description || '';
  return `<article class="card">${image}<div class="body"><${heading}><a href="${postUrl(post.slug)}">${esc(post.title)}</a></${heading}>${summary ? `<p>${esc(excerpt(summary, 170))}</p>` : ''}<div class="meta"><time datetime="${iso(post.published_at)}">${dateVi(post.published_at)}</time>${post.reading_minutes ? `<span>${post.reading_minutes} phút đọc</span>` : ''}</div></div></article>`;
}

function pager(basePath, page, pages) {
  if (pages <= 1) return '';
  const href = n => (n === 1 ? basePath : `${basePath}/trang/${n}`);
  const items = [];
  if (page > 1) items.push(`<a href="${href(page - 1)}" rel="prev">‹ Trước</a>`);
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) items.push(n === page ? `<span aria-current="page">${n}</span>` : `<a href="${href(n)}">${n}</a>`);
    else if (items.at(-1) !== '<span>…</span>') items.push('<span>…</span>');
  }
  if (page < pages) items.push(`<a href="${href(page + 1)}" rel="next">Sau ›</a>`);
  return `<nav class="pages" aria-label="Phân trang">${items.join('')}</nav>`;
}

/**
 * A list page: the blog home, a category, a tag or an author.
 * opts: { title, heading, description, path, basePath, page, pages, posts, crumbs, index, categories, currentCategory, schema, intro }
 */
function listPage(opts) {
  const { posts, page, pages } = opts;
  const pageSuffix = page > 1 ? ` – Trang ${page}` : '';
  const headHtml = seo.head({
    title: `${opts.title}${pageSuffix}`, description: opts.description, path: opts.path, robots: seo.robots(opts.index !== false),
    schema: [seo.breadcrumbs(opts.crumbs), opts.schema || seo.collection(opts.title, opts.path, posts)],
  });
  const chips = opts.categories?.length ? `<nav class="chips" aria-label="Chủ đề"><a href="${BASE}"${opts.currentCategory ? '' : ' aria-current="page"'}>Tất cả</a>${opts.categories.filter(c => c.posts > 0).map(c => `<a href="${BASE}/chu-de/${c.slug}"${c.slug === opts.currentCategory ? ' aria-current="page"' : ''}>${esc(c.name)}</a>`).join('')}</nav>` : '';
  const body = `${crumbsHtml(opts.crumbs)}<h1>${esc(opts.heading || opts.title)}${pageSuffix ? `<span class="sr-only">${esc(pageSuffix)}</span>` : ''}</h1>
${opts.intro || (opts.description ? `<p class="lead">${esc(opts.description)}</p>` : '')}${chips}
${posts.length ? `<div class="grid">${posts.map((p, i) => card(p, { eager: i === 0 && page === 1 })).join('')}</div>` : '<p class="empty">Chưa có bài viết nào.</p>'}
${pager(opts.basePath, page, pages)}`;
  return layout(headHtml, body);
}

// H3 items nest under the H2 before them, so the numbering follows the sections.
function tocHtml(toc) {
  if (toc.length < 3) return '';
  const sections = [];
  for (const item of toc) {
    if (item.level === 3 && sections.length) sections.at(-1).children.push(item);
    else sections.push({ ...item, children: [] });
  }
  const link = item => `<a href="#${item.id}">${esc(item.text)}</a>`;
  return `<details class="toc" open><summary>Nội dung bài viết</summary><ol>${sections.map(s => `<li>${link(s)}${s.children.length ? `<ul>${s.children.map(c => `<li>${link(c)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ol></details>`;
}

// The call to action under each post: the programmes, with the post as UTM campaign.
function promoHtml(post) {
  const utm = `utm_source=blog&utm_medium=cta&utm_campaign=${encodeURIComponent(post.slug)}`;
  return `<aside class="promo"><h2>Chương trình Phương pháp Trading hiệu quả</h2><p>Hệ thống phương pháp đầu tư của ${BRAND}, miễn phí đăng ký.</p><a href="/trading?${utm}">Tìm hiểu chương trình</a></aside>`;
}

/**
 * A post page. prepared: content.prepare() of the post; extra: { related, neighbours }.
 */
function postPage(post, prepared, { related = [], neighbours = {}, preview = false } = {}) {
  const path = postUrl(post.slug);
  const description = post.meta_description || post.excerpt || excerpt(prepared.text, 160);
  const image = post.og_image || post.cover_image;
  const crumbs = [{ name: 'Trang chủ', path: '/' }, { name: 'Blog', path: BASE }, ...(post.category_slug ? [{ name: post.category_name, path: `${BASE}/chu-de/${post.category_slug}` }] : []), { name: post.title }];
  const modifiedShown = post.modified_at && post.published_at && new Date(post.modified_at) - new Date(post.published_at) > 86400000;
  const index = !preview && post.robots !== 'noindex';
  const headHtml = seo.head({
    title: post.seo_title || post.title, description, path, canonical: post.canonical_url, robots: preview ? 'noindex, nofollow' : seo.robots(index),
    image, imageAlt: post.cover_alt, type: 'article', published: post.published_at, modified: post.modified_at, section: post.category_name, tags: (post.tags || []).map(t => t.name),
    schema: [seo.blogPosting(post, { url: seo.absolute(path), description, image, words: prepared.words }), seo.breadcrumbs(crumbs)],
    alternates: [{ type: 'text/markdown', href: `${path}.md`, title: post.title }],
  });
  const author = post.author_name ? `<section class="author" aria-label="Tác giả">${post.author_avatar ? `<img src="${esc(post.author_avatar)}" alt="${esc(post.author_name)}" width="64" height="64" loading="lazy">` : ''}<div><strong><a href="${BASE}/tac-gia/${post.author_slug}" rel="author">${esc(post.author_name)}</a></strong>${post.author_job_title ? ` · ${esc(post.author_job_title)}` : ''}${post.author_bio ? `<p>${esc(post.author_bio)}</p>` : ''}</div></section>` : '';
  const cover = post.cover_image ? `<figure class="cover"><img src="${esc(post.cover_image)}"${srcsetAttr(post.cover_image, '(max-width: 760px) 100vw, 720px')} alt="${esc(post.cover_alt || post.title)}"${post.cover_width ? ` width="${post.cover_width}" height="${post.cover_height}"` : ''} fetchpriority="high" decoding="async"></figure>` : '';
  const body = `<div class="narrow">${crumbsHtml(crumbs)}
<article>
<h1>${esc(post.title)}</h1>
<div class="meta">${post.author_name ? `<span>${esc(post.author_name)}</span>` : ''}<time datetime="${iso(post.published_at)}">${dateVi(post.published_at)}</time>${modifiedShown ? `<span>Cập nhật <time datetime="${iso(post.modified_at)}">${dateVi(post.modified_at)}</time></span>` : ''}<span>${prepared.minutes} phút đọc</span></div>
${cover}${tocHtml(prepared.toc)}
<div class="content">${prepared.html}</div>
${post.tags?.length ? `<nav class="tags" aria-label="Tag">${post.tags.map(t => `<a href="${BASE}/tag/${t.slug}">#${esc(t.name)}</a>`).join('')}</nav>` : ''}
</article>
${promoHtml(post)}${author}
${neighbours.previous || neighbours.next ? `<nav class="pager-nav" aria-label="Bài trước và sau">${neighbours.previous ? `<a href="${postUrl(neighbours.previous.slug)}" rel="prev">‹ ${esc(neighbours.previous.title)}</a>` : '<span></span>'}${neighbours.next ? `<a href="${postUrl(neighbours.next.slug)}" rel="next">${esc(neighbours.next.title)} ›</a>` : ''}</nav>` : ''}
</div>
${related.length ? `<section class="related" aria-label="Bài viết liên quan"><h2>Bài viết liên quan</h2><div class="grid">${related.map(p => card(p, { heading: 'h3' })).join('')}</div></section>` : ''}`;
  return layout(headHtml, body);
}

// 404 (not found) and 410 (removed): a real status, a way back and the latest posts.
function errorPage(status, latest = []) {
  const gone = status === 410;
  const title = gone ? 'Bài viết đã được gỡ' : 'Không tìm thấy trang';
  const headHtml = seo.head({ title, description: gone ? 'Bài viết này không còn trên blog.' : 'Trang bạn tìm không có trên blog.', path: BASE, robots: 'noindex, follow' });
  const body = `<div class="narrow"><h1>${title}</h1><p class="lead">${gone ? 'Bài viết này đã được gỡ khỏi blog.' : 'Đường dẫn có thể đã thay đổi.'} <a href="${BASE}">Về trang Blog</a>.</p></div>
${latest.length ? `<section class="related" aria-label="Bài viết mới"><h2>Bài viết mới</h2><div class="grid">${latest.map(p => card(p, { heading: 'h3' })).join('')}</div></section>` : ''}`;
  return layout(headHtml, body);
}

module.exports = { layout, listPage, postPage, errorPage, postUrl, dateVi, CSS };
