// Public blog (docs/blog-seo-plan.md §3, §5): /blog, posts, categories, tags, authors, feeds,
// sitemaps, robots.txt and llms.txt. Pages are rendered once and kept in memory until the
// blog changes (invalidate()) or 10 minutes pass, so a scheduled post shows within 10 minutes.
const express = require('express');
const { getBlogRepository } = require('../blog/repository');
const { prepare, toMarkdown, slugify } = require('../blog/content');
const render = require('../blog/render');
const feeds = require('../blog/feeds');
const seo = require('../blog/seo');
const { srcsetFor, CONTENT_SIZES } = require('../blog/images');

const PAGE_SIZE = 12;
const TTL = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
const { BASE } = seo;

const cache = new Map();
// After any blog write (admin, import): every cached page is rebuilt on its next request.
function invalidate() { cache.clear(); }

const PUBLIC_CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
const SHORT_CACHE = 'public, max-age=60';

function createBlogRouter({ repository = getBlogRepository(), admin = () => require('../blog/admin').getBlogAdmin(), websitePages = () => require('./pages').WEBSITE_PAGES || [], insertEvent = (...args) => require('../storage').insertEvent(...args) } = {}) {
  const router = express.Router();
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // { status, type, body, cacheControl, lastModified, location } built once per path.
  async function cached(key, build) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.value;
    const value = await build();
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value });
    return value;
  }
  function send(res, value) {
    if (value.location) return res.redirect(value.status || 301, value.location);
    res.status(value.status || 200).type(value.type || 'html');
    res.set('Cache-Control', value.cacheControl || PUBLIC_CACHE);
    if (value.lastModified) res.set('Last-Modified', new Date(value.lastModified).toUTCString());
    // Pages that must not be indexed say so in the header too (files that have no <head>).
    if (value.noindexHeader) res.set('X-Robots-Tag', 'noindex');
    res.send(value.body);
  }
  const serve = build => wrap(async (req, res) => send(res, await cached(req.path, () => build(req))));
  const latest = async () => (await repository.listPosts({ page: 1, size: 3 })).rows;
  const notFound = async () => ({ status: 404, cacheControl: SHORT_CACHE, body: render.errorPage(404, await latest()) });

  // One address per page: no trailing slash, lowercase.
  router.use(BASE, (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    const [path, query] = req.originalUrl.split(/\?(.*)/s);
    let clean = path.replace(/\/+$/, '') || '/';
    if (!/\.(md|xml)$/.test(clean)) clean = clean.toLowerCase();
    if (clean === path) return next();
    res.redirect(301, `${clean}${query ? `?${query}` : ''}`);
  });

  async function listing(req, { title, heading, description, path, filter = {}, crumbs, index = true, currentCategory, schema, intro }) {
    const page = Number(req.params.page || 1);
    if (req.params.page && (!Number.isInteger(page) || page < 2)) return { location: path };
    const { rows, total } = await repository.listPosts({ page, size: PAGE_SIZE, ...filter });
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) return notFound();
    const categories = await repository.categories();
    return {
      body: render.listPage({ title, heading, description, path: page > 1 ? `${path}/trang/${page}` : path, basePath: path, page, pages, posts: rows, crumbs, index, categories, currentCategory, schema, intro }),
      lastModified: rows.reduce((max, p) => (!max || new Date(p.modified_at) > new Date(max) ? p.modified_at : max), null),
    };
  }

  const blogHome = req => listing(req, {
    title: 'Blog', heading: `Blog ${seo.BRAND}`, path: BASE,
    description: `Bài viết về đầu tư, tư duy tài chính và xây dựng dòng tiền của ${seo.BRAND}.`,
    crumbs: [{ name: 'Trang chủ', path: '/' }, { name: 'Blog' }],
  });
  router.get(BASE, serve(blogHome));
  router.get(`${BASE}/trang/:page`, serve(blogHome));

  router.get(`${BASE}/feed.xml`, serve(async () => ({ type: 'application/rss+xml; charset=utf-8', body: feeds.rss(await repository.allPublic({ limit: 20 })) })));

  const category = async req => {
    const found = await repository.categoryBySlug(req.params.slug);
    if (!found) return notFound();
    const path = `${BASE}/chu-de/${found.slug}`;
    // A category with fewer than 3 posts is too thin to index.
    return listing(req, { title: found.seo_title || found.name, heading: found.name, description: found.meta_description || found.description, path, filter: { categoryId: found.id }, index: found.posts >= 3, currentCategory: found.slug,
      crumbs: [{ name: 'Trang chủ', path: '/' }, { name: 'Blog', path: BASE }, { name: found.name }] });
  };
  router.get(`${BASE}/chu-de/:slug`, serve(category));
  router.get(`${BASE}/chu-de/:slug/trang/:page`, serve(category));

  // Tag pages help readers but are never indexed (thin, overlapping lists).
  const tag = async req => {
    const found = await repository.tagBySlug(req.params.slug);
    if (!found) return notFound();
    return listing(req, { title: `#${found.name}`, heading: `Tag: ${found.name}`, path: `${BASE}/tag/${found.slug}`, filter: { tagId: found.id }, index: false,
      crumbs: [{ name: 'Trang chủ', path: '/' }, { name: 'Blog', path: BASE }, { name: `#${found.name}` }] });
  };
  router.get(`${BASE}/tag/:slug`, serve(tag));
  router.get(`${BASE}/tag/:slug/trang/:page`, serve(tag));

  const author = async req => {
    const found = await repository.authorBySlug(req.params.slug);
    if (!found) return notFound();
    const path = `${BASE}/tac-gia/${found.slug}`;
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return listing(req, { title: found.name, heading: found.name, description: found.bio || `Bài viết của ${found.name}.`, path, filter: { authorId: found.id },
      intro: `<p class="lead">${esc(found.job_title)}${found.job_title && found.bio ? '. ' : ''}${esc(found.bio)}</p>`,
      schema: seo.profilePage(found, path), crumbs: [{ name: 'Trang chủ', path: '/' }, { name: 'Blog', path: BASE }, { name: found.name }] });
  };
  router.get(`${BASE}/tac-gia/:slug`, serve(author));
  router.get(`${BASE}/tac-gia/:slug/trang/:page`, serve(author));

  // Preview link from the editor (signed, 24 h): the post with its unsaved draft, never cached or indexed.
  router.get(`${BASE}/xem-truoc/:token`, wrap(async (req, res) => {
    const id = admin().verifyPreview(req.params.token);
    const post = id ? await repository.postById(id) : null;
    res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex, nofollow');
    if (!post) return res.status(404).type('html').send(render.errorPage(404));
    const draft = (await admin().getPost(id)).draft || {};
    const shown = { ...post, ...Object.fromEntries(['title', 'cover_image', 'cover_alt', 'seo_title', 'meta_description', 'excerpt'].filter(k => draft[k] !== undefined).map(k => [k, draft[k]])) };
    const prepared = prepare(draft.html ?? (post.content_html || post.content), { srcsetFor, sizes: CONTENT_SIZES });
    res.type('html').send(render.postPage(shown, prepared, { preview: true }));
  }));

  // A post, or its Markdown copy (/blog/<slug>.md). Old slugs answer 301; archived posts 410.
  router.get(`${BASE}/:slug`, serve(async req => {
    const markdown = req.params.slug.endsWith('.md');
    const slug = markdown ? req.params.slug.slice(0, -3) : req.params.slug;
    if (slug !== slugify(slug)) return notFound();
    const post = await repository.postBySlug(slug);
    if (!post) {
      const renamed = await repository.renamedSlug(slug);
      return renamed ? { location: `${BASE}/${renamed}${markdown ? '.md' : ''}` } : notFound();
    }
    if (post.status === 'archived') return { status: 410, cacheControl: SHORT_CACHE, body: render.errorPage(410, await latest()) };
    if (!post.is_public) return notFound();
    const prepared = prepare(post.content_html || post.content, { srcsetFor, sizes: CONTENT_SIZES });
    if (markdown) {
      const header = `# ${post.title}\n\n${post.author_name ? `Tác giả: ${post.author_name} · ` : ''}${render.dateVi(post.published_at)} · ${seo.absolute(`${BASE}/${post.slug}`)}\n\n`;
      return { type: 'text/markdown; charset=utf-8', body: header + toMarkdown(prepared.html) + '\n', lastModified: post.modified_at, noindexHeader: true };
    }
    const [related, neighbours] = await Promise.all([repository.related(post, 3), repository.neighbours(post)]);
    return { body: render.postPage(post, prepared, { related, neighbours }), lastModified: post.modified_at };
  }));

  // Site-wide files.
  router.get('/robots.txt', serve(async () => ({ type: 'text/plain; charset=utf-8', body: feeds.robotsTxt(), cacheControl: 'public, max-age=3600' })));
  router.get('/sitemap.xml', serve(async () => ({ type: 'application/xml; charset=utf-8', body: feeds.sitemapIndex(['sitemap-pages.xml', 'sitemap-blog.xml']), cacheControl: 'public, max-age=3600' })));
  router.get('/sitemap-pages.xml', serve(async () => ({ type: 'application/xml; charset=utf-8', body: feeds.sitemapPages(websitePages()), cacheControl: 'public, max-age=3600' })));
  router.get('/sitemap-blog.xml', serve(async () => ({ type: 'application/xml; charset=utf-8', body: feeds.sitemapBlog(await repository.allPublic(), await repository.indexableTaxonomies()), cacheControl: 'public, max-age=3600' })));
  router.get('/llms.txt', serve(async () => ({ type: 'text/plain; charset=utf-8', body: feeds.llmsTxt(await repository.allPublic()), cacheControl: 'public, max-age=3600' })));

  // A read of a blog page (sent by the page itself, so cached copies and bots without
  // JavaScript are not counted). Kept in events only: no Meta, no GTM.
  router.post('/api/blog/view', express.json({ limit: '2kb', type: () => true }), wrap(async (req, res) => {
    const path = String(req.body?.path || '').slice(0, 300);
    if (!path.startsWith(BASE)) return res.status(204).end();
    const slug = path.split('/')[2] || '';
    await insertEvent({ event: 'pageview', session_id: '', timestamp: new Date().toISOString(),
      data: { page_id: 'blog', funnel_id: 'blog', url: path, post: /^[a-z0-9-]+$/.test(slug) && !['trang', 'chu-de', 'tag', 'tac-gia'].includes(slug) ? slug : '', referrer: String(req.body?.referrer || '').slice(0, 500) } }).catch(() => {});
    res.status(204).end();
  }));

  return router;
}

module.exports = { createBlogRouter, invalidate };
