// SEO of the blog pages (docs/blog-seo-plan.md §5): <head> tags and schema.org JSON-LD.
// Learned from Ghost (frontend/meta): fallbacks for every field, JSON-LD escaped against
// "</script>", previews and thin pages noindex.
//   BLOG_INDEXING=true  pages may be indexed (set at the domain move, roadmap 4.5); until then
//                       every blog page is "noindex, follow" and the blog sitemap is empty.
const { SITE_URL, absoluteUrl } = require('../site');
const { escapeHtml } = require('./content');

const BRAND = 'Phạm Thành Biên';
const BASE = '/blog';
const ORGANIZATION = {
  name: 'Công ty Cổ phần Tập đoàn VINMOC',
  logo: '/p/website/assets/wp-content/uploads/2019/11/logo-Ebila.png',
};
const DEFAULT_IMAGE = '/p/website/assets/wp-content/uploads/2019/11/ph%E1%BA%A1m-th%C3%A0nh-bi%C3%AAn.png';
const ICON = ORGANIZATION.logo;
const indexing = () => process.env.BLOG_INDEXING === 'true';

const INDEX = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const NOINDEX = 'noindex, follow';
const robots = index => (indexing() && index ? INDEX : NOINDEX);

const absolute = url => (!url ? '' : /^https?:\/\//.test(url) ? url : absoluteUrl(url));
// "Tiêu đề | Phạm Thành Biên", unless the title already names the brand.
const fullTitle = title => (String(title).includes(BRAND) ? String(title) : `${title} | ${BRAND}`);
// JSON inside <script>: "<" escaped so text can never close the tag.
const jsonLd = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, ch => `\\u${ch.charCodeAt(0).toString(16)}`)}</script>`;

/**
 * <head> content. page: { title, description, path, robots, image, imageAlt, type ('website' | 'article'),
 *   published, modified, section, tags, schema: [...], alternates: [{ type, href, title }] }
 */
function head(page) {
  const url = absoluteUrl(page.path);
  const canonical = absolute(page.canonical) || url;
  const image = absolute(page.image || DEFAULT_IMAGE);
  const meta = (name, content) => (content ? `<meta name="${name}" content="${escapeHtml(content)}">` : '');
  const prop = (property, content) => (content ? `<meta property="${property}" content="${escapeHtml(content)}">` : '');
  const iso = value => (value ? new Date(value).toISOString() : '');
  return [
    `<title>${escapeHtml(fullTitle(page.title))}</title>`,
    meta('description', page.description),
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    meta('robots', page.robots || NOINDEX),
    prop('og:locale', 'vi_VN'), prop('og:site_name', BRAND), prop('og:type', page.type || 'website'),
    prop('og:title', page.title), prop('og:description', page.description), prop('og:url', canonical),
    prop('og:image', image), prop('og:image:alt', page.imageAlt || page.title),
    ...(page.type === 'article' ? [prop('article:published_time', iso(page.published)), prop('article:modified_time', iso(page.modified)), prop('article:section', page.section),
      ...(page.tags || []).map(tag => prop('article:tag', tag))] : []),
    meta('twitter:card', 'summary_large_image'), meta('twitter:title', page.title), meta('twitter:description', page.description), meta('twitter:image', image),
    `<link rel="icon" href="${ICON}">`,
    `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(`Blog ${BRAND}`)}" href="${BASE}/feed.xml">`,
    ...(page.alternates || []).map(a => `<link rel="alternate" type="${a.type}" href="${escapeHtml(a.href)}"${a.title ? ` title="${escapeHtml(a.title)}"` : ''}>`),
    ...(page.schema || []).filter(Boolean).map(jsonLd),
  ].filter(Boolean).join('\n');
}

const organization = () => ({ '@type': 'Organization', name: ORGANIZATION.name, url: SITE_URL, logo: { '@type': 'ImageObject', url: absolute(ORGANIZATION.logo) } });
const authorUrl = slug => absoluteUrl(`${BASE}/tac-gia/${slug}`);
function person(author) {
  if (!author?.name) return undefined;
  const sameAs = Array.isArray(author.same_as) ? author.same_as.filter(Boolean) : [];
  return { '@type': 'Person', name: author.name, url: author.slug ? authorUrl(author.slug) : undefined, jobTitle: author.job_title || undefined,
    image: author.avatar ? absolute(author.avatar) : undefined, sameAs: sameAs.length ? sameAs : undefined, description: author.bio || undefined };
}
const breadcrumbs = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, ...(item.path ? { item: absoluteUrl(item.path) } : {}) })) });

function blogPosting(post, { url, description, image, words }) {
  return {
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: String(post.title).slice(0, 110), description, url, mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: image ? [absolute(image)] : undefined,
    datePublished: post.published_at ? new Date(post.published_at).toISOString() : undefined,
    dateModified: post.modified_at ? new Date(post.modified_at).toISOString() : undefined,
    author: person({ name: post.author_name, slug: post.author_slug, job_title: post.author_job_title, avatar: post.author_avatar, same_as: post.author_same_as, bio: post.author_bio }),
    publisher: organization(), inLanguage: 'vi-VN', wordCount: words || undefined,
    articleSection: post.category_name || undefined, keywords: (post.tags || []).map(t => t.name).join(', ') || undefined,
  };
}
const collection = (name, path, posts) => ({ '@context': 'https://schema.org', '@type': 'CollectionPage', name, url: absoluteUrl(path), inLanguage: 'vi-VN',
  mainEntity: { '@type': 'ItemList', itemListElement: posts.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: absoluteUrl(`${BASE}/${p.slug}`), name: p.title })) } });
const profilePage = (author, path) => ({ '@context': 'https://schema.org', '@type': 'ProfilePage', url: absoluteUrl(path), mainEntity: person(author) });

module.exports = { BRAND, BASE, ORGANIZATION, DEFAULT_IMAGE, INDEX, NOINDEX, indexing, robots, head, absolute, fullTitle, jsonLd, blogPosting, breadcrumbs, collection, profilePage, person, authorUrl };
