// node scripts/test-blog.cjs — blog B1 (docs/blog-seo-plan.md) without a database: content
// safety and structure, SEO head and JSON-LD, sitemaps/robots/llms, and the routes on a stub
// repository. The SQL side is checked on Postgres separately (repository queries, migration 019).
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const content = require('../src/blog/content');
const seo = require('../src/blog/seo');
const feeds = require('../src/blog/feeds');
const { createBlogRouter, invalidate } = require('../src/routes/blog');

async function main() {
  // Content: unsafe HTML removed, one H1 (the title), anchors, lazy images, light YouTube, safe links.
  assert.equal(content.slugify('Đầu tư tài chính là gì? Cách để KIẾM lợi nhuận'), 'dau-tu-tai-chinh-la-gi-cach-de-kiem-loi-nhuan');
  assert.equal(content.slugify('See’s Candies: Thương vụ “VUA”'), 'sees-candies-thuong-vu-vua');
  const html = '<h1>Mở đầu</h1><p onclick="x()">A<script>alert(1)</script><a href="javascript:alert(1)">x</a></p><h2>Ý một</h2><h2>Ý một</h2><img src="/a.jpg" alt="a"><img src="/b.jpg" alt="b">'
    + '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe><iframe src="https://evil.example/x"></iframe><p><a href="https://google.com">G</a> <a href="https://event.phamthanhbien.com/trading" target="_blank">T</a></p><table><tr><td>1</td></tr></table>';
  const out = content.prepare(html);
  assert.doesNotMatch(out.html, /<script|onclick|javascript:|evil\.example|<h1/);
  assert.deepEqual(out.toc.map(t => t.id), ['mo-dau', 'y-mot', 'y-mot-2']);
  assert.match(out.html, /<img src="\/a\.jpg" alt="a" decoding="async"><img src="\/b\.jpg" alt="b" loading="lazy" decoding="async">/, 'first image eager, the rest lazy');
  assert.match(out.html, /<div class="yt" data-yt="dQw4w9WgXcQ">/);
  assert.match(out.html, /href="https:\/\/google\.com" rel="noopener" target="_blank"/);
  assert.match(out.html, /<a href="https:\/\/event\.phamthanhbien\.com\/trading">T<\/a>/, 'own links stay in the tab');
  assert.match(out.html, /<div class="table-wrap"><table>/);
  const md = content.toMarkdown(out.html);
  assert.match(md, /^## Mở đầu/); assert.match(md, /!\[a\]\(\/a\.jpg\)/); assert.match(md, /\[G\]\(https:\/\/google\.com\)/); assert.match(md, /youtube\.com\/watch\?v=dQw4w9WgXcQ/);
  assert.equal(content.excerpt('một hai ba bốn năm sáu bảy tám chín mười', 20), 'một hai ba bốn năm…');

  // SEO head: fallbacks, escaping, JSON-LD that cannot close its <script>.
  const head = seo.head({ title: 'Bài "A" <b>', description: 'Mô tả', path: '/blog/a', schema: [{ '@type': 'Thing', name: '</script><script>alert(1)</script>' }] });
  assert.match(head, /<title>Bài &quot;A&quot; &lt;b&gt; \| Phạm Thành Biên<\/title>/);
  assert.match(head, /<link rel="canonical" href="https:\/\/event\.phamthanhbien\.com\/blog\/a">/);
  assert.doesNotMatch(head, /<\/script><script>alert/);
  assert.match(head, /og:image" content="https:\/\/event\.phamthanhbien\.com\/p\/website\//, 'default share image');
  assert.equal(seo.fullTitle('Phạm Thành Biên là ai?'), 'Phạm Thành Biên là ai?');
  assert.equal(seo.robots(true), 'noindex, follow', 'noindex until BLOG_INDEXING');

  // SEO rules (shared with the admin editor): errors block publishing, warnings guide.
  const { analyze, textWidth } = require('../src/blog/seoRules');
  const base = { title: 'Quản trị rủi ro trong đầu tư', slug: 'quan-tri-rui-ro-trong-dau-tu', focus_keyword: 'quản trị rủi ro',
    meta_description: 'Quản trị rủi ro giúp nhà đầu tư giữ vốn. Bài viết tổng hợp các nguyên tắc cốt lõi, ví dụ thực tế và cách áp dụng cho người mới bắt đầu.',
    html: '<p>Quan tri rui ro là nền tảng.</p><h2>Vì sao cần quản trị rủi ro</h2><p><a href="/trading">a</a> <a href="/dong-tien">b</a> <a href="https://investopedia.com">c</a></p>' };
  const levels = report => Object.fromEntries(report.checks.map(c => [c.id, c.level]));
  let report = levels(analyze(base));
  assert.equal(report['keyword-intro'], 'ok', 'keyword found without accents too');
  assert.equal(report['internal-links'], 'ok'); assert.equal(report['external-links'], 'ok'); assert.equal(report.length, 'warn');
  report = levels(analyze({ ...base, html: base.html + '<h4>x</h4>', cover_image: '/a.jpg', cover_alt: '', slug: 'Có Dấu' }));
  assert.deepEqual([report.headings, report['cover-alt'], report.slug], ['error', 'error', 'error']);
  assert.equal(levels(analyze(base, { keywordUsedBy: ['Bài cũ'] }))['keyword-unique'], 'warn');
  assert.ok(textWidth('M'.repeat(40), 20) > 580 && textWidth('i'.repeat(40), 20) < 580, 'pixel width, not characters');

  assert.match(feeds.robotsTxt(), /Disallow: \/api\/\n/);
  assert.deepEqual(feeds.sitePages(['ve-toi', 'thank-you-webinar']), ['/ve-toi', '/trading', '/dong-tien'], 'no thank-you pages; / only on the website host');

  // Routes on a stub repository.
  const post = { id: 'p1', slug: 'bai-a', title: 'Bài A', content: '<h2>Một</h2><p>Nội dung.</p>', content_html: '', excerpt: 'Tóm tắt', status: 'published', is_public: true, robots: 'index',
    published_at: '2026-01-01T00:00:00Z', modified_at: '2026-01-05T00:00:00Z', author_name: 'Phạm Thành Biên', author_slug: 'pham-thanh-bien', category_slug: 'kien-thuc-dau-tu', category_name: 'Kiến thức đầu tư', tags: [] };
  const posts = { 'bai-a': post, 'bai-go': { ...post, slug: 'bai-go', status: 'archived', is_public: false }, 'bai-nhap': { ...post, slug: 'bai-nhap', status: 'draft', is_public: false } };
  const repository = {
    listPosts: async () => ({ rows: [post], total: 1 }), postBySlug: async slug => posts[slug] || null, renamedSlug: async slug => (slug === 'bai-cu' ? 'bai-a' : null),
    categories: async () => [{ slug: 'kien-thuc-dau-tu', name: 'Kiến thức đầu tư', posts: 1 }], categoryBySlug: async () => null, tagBySlug: async () => null, authorBySlug: async () => null,
    related: async () => [], neighbours: async () => ({}), allPublic: async () => [post], indexableTaxonomies: async () => [],
  };
  const app = express();
  app.use(createBlogRouter({ repository, websitePages: () => [], insertEvent: async () => {} }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const get = route => new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${server.address().port}${route}`, res => { let text = ''; res.on('data', d => text += d); res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, text })); }).on('error', reject);
  });
  try {
    invalidate();
    const page = await get('/blog/bai-a');
    assert.equal(page.status, 200);
    assert.equal((page.text.match(/<h1\b/g) || []).length, 1);
    assert.match(page.text, /"@type":"BlogPosting"/); assert.match(page.text, /<html lang="vi">/);
    assert.doesNotMatch(page.text, /fbq\(|googletagmanager|meta-pixel/, 'no Meta Pixel or GTM on the blog');
    assert.deepEqual([(await get('/blog/bai-cu')).status, (await get('/blog/bai-cu')).location], [301, '/blog/bai-a']);
    assert.equal((await get('/blog/bai-go')).status, 410);
    assert.equal((await get('/blog/bai-nhap')).status, 404);
    assert.equal((await get('/blog/')).location, '/blog');
    assert.equal((await get('/blog/chu-de/khong-co')).status, 404);
  } finally { server.close(); }
  console.log('PASS: blog — safe content (no scripts/handlers/foreign iframes, one H1), anchors + TOC, lazy images, light YouTube, Markdown copy, SEO head + JSON-LD escaping, noindex until BLOG_INDEXING, robots/sitemap pages, routes 200/301/404/410, no Pixel/GTM.');
}

main().catch(error => { console.error(error); process.exit(1); });
