// Machine-readable files (docs/blog-seo-plan.md §5): sitemaps, RSS, robots.txt, llms.txt.
// Like Ghost's sitemaps: one index, a file per kind, lastmod = when the content changed,
// the post's image listed, and only indexable URLs (none from the blog until BLOG_INDEXING).
const { SITE_URL, SITE_HOST, absoluteUrl } = require('../site');
const seo = require('./seo');
const { excerpt } = require('./content');

const xml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const iso = value => (value ? new Date(value).toISOString() : '');
const { BASE } = seo;

// Public pages outside the blog that belong in search (thank-you pages are left out).
const WEBSITE_HOSTS = (process.env.WEBSITE_HOSTS || 'phamthanhbien.com,www.phamthanhbien.com').split(',').map(h => h.trim().toLowerCase());
function sitePages(websitePages = []) {
  return [
    ...(WEBSITE_HOSTS.includes(SITE_HOST) ? ['/'] : []),
    ...websitePages.filter(slug => !/thank/i.test(slug)).map(slug => `/${slug}`),
    '/trading', '/dong-tien',
  ];
}

function sitemapIndex(names) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${names.map(name => `<sitemap><loc>${xml(absoluteUrl(`/${name}`))}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`;
}

function urlset(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.map(e =>
    `<url><loc>${xml(e.loc)}</loc>${e.lastmod ? `<lastmod>${iso(e.lastmod)}</lastmod>` : ''}${e.image ? `<image:image><image:loc>${xml(seo.absolute(e.image))}</image:loc></image:image>` : ''}</url>`).join('\n')}\n</urlset>\n`;
}

const sitemapPages = websitePages => urlset(sitePages(websitePages).map(path => ({ loc: absoluteUrl(path) })));

// Posts that may be indexed (not noindex, no canonical elsewhere), the blog home and the
// categories/authors with posts. Empty until BLOG_INDEXING=true.
function sitemapBlog(posts, taxonomies) {
  if (!seo.indexing()) return urlset([]);
  const indexable = posts.filter(p => p.robots !== 'noindex' && (!p.canonical_url || seo.absolute(p.canonical_url) === absoluteUrl(`${BASE}/${p.slug}`)));
  const newest = indexable.reduce((max, p) => (!max || new Date(p.modified_at) > new Date(max) ? p.modified_at : max), null);
  return urlset([
    { loc: absoluteUrl(BASE), lastmod: newest },
    ...indexable.map(p => ({ loc: absoluteUrl(`${BASE}/${p.slug}`), lastmod: p.modified_at, image: p.cover_image })),
    // A category needs 3 posts to be indexed (thinner ones are noindex, see src/routes/blog.js).
    ...taxonomies.filter(t => t.kind === 'tac-gia' || t.posts >= 3).map(t => ({ loc: absoluteUrl(`${BASE}/${t.kind}/${t.slug}`), lastmod: t.modified_at })),
  ]);
}

function rss(posts) {
  const items = posts.map(p => `<item><title>${xml(p.title)}</title><link>${xml(absoluteUrl(`${BASE}/${p.slug}`))}</link><guid isPermaLink="true">${xml(absoluteUrl(`${BASE}/${p.slug}`))}</guid><pubDate>${new Date(p.published_at).toUTCString()}</pubDate>${p.category_name ? `<category>${xml(p.category_name)}</category>` : ''}${p.author_name ? `<dc:creator>${xml(p.author_name)}</dc:creator>` : ''}<description>${xml(p.meta_description || p.excerpt || '')}</description></item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>${xml(`Blog ${seo.BRAND}`)}</title><link>${xml(absoluteUrl(BASE))}</link><description>${xml(`Bài viết về đầu tư, tư duy tài chính và xây dựng dòng tiền của ${seo.BRAND}.`)}</description><language>vi</language><atom:link href="${xml(absoluteUrl(`${BASE}/feed.xml`))}" rel="self" type="application/rss+xml"/>${posts[0] ? `<lastBuildDate>${new Date(posts[0].modified_at || posts[0].published_at).toUTCString()}</lastBuildDate>` : ''}\n${items}\n</channel></rss>\n`;
}

function robotsTxt() {
  return [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /zoom/vao-hoc/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
}

// llms.txt (llmstxt.org): what the site is and where the readable copies are.
function llmsTxt(posts) {
  const lines = [
    `# ${seo.BRAND}`,
    '',
    `> Trang của ${seo.BRAND}, Chủ tịch ${seo.ORGANIZATION.name}: phương pháp đầu tư, tư duy tài chính và xây dựng dòng tiền. Mỗi bài blog có bản Markdown (thêm .md vào đường dẫn).`,
    '',
    '## Chương trình',
    '',
    `- [Phương pháp Trading hiệu quả](${absoluteUrl('/trading')}): chương trình video miễn phí về phương pháp trading.`,
    `- [Phương pháp xây dựng dòng tiền](${absoluteUrl('/dong-tien')}): chương trình video miễn phí về xây dựng dòng tiền.`,
    `- [Về ${seo.BRAND}](${absoluteUrl('/ve-toi')})`,
    '',
    '## Blog',
    '',
    ...posts.filter(p => p.robots !== 'noindex').map(p => `- [${p.title}](${absoluteUrl(`${BASE}/${p.slug}.md`)})${p.meta_description || p.excerpt ? `: ${excerpt(p.meta_description || p.excerpt, 160)}` : ''}`),
    '',
  ];
  return lines.join('\n');
}

module.exports = { sitemapIndex, sitemapPages, sitemapBlog, rss, robotsTxt, llmsTxt, sitePages };
