// The WordPress blog posts (docs/blog-seo-plan.md §7, B3), moved into the blog with their images
// and a 301 from every old address.
//   node scripts/wp-posts.cjs prepare <backup-db.gz> <out-dir>   (local: reads the UpdraftPlus
//        backup, downloads the images from phamthanhbien.com, makes WebP copies with sharp)
//   node scripts/wp-posts.cjs apply <out-dir> [--apply]           (on the server; dry run by default)
// prepare writes <out-dir>/posts.json and <out-dir>/files/cms-media/blog/wp/...; posts hold no
// personal data. apply copies the files into the storage folder, adds the posts that are not
// there yet (by wp_id, so it can run again), and the redirects (existing ones are left alone).
//
// Cleaning: WordPress block comments and shortcodes removed, classic posts split into paragraphs,
// headings shifted so the first level is H2 (the post title is the H1), a missing space after a
// full stop restored, links to other posts → /blog/<slug>, links to the site → relative paths,
// images → the copies in /storage (the original size, not WordPress's resized ones).
// Quality (plan §7): posts under 400 words are noindex until rewritten; "platinum" (a newsletter
// sign-up page, not a post) redirects to /trading; a post whose content is empty in the database
// (built with Thrive) takes its latest revision.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { tuples } = require('./wp-leads.cjs');
const { slugify } = require('../src/blog/slug');

const SITE = 'https://phamthanhbien.com';
const UPLOADS = `${SITE}/wp-content/uploads/`;
const STORE_PREFIX = 'blog/wp';
const PUBLIC_PREFIX = '/storage/cms-media';
const META_KEYS = ['_thumbnail_id', '_wp_attached_file', '_wp_attachment_image_alt', '_yoast_wpseo_metadesc', '_yoast_wpseo_title', '_yoast_wpseo_focuskw'];
const TABLES = ['wp_posts', 'wp_terms', 'wp_term_taxonomy', 'wp_term_relationships'];
const NOT_POSTS = { platinum: '/trading' };
const NOINDEX_UNDER = 400;
const AUTHOR_PATHS = ['/author/bienpt', '/author/admin'];

const unescapeSql = value => value.replace(/\\(.)/g, (all, ch) => ({ n: '\n', r: '\r', t: '\t', 0: '\0' }[ch] ?? ch));
const decodeEntities = text => String(text || '').replace(/&#0?38;|&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#8216;|&#8217;/g, '’').replace(/&#8220;|&#8221;/g, '"').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&nbsp;/g, ' ');

// ── Reading the dump ──
async function readDump(file) {
  const cols = {}, rows = Object.fromEntries(TABLES.map(t => [t, []])), meta = [];
  const metaRow = new RegExp(`\\((\\d+),(\\d+),'(${META_KEYS.join('|')})',(NULL|'(?:[^'\\\\]|\\\\.)*')\\)`, 'g');
  const input = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let table = null, current = null, buffer = [];
  const flush = () => { for (const t of tuples(buffer.join('\n'))) rows[current].push(Object.fromEntries(cols[current].map((c, i) => [c, t[i]]))); current = null; buffer = []; };
  for await (const line of input) {
    if (current) {
      if (/^(INSERT INTO|CREATE TABLE|DROP TABLE|\/\*|LOCK TABLES|UNLOCK)/.test(line)) flush();
      else { buffer.push(line); if (/\);\s*$/.test(line)) flush(); continue; }
    }
    const created = /^CREATE TABLE `([a-z0-9_]+)`/.exec(line);
    if (created) { table = created[1]; cols[table] = []; continue; }
    if (table) {
      const column = /^\s+`([a-zA-Z0-9_]+)`/.exec(line);
      if (column) { cols[table].push(column[1]); continue; }
      if (/^\)/.test(line)) table = null;
    }
    if (line.startsWith('INSERT INTO `wp_postmeta`')) {
      for (const m of line.matchAll(metaRow)) meta.push({ post_id: m[2], key: m[3], value: m[4] === 'NULL' ? '' : unescapeSql(m[4].slice(1, -1)) });
      continue;
    }
    const insert = /^INSERT INTO `([a-z0-9_]+)` VALUES /.exec(line);
    if (insert && rows[insert[1]]) {
      current = insert[1];
      buffer = [line.slice(insert[0].length)];
      if (/\);\s*$/.test(line)) flush();
    }
  }
  if (current) flush();
  return { rows, meta };
}

// ── Cleaning ──
function autop(html) {
  return html.replace(/\r/g, '').split(/\n\s*\n/).map(block => {
    const text = block.trim();
    if (!text) return '';
    return /^<(h[1-6]|ul|ol|blockquote|table|figure|div|p|pre)\b/i.test(text) ? text : `<p>${text.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}

function cleanContent(raw, { postSlugs, images }) {
  let html = String(raw || '').replace(/<!--\s*\/?wp:[^]*?-->/g, '');
  html = html.replace(/\[caption[^\]]*\]([^]*?)\[\/caption\]/g, (all, inner) => {
    const img = (/<img\b[^>]*>/i.exec(inner) || [''])[0];
    const caption = inner.replace(/<a\b[^>]*>\s*<img\b[^>]*>\s*<\/a>|<img\b[^>]*>/i, '').trim();
    return `<figure>${img}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
  });
  html = html.replace(/\[embed\]\s*(\S+?)\s*\[\/embed\]/g, (all, url) => `<p>${url}</p>`);
  html = html.replace(/\[\/?[a-z][a-z0-9_-]*(?:\s[^\]]*)?\]/gi, '');
  if (!/<p[\s>]/i.test(html)) html = autop(html);
  // A YouTube link alone on its line becomes an embed (as WordPress showed it).
  html = html.replace(/<p>\s*(?:<a [^>]*>)?\s*(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})\S*?)\s*(?:<\/a>)?\s*<\/p>/g, (all, url, id) => `<iframe src="https://www.youtube.com/embed/${id}"></iframe>`);
  // Headings in order: the first level becomes H2 and none goes more than one level deeper
  // than the one before (an H3 before any H2 becomes an H2).
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map(m => Number(m[1])).filter(l => l > 1);
  const shift = levels.length ? Math.min(...levels) - 2 : 0;
  let previous = 1;
  html = html.replace(/<h([1-6])\b([^>]*)>([^]*?)<\/h\1>/gi, (all, level, attrs, inner) => {
    const next = Math.max(2, Math.min(4, Number(level) - shift, previous + 1));
    previous = next;
    return `<h${next}${attrs}>${inner}</h${next}>`;
  });
  // Text only, spaces the source lost: "ông.Tuy", "rồi?Với", "to:“Đi", "đi!”Người".
  const UPPER = 'A-ZÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴ';
  html = html.replace(/>([^<]+)</g, (all, text) => `>${text
    .replace(new RegExp(`([^\\s\\d])([.?!…]+)([“"${UPPER}])`, 'g'), '$1$2 $3')
    .replace(new RegExp(`([:;])([“${UPPER}])`, 'g'), '$1 $2')
    .replace(/”(?=[\p{L}\p{N}])/gu, '” ')}<`);
  // Links to this site: other posts → /blog/<slug>, the rest relative.
  html = html.replace(/href="(?:https?:)?\/\/(?:www\.)?phamthanhbien\.com(\/[^"]*)?"/gi, (all, rawPath = '/') => {
    const [p, rest = ''] = rawPath.split(/(?=[?#])/);
    const slug = p.replace(/^\/|\/$/g, '');
    if (postSlugs.has(slug)) return `href="/blog/${slug}${rest}"`;
    return `href="${p.replace(/\/$/, '') || '/'}${rest}"`;
  });
  // Images: the stored copies; srcset/sizes of WordPress are dropped (the blog makes its own).
  html = html.replace(/<img\b[^>]*>/gi, tag => {
    const src = (/\bsrc="([^"]+)"/i.exec(tag) || [])[1] || '';
    const local = images.get(originalOf(uploadPath(src)));
    if (!local) return tag.replace(/\s(srcset|sizes)="[^"]*"/gi, '');
    const alt = (/\balt="([^"]*)"/i.exec(tag) || [])[1] || '';
    return `<img src="${local.url}" alt="${alt}"${local.width ? ` width="${local.width}" height="${local.height}"` : ''}>`;
  });
  return html.trim();
}

// The original of a resized WordPress copy: "2021/10/name-1024x768.jpg" → "2021/10/name.jpg".
const originalOf = rel => rel.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1');

// "2021/10/name-1024x768.jpg" for any URL of the WordPress uploads, else ''.
function uploadPath(url) {
  const m = /\/wp-content\/uploads\/([^"?#\s]+\.(?:jpe?g|png|gif|webp))/i.exec(String(url || ''));
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

// ── Images ──
async function fetchImage(rel) {
  for (const candidate of [...new Set([originalOf(rel), rel])]) {
    const response = await fetch(UPLOADS + candidate.split('/').map(encodeURIComponent).join('/')).catch(() => null);
    if (response?.ok && /^image\//.test(response.headers.get('content-type') || '')) return { buffer: Buffer.from(await response.arrayBuffer()), rel: candidate };
  }
  return null;
}

async function storeImage(rel, outDir, sharp) {
  // Named after the original, so two sizes of one image never make two files.
  const parts = originalOf(rel).split('/');
  const file = parts.pop();
  const ext = path.extname(file).toLowerCase().replace('.jpeg', '.jpg');
  // Short names: readable, and well under path length limits (Windows).
  const name = `${slugify(path.basename(file, path.extname(file)), 50) || 'anh'}${ext}`;
  const storeRel = [STORE_PREFIX, ...parts.filter(p => /^\d+$/.test(p)), name].join('/');
  const target = path.join(outDir, 'files', 'cms-media', ...storeRel.split('/'));
  const url = `${PUBLIC_PREFIX}/${storeRel}`;
  let buffer;
  if (fs.existsSync(target)) buffer = fs.readFileSync(target);
  else {
    const fetched = await fetchImage(rel);
    if (!fetched) return null;
    buffer = fetched.buffer;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
  }
  const info = await sharp(buffer).metadata().catch(() => ({}));
  if (ext !== '.gif') {
    for (const size of [640, 1280]) {
      const copy = target.replace(/\.[a-z]+$/, `-${size}.webp`);
      if ((info.width || 0) >= size && !fs.existsSync(copy)) await sharp(buffer).resize(size).webp({ quality: 80 }).toFile(copy);
    }
  }
  return { url, width: info.width || null, height: info.height || null, bytes: buffer.length };
}

// ── prepare ──
async function prepare(backup, outDir) {
  const sharp = require('sharp');
  const { prepare: render } = require('../src/blog/content');
  const { rows, meta } = await readDump(backup);
  const metaOf = (id, key) => (meta.find(m => m.post_id === String(id) && m.key === key) || {}).value || '';
  const all = rows.wp_posts;
  const published = all.filter(p => p.post_type === 'post' && p.post_status === 'publish');
  const posts = published.filter(p => !NOT_POSTS[p.post_name]);
  const postSlugs = new Set(posts.map(p => p.post_name));
  const terms = new Map(rows.wp_terms.map(t => [t.term_id, t]));
  const taxonomy = new Map(rows.wp_term_taxonomy.map(t => [t.term_taxonomy_id, t]));
  const categoryOf = id => rows.wp_term_relationships.filter(r => r.object_id === String(id)).map(r => taxonomy.get(r.term_taxonomy_id))
    .filter(t => t && t.taxonomy === 'category').map(t => terms.get(t.term_id)).find(t => t && !/uncategorized|chua-phan-loai/.test(t.slug)) || null;
  const variables = text => /%%[a-z_]+%%/i.test(text);

  // Content (an empty one takes the latest revision with text), then every image it uses.
  const sources = posts.map(p => {
    let content = p.post_content;
    if (!String(content).trim()) {
      const revision = all.filter(r => r.post_parent === p.ID && r.post_type === 'revision' && String(r.post_content).trim()).sort((a, b) => String(b.post_modified).localeCompare(String(a.post_modified)))[0];
      content = revision?.post_content || '';
    }
    const thumbId = metaOf(p.ID, '_thumbnail_id');
    return { post: p, content, thumbRel: thumbId ? metaOf(thumbId, '_wp_attached_file') : '', thumbAlt: thumbId ? metaOf(thumbId, '_wp_attachment_image_alt') : '' };
  });
  // One download per image: every resized copy a post uses maps to its original.
  const wanted = new Map();
  const want = rel => { if (rel && !wanted.has(originalOf(rel))) wanted.set(originalOf(rel), rel); };
  for (const s of sources) {
    for (const m of String(s.content).matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) want(uploadPath(m[1]));
    want(s.thumbRel);
  }
  const images = new Map();
  const missing = [];
  for (const [key, rel] of wanted) {
    const stored = await storeImage(rel, outDir, sharp);
    if (stored) images.set(key, stored); else missing.push(rel);
  }

  const result = sources.map(({ post: p, content, thumbRel, thumbAlt }) => {
    const title = decodeEntities(p.post_title).trim();
    const html = cleanContent(content, { postSlugs, images });
    const { words } = render(html);
    const gmt = d => (d && !d.startsWith('0000') ? new Date(`${d.replace(' ', 'T')}Z`) : null);
    const publishedAt = gmt(p.post_date_gmt) || new Date(new Date(`${p.post_date.replace(' ', 'T')}Z`).getTime() - 7 * 3600000);
    const modifiedAt = gmt(p.post_modified_gmt);
    const yoastTitle = metaOf(p.ID, '_yoast_wpseo_title'), yoastDesc = metaOf(p.ID, '_yoast_wpseo_metadesc');
    const category = categoryOf(p.ID);
    const cover = thumbRel ? images.get(originalOf(thumbRel)) : null;
    return {
      wp_id: Number(p.ID), slug: p.post_name, title, html, words,
      excerpt: decodeEntities(p.post_excerpt).trim(),
      seo_title: yoastTitle && !variables(yoastTitle) ? decodeEntities(yoastTitle).trim() : '',
      meta_description: yoastDesc && !variables(yoastDesc) ? decodeEntities(yoastDesc).trim() : '',
      focus_keyword: decodeEntities(metaOf(p.ID, '_yoast_wpseo_focuskw')).trim(),
      published_at: publishedAt.toISOString(),
      content_updated_at: modifiedAt && modifiedAt - publishedAt > 86400000 ? modifiedAt.toISOString() : null,
      category: category ? { slug: category.slug, name: decodeEntities(category.name) } : null,
      cover_image: cover?.url || '', cover_width: cover?.width || null, cover_height: cover?.height || null,
      cover_alt: cover ? (decodeEntities(thumbAlt).trim() || title) : '',
      robots: words < NOINDEX_UNDER ? 'noindex' : 'index',
    };
  });
  const redirects = [
    ...result.map(p => ({ source: `/${p.slug}`, target: `/blog/${p.slug}`, title: p.title })),
    ...Object.entries(NOT_POSTS).filter(([slug]) => published.some(p => p.post_name === slug)).map(([slug, target]) => ({ source: `/${slug}`, target, title: 'Bài WordPress không chuyển (không phải bài viết)' })),
    ...[...new Set(result.map(p => p.category?.slug).filter(Boolean))].map(slug => ({ source: `/category/${slug}`, target: `/blog/chu-de/${slug}`, title: 'Chuyên mục WordPress' })),
    ...AUTHOR_PATHS.map(source => ({ source, target: '/blog/tac-gia/pham-thanh-bien', title: 'Trang tác giả WordPress' })),
    { source: '/feed', target: '/blog/feed.xml', title: 'RSS WordPress' },
    { source: '/blog/page/2', target: '/blog/trang/2', title: 'Trang 2 của blog WordPress' },
  ];
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'posts.json'), JSON.stringify({ prepared_at: new Date().toISOString(), posts: result, redirects }, null, 2));

  console.log(`Bài: ${result.length} (bỏ qua: ${Object.keys(NOT_POSTS).join(', ')}) · ảnh: ${images.size} (${Math.round([...images.values()].reduce((s, i) => s + i.bytes, 0) / 1024)} KB gốc), thiếu: ${missing.length}`);
  for (const rel of missing) console.log(`  ảnh không tải được: ${rel}`);
  for (const p of result) console.log(`  ${p.robots === 'noindex' ? 'NOINDEX' : 'index  '} ${String(p.words).padStart(5)} chữ  ${p.cover_image ? 'bìa ✓' : 'bìa –'}  ${p.meta_description ? 'mô tả ✓' : 'mô tả –'}  /blog/${p.slug}`);
  console.log(`Redirect: ${redirects.length}. Đã ghi ${path.join(outDir, 'posts.json')}.`);
}

// ── apply ──
async function apply(outDir, { write = false } = {}) {
  // Run from the app folder: its .env gives DATABASE_URL and STORAGE_ROOT.
  require('dotenv').config();
  const { pool } = require('../src/db');
  const { sanitize, prepare: render } = require('../src/blog/content');
  const { getRedirectStore, validateInput, sourceKey } = require('../src/redirects');
  const storageRoot = path.resolve(process.env.STORAGE_ROOT || path.join(__dirname, '..', 'storage'));
  const { posts, redirects } = JSON.parse(fs.readFileSync(path.join(outDir, 'posts.json'), 'utf8'));
  const q = (sql, params) => pool.query(sql, params).then(r => r.rows);

  // Files: copied unless the same size is there already.
  const filesRoot = path.join(outDir, 'files');
  let copied = 0, kept = 0;
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const file of fs.existsSync(filesRoot) ? walk(filesRoot) : []) {
    const target = path.join(storageRoot, path.relative(filesRoot, file));
    if (fs.existsSync(target) && fs.statSync(target).size === fs.statSync(file).size) { kept++; continue; }
    if (write) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(file, target); }
    copied++;
  }

  const author = (await q(`select id from public.blog_authors where slug = 'pham-thanh-bien'`))[0]?.id || null;
  let added = 0, skipped = 0;
  for (const p of posts) {
    const exists = (await q(`select 1 from public.blog_posts where wp_id = $1 or slug = $2`, [p.wp_id, p.slug])).length;
    if (exists) { skipped++; continue; }
    if (!write) { added++; continue; }
    let categoryId = null;
    if (p.category) {
      categoryId = (await q(`select id from public.blog_categories where slug = $1`, [p.category.slug]))[0]?.id
        || (await q(`insert into public.blog_categories (slug, name) values ($1, $2) returning id`, [p.category.slug, p.category.name]))[0].id;
    }
    const html = sanitize(p.html);
    const { words, minutes } = render(html);
    const [row] = await q(`insert into public.blog_posts (title, slug, content, content_html, excerpt, status, published_at, content_updated_at, author_id, category_id,
        cover_image, cover_alt, cover_width, cover_height, seo_title, meta_description, focus_keyword, robots, word_count, reading_minutes, wp_id, version)
      values ($1, $2, $3, $3, $4, 'published', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 1) returning *`,
      [p.title, p.slug, html, p.excerpt, p.published_at, p.content_updated_at, author, categoryId, p.cover_image, p.cover_alt, p.cover_width, p.cover_height,
        p.seo_title, p.meta_description, p.focus_keyword, p.robots, words, minutes, p.wp_id]);
    await q(`insert into public.blog_revisions (post_id, data, by_email) values ($1, $2, 'wp-posts import')`, [row.id, JSON.stringify(row)]);
    added++;
  }

  const store = getRedirectStore();
  const existing = new Set((await store.list()).filter(r => r.enabled).map(r => r.source_key));
  let redirectsAdded = 0;
  const redirectsKept = [];
  for (const r of redirects) {
    if (existing.has(sourceKey(r.source))) { redirectsKept.push(r.source); continue; }
    if (write) await store.create(validateInput({ source: r.source, target: r.target, code: 301, query_mode: 'pass', enabled: true, group_name: 'Blog (WordPress)', title: r.title.slice(0, 200), note: 'scripts/wp-posts.cjs' }), { by: 'wp-posts import' });
    redirectsAdded++;
  }
  if (write) { try { require('../src/routes/blog').invalidate(); } catch { /* another process: pages refresh within 10 minutes */ } }
  console.log(`${write ? 'ĐÃ GHI' : 'CHẠY THỬ (thêm --apply để ghi)'}: bài thêm ${added}, đã có ${skipped} · file chép ${copied}, đã có ${kept} · redirect thêm ${redirectsAdded}, đã có ${redirectsKept.length}${redirectsKept.length ? ` (${redirectsKept.join(', ')})` : ''}.`);
  await pool.end();
}

async function main() {
  const [command, a, b] = process.argv.slice(2);
  if (command === 'prepare' && a && b) return prepare(a, b);
  if (command === 'apply' && a) return apply(a, { write: process.argv.includes('--apply') });
  console.error('Usage: node scripts/wp-posts.cjs prepare <backup-db.gz> <out-dir> | apply <out-dir> [--apply]');
  process.exit(2);
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });

module.exports = { cleanContent, uploadPath, originalOf, autop };
