// Blog editing (docs/blog-seo-plan.md §6): what the admin Blog screens call.
// Saving a post: HTML cleaned (src/blog/content.js), words counted, SEO errors block publishing
// (src/blog/seoRules.js), a renamed public slug keeps answering (301), the "updated" date moves
// only when the text changes, a revision is kept (latest 50), cached pages are rebuilt.
// Autosave writes `draft` only: a published post changes only when it is saved again.
const crypto = require('crypto');
const { pool } = require('../db');
const { prepare, sanitize } = require('./content');
const { slugify } = require('./slug');
const { analyze } = require('./seoRules');
const { OWN_HOSTS } = require('../site');

const MAX_REVISIONS = 50;
const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const clip = (value, max) => String(value ?? '').trim().slice(0, max);
const STATUSES = ['draft', 'scheduled', 'published', 'archived'];
const previewSecret = () => process.env.BLOG_PREVIEW_SECRET || process.env.JWT_SECRET || process.env.ADMIN_COOKIE_SECRET || 'local-blog-preview';

function createBlogAdmin({ database = pool, invalidate = () => require('../routes/blog').invalidate(), storage = () => require('../storage').supabase.storage.from('cms-media') } = {}) {
  const q = (sql, params = []) => database.query(sql, params).then(r => r.rows);
  const one = async (sql, params) => (await q(sql, params))[0] || null;

  async function inTransaction(fn) {
    const client = await database.connect();
    try { await client.query('begin'); const result = await fn((text, params) => client.query(text, params).then(r => r.rows)); await client.query('commit'); return result; }
    catch (error) { await client.query('rollback').catch(() => {}); throw error; }
    finally { client.release?.(); }
  }

  // ── Posts ──
  async function listPosts({ status = '', category = '', q: search = '', page = 1, size = 30 } = {}) {
    const where = ['true'], params = [];
    if (STATUSES.includes(status)) { params.push(status); where.push(`p.status = $${params.length}`); }
    if (category) { params.push(category); where.push(`p.category_id = $${params.length}`); }
    if (search) { params.push(`%${String(search).toLowerCase().replace(/[\\%_]/g, ch => `\\${ch}`)}%`); where.push(`(lower(p.title) like $${params.length} or p.slug like $${params.length})`); }
    const [{ total }] = await q(`select count(*)::int as total from public.blog_posts p where ${where.join(' and ')}`, params);
    params.push(size, (Math.max(1, Number(page) || 1) - 1) * size);
    const rows = await q(`select p.id, p.title, p.slug, p.status, p.content_html, p.content, p.cover_image, p.cover_alt, p.seo_title, p.meta_description, p.focus_keyword, p.robots,
        coalesce(p.published_at, p.scheduled_at) as published_at, p.scheduled_at, p.updated_at, p.draft_saved_at, p.word_count, c.name as category_name, a.name as author_name
      from public.blog_posts p left join public.blog_categories c on c.id = p.category_id left join public.blog_authors a on a.id = p.author_id
      where ${where.join(' and ')} order by p.updated_at desc limit $${params.length - 1} offset $${params.length}`, params);
    const views = await q(`select data->>'post' as slug, count(*)::int as n from public.events where page_id = 'blog' and event = 'pageview' and event_timestamp > now() - interval '30 days' and data->>'post' = any($1::text[]) group by 1`, [rows.map(r => r.slug)]).catch(() => []);
    return {
      total,
      rows: rows.map(({ content_html, content, ...row }) => {
        const result = analyze({ ...row, html: content_html || content }, { siteHosts: OWN_HOSTS });
        return { ...row, seo_score: result.score, seo_errors: result.errors, views_30d: views.find(v => v.slug === row.slug)?.n || 0 };
      }),
    };
  }

  async function getPost(id) {
    const post = await one(`select p.*, (select count(*)::int from public.blog_revisions r where r.post_id = p.id) as revisions from public.blog_posts p where p.id = $1`, [id]);
    if (!post) throw fail(404, 'Không tìm thấy bài viết.');
    post.tags = (await q(`select t.id, t.slug, t.name from public.blog_post_tags pt join public.blog_tags t on t.id = pt.tag_id where pt.post_id = $1 order by t.name`, [id]));
    post.html = post.content_html || post.content;
    return post;
  }

  // A slug free for this post: not another post's, not another post's old address.
  async function freeSlug(base, postId = null) {
    const root = slugify(base) || 'bai-viet';
    for (let n = 1; n < 200; n++) {
      const slug = n === 1 ? root : `${root}-${n}`;
      const taken = await one(`select 1 from public.blog_posts where slug = $1 and id is distinct from $2::uuid union all select 1 from public.blog_slug_history where slug = $1 and post_id is distinct from $2::uuid limit 1`, [slug, postId]);
      if (!taken) return slug;
    }
    throw fail(409, 'Không tìm được đường dẫn trống.');
  }

  async function createPost({ title = 'Bài viết mới' } = {}) {
    const defaults = await one(`select (select id from public.blog_authors order by created_at limit 1) as author_id, (select id from public.blog_categories order by position, created_at limit 1) as category_id`);
    const slug = await freeSlug(title);
    return one(`insert into public.blog_posts (title, slug, status, author_id, category_id) values ($1, $2, 'draft', $3, $4) returning id, slug`, [clip(title, 300) || 'Bài viết mới', slug, defaults.author_id, defaults.category_id]);
  }

  async function autosave(id, draft) {
    const row = await one(`update public.blog_posts set draft = $2, draft_saved_at = now() where id = $1 returning draft_saved_at`, [id, JSON.stringify(draft || {})]);
    if (!row) throw fail(404, 'Không tìm thấy bài viết.');
    return row;
  }
  async function discardDraft(id) { await q(`update public.blog_posts set draft = null, draft_saved_at = null where id = $1`, [id]); }

  async function keywordUsage(keyword, excludeId) {
    if (!String(keyword || '').trim()) return [];
    return (await q(`select title from public.blog_posts where lower(focus_keyword) = lower($1) and id is distinct from $2::uuid and status <> 'archived' order by updated_at desc limit 5`, [String(keyword).trim(), excludeId || null])).map(r => r.title);
  }

  /**
   * Save the editor's fields. action: 'save' (keep status), 'publish', 'schedule', 'unpublish' (→ draft).
   * expectedVersion: the version the editor loaded; another one means someone else saved (409).
   */
  async function savePost(id, input = {}, { action = 'save', expectedVersion = null, by = '' } = {}) {
    const current = await getPost(id);
    if (expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== Number(current.version)) {
      throw fail(409, 'Bài này vừa được lưu ở nơi khác. Tải lại để xem bản mới trước khi lưu.', { code: 'conflict' });
    }
    const title = clip(input.title ?? current.title, 300);
    const slug = slugify(input.slug ?? current.slug);
    // Stored cleaned only; anchors, lazy images and YouTube previews are added when shown
    // (src/blog/content.js prepare), so editing the post again gets the plain HTML back.
    const html = sanitize(input.html ?? current.html);
    const fields = {
      title, slug, content_html: html, content: html,
      content_json: input.content_json === undefined ? current.content_json : input.content_json,
      excerpt: clip(input.excerpt ?? current.excerpt, 500),
      cover_image: clip(input.cover_image ?? current.cover_image, 2048), cover_alt: clip(input.cover_alt ?? current.cover_alt, 300),
      cover_width: Number(input.cover_width ?? current.cover_width) || null, cover_height: Number(input.cover_height ?? current.cover_height) || null,
      seo_title: clip(input.seo_title ?? current.seo_title, 200), meta_description: clip(input.meta_description ?? current.meta_description, 400),
      focus_keyword: clip(input.focus_keyword ?? current.focus_keyword, 120), canonical_url: clip(input.canonical_url ?? current.canonical_url, 2048),
      robots: (input.robots ?? current.robots) === 'noindex' ? 'noindex' : 'index', og_image: clip(input.og_image ?? current.og_image, 2048),
      category_id: (input.category_id ?? current.category_id) || null, author_id: (input.author_id ?? current.author_id) || null,
    };
    if (fields.canonical_url && !/^https?:\/\//.test(fields.canonical_url)) throw fail(400, 'Canonical phải là địa chỉ đầy đủ (https://...).');
    const { words, minutes } = prepare(html);
    let status = current.status, publishedAt = current.published_at, scheduledAt = current.scheduled_at;
    if (action === 'publish') { status = 'published'; publishedAt = input.published_at ? new Date(input.published_at) : current.published_at || new Date(); scheduledAt = null; }
    if (action === 'schedule') {
      const at = new Date(input.scheduled_at || 0);
      if (!(at.getTime() > Date.now())) throw fail(400, 'Chọn thời điểm đăng trong tương lai.');
      status = 'scheduled'; scheduledAt = at; publishedAt = null;
    }
    if (action === 'unpublish') { status = 'draft'; scheduledAt = null; }
    const going = status === 'published' || status === 'scheduled';
    const report = analyze({ ...fields, html }, { siteHosts: OWN_HOSTS });
    const blocking = report.checks.filter(c => c.level === 'error' && (going || ['title', 'slug'].includes(c.id)));
    if (blocking.length) throw fail(422, blocking.map(c => c.message).join(' '), { code: 'seo_errors', checks: blocking });
    const slugOwner = await one(`select 'post' as kind from public.blog_posts where slug = $1 and id <> $2 union all select 'old' from public.blog_slug_history where slug = $1 and post_id <> $2 limit 1`, [slug, id]);
    if (slugOwner) throw fail(409, slugOwner.kind === 'post' ? 'Đường dẫn này đã có bài khác dùng.' : 'Đường dẫn này từng là địa chỉ của bài khác (đang chuyển hướng về bài đó).', { code: 'slug_taken' });
    const wasPublic = current.status === 'published' || (current.status === 'scheduled' && current.scheduled_at && new Date(current.scheduled_at) <= new Date());
    const textChanged = html !== (current.content_html || current.content) || title !== current.title;

    const saved = await inTransaction(async run => {
      if (slug !== current.slug) {
        await run(`delete from public.blog_slug_history where slug = $1 and post_id = $2`, [slug, id]);
        // The old address of a post readers could reach keeps working (301 to the new one).
        if (wasPublic) await run(`insert into public.blog_slug_history (slug, post_id) values ($1, $2) on conflict (slug) do nothing`, [current.slug, id]);
      }
      const [row] = await run(`update public.blog_posts set title = $2, slug = $3, content_html = $4, content = $5, content_json = $6, excerpt = $7, cover_image = $8, cover_alt = $9,
          cover_width = $10, cover_height = $11, seo_title = $12, meta_description = $13, focus_keyword = $14, canonical_url = $15, robots = $16, og_image = $17,
          category_id = $18, author_id = $19, status = $20, published_at = $21, scheduled_at = $22, word_count = $23, reading_minutes = $24,
          content_updated_at = case when $25 then now() else content_updated_at end, draft = null, draft_saved_at = null, version = version + 1, updated_at = now()
        where id = $1 returning *`, [id, fields.title, fields.slug, fields.content_html, fields.content, fields.content_json ? JSON.stringify(fields.content_json) : null, fields.excerpt, fields.cover_image, fields.cover_alt,
        fields.cover_width, fields.cover_height, fields.seo_title, fields.meta_description, fields.focus_keyword, fields.canonical_url, fields.robots, fields.og_image,
        fields.category_id, fields.author_id, status, publishedAt, scheduledAt, words, minutes, wasPublic && textChanged]);
      if (Array.isArray(input.tags)) {
        await run(`delete from public.blog_post_tags where post_id = $1`, [id]);
        for (const name of [...new Set(input.tags.map(t => clip(t, 60)).filter(Boolean))].slice(0, 20)) {
          const tagSlug = slugify(name);
          if (!tagSlug) continue;
          const [tag] = await run(`insert into public.blog_tags (slug, name) values ($1, $2) on conflict (slug) do update set slug = excluded.slug returning id`, [tagSlug, name]);
          await run(`insert into public.blog_post_tags (post_id, tag_id) values ($1, $2) on conflict do nothing`, [id, tag.id]);
        }
      }
      const { draft, ...snapshot } = row;
      await run(`insert into public.blog_revisions (post_id, data, by_email) values ($1, $2, $3)`, [id, JSON.stringify({ ...snapshot, tags: input.tags || current.tags.map(t => t.name) }), clip(by, 200)]);
      await run(`delete from public.blog_revisions where post_id = $1 and id not in (select id from public.blog_revisions where post_id = $1 order by created_at desc, id desc limit ${MAX_REVISIONS})`, [id]);
      return row;
    });
    invalidate();
    return { post: await getPost(saved.id), checks: report.checks, score: report.score };
  }

  // Archived posts answer 410; drafts never published are removed for good.
  async function removePost(id) {
    const post = await one(`select status, published_at from public.blog_posts where id = $1`, [id]);
    if (!post) throw fail(404, 'Không tìm thấy bài viết.');
    if (post.published_at || post.status === 'published') await q(`update public.blog_posts set status = 'archived', updated_at = now() where id = $1`, [id]);
    else await q(`delete from public.blog_posts where id = $1`, [id]);
    invalidate();
    return { archived: !!(post.published_at || post.status === 'published') };
  }

  const revisions = id => q(`select id, by_email, created_at, data->>'title' as title, data->>'status' as status, (data->>'word_count')::int as word_count from public.blog_revisions where post_id = $1 order by created_at desc, id desc`, [id]);
  async function revision(id, revisionId) {
    const row = await one(`select data, created_at, by_email from public.blog_revisions where post_id = $1 and id = $2`, [id, revisionId]);
    if (!row) throw fail(404, 'Không tìm thấy bản lưu.');
    return { ...row.data, html: row.data.content_html || row.data.content, revision_at: row.created_at, revision_by: row.by_email };
  }

  // ── Preview links: a signed token, valid 24 hours, showing the unsaved draft too ──
  function previewToken(id, hours = 24) {
    const exp = Math.floor(Date.now() / 1000) + hours * 3600;
    const sig = crypto.createHmac('sha256', previewSecret()).update(`${id}.${exp}`).digest('base64url').slice(0, 32);
    return `${id}.${exp}.${sig}`;
  }
  function verifyPreview(token) {
    const [id, exp, sig] = String(token || '').split('.');
    if (!id || !exp || !sig || Number(exp) < Date.now() / 1000) return null;
    const expected = crypto.createHmac('sha256', previewSecret()).update(`${id}.${exp}`).digest('base64url').slice(0, 32);
    return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? id : null;
  }

  // ── Categories, tags, authors ──
  const categories = () => q(`select c.*, (select count(*)::int from public.blog_posts p where p.category_id = c.id and p.status <> 'archived') as posts from public.blog_categories c order by c.position, c.name`);
  async function saveCategory(id, input) {
    const name = clip(input.name, 120);
    if (!name) throw fail(400, 'Chuyên mục cần có tên.');
    const slug = slugify(input.slug || name);
    const values = [name, slug, clip(input.description, 1000), clip(input.seo_title, 200), clip(input.meta_description, 400), Number(input.position) || 0];
    try {
      const row = id ? await one(`update public.blog_categories set name = $2, slug = $3, description = $4, seo_title = $5, meta_description = $6, position = $7, updated_at = now() where id = $1 returning *`, [id, ...values])
        : await one(`insert into public.blog_categories (name, slug, description, seo_title, meta_description, position) values ($1, $2, $3, $4, $5, $6) returning *`, values);
      invalidate();
      return row;
    } catch (error) { if (error.code === '23505') throw fail(409, 'Đường dẫn chuyên mục đã có.'); throw error; }
  }
  async function removeCategory(id) {
    await q(`update public.blog_posts set category_id = null where category_id = $1`, [id]);
    await q(`delete from public.blog_categories where id = $1`, [id]);
    invalidate();
  }

  const tags = () => q(`select t.*, (select count(*)::int from public.blog_post_tags pt where pt.tag_id = t.id) as posts from public.blog_tags t order by t.name`);
  async function saveTag(id, input) {
    const name = clip(input.name, 60);
    if (!name) throw fail(400, 'Tag cần có tên.');
    try { const row = await one(`update public.blog_tags set name = $2, slug = $3 where id = $1 returning *`, [id, name, slugify(input.slug || name)]); invalidate(); return row; }
    catch (error) { if (error.code === '23505') throw fail(409, 'Đã có tag với đường dẫn này. Dùng Gộp tag.'); throw error; }
  }
  // Every post of `id` gets `into`, then `id` is removed.
  async function mergeTag(id, into) {
    if (!into || id === into) throw fail(400, 'Chọn tag để gộp vào.');
    await q(`insert into public.blog_post_tags (post_id, tag_id) select post_id, $2 from public.blog_post_tags where tag_id = $1 on conflict do nothing`, [id, into]);
    await q(`delete from public.blog_tags where id = $1`, [id]);
    invalidate();
  }
  async function removeTag(id) { await q(`delete from public.blog_tags where id = $1`, [id]); invalidate(); }

  const authors = () => q(`select a.*, (select count(*)::int from public.blog_posts p where p.author_id = a.id and p.status <> 'archived') as posts from public.blog_authors a order by a.created_at`);
  async function saveAuthor(id, input) {
    const name = clip(input.name, 120);
    if (!name) throw fail(400, 'Tác giả cần có tên.');
    const sameAs = (Array.isArray(input.same_as) ? input.same_as : String(input.same_as || '').split(/\s+/)).map(u => clip(u, 500)).filter(u => /^https?:\/\//.test(u)).slice(0, 10);
    const values = [name, slugify(input.slug || name), clip(input.job_title, 200), clip(input.bio, 2000), clip(input.avatar, 2048), JSON.stringify(sameAs)];
    try {
      const row = id ? await one(`update public.blog_authors set name = $2, slug = $3, job_title = $4, bio = $5, avatar = $6, same_as = $7, updated_at = now() where id = $1 returning *`, [id, ...values])
        : await one(`insert into public.blog_authors (name, slug, job_title, bio, avatar, same_as) values ($1, $2, $3, $4, $5, $6) returning *`, values);
      invalidate();
      return row;
    } catch (error) { if (error.code === '23505') throw fail(409, 'Đường dẫn tác giả đã có.'); throw error; }
  }
  async function removeAuthor(id) {
    const used = await one(`select count(*)::int as n from public.blog_posts where author_id = $1 and status <> 'archived'`, [id]);
    if (used.n) throw fail(409, `Tác giả đang có ${used.n} bài. Đổi tác giả của các bài đó trước khi xóa.`);
    await q(`delete from public.blog_authors where id = $1`, [id]);
    invalidate();
  }

  // Posts and pages to link to from the editor.
  async function linkSearch(term) {
    const like = `%${String(term || '').toLowerCase().replace(/[\\%_]/g, ch => `\\${ch}`)}%`;
    const posts = await q(`select title, slug from public.blog_posts where status in ('published', 'scheduled') and (lower(title) like $1 or slug like $1) order by updated_at desc limit 8`, [like]);
    const pages = [['/trading', 'Chương trình Phương pháp Trading hiệu quả'], ['/dong-tien', 'Chương trình Phương pháp xây dựng dòng tiền'], ['/ve-toi', 'Về Phạm Thành Biên'], ['/zoom', 'Sự kiện Zoom'], ['/blog', 'Blog']]
      .filter(([path, title]) => !term || `${path} ${title}`.toLowerCase().includes(String(term).toLowerCase()));
    return [...posts.map(p => ({ href: `/blog/${p.slug}`, title: p.title })), ...pages.map(([href, title]) => ({ href, title }))];
  }

  // A blog image: the original plus the WebP copies the browser made (640 and 1280 px wide),
  // stored side by side so pages can serve srcset (src/blog/content.js imageVariants).
  async function saveImage(files, { width, height } = {}) {
    const original = files.file?.[0];
    if (!original || !/^image\/(jpeg|png|webp|gif)$/.test(original.mimetype)) throw fail(400, 'Chỉ nhận ảnh JPG, PNG, WebP hoặc GIF.');
    if (original.size > 8 * 1024 * 1024) throw fail(400, 'Ảnh lớn hơn 8 MB.');
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[original.mimetype];
    const base = `blog/${(slugify(original.originalname.replace(/\.[^.]+$/, ''), 60) || 'anh')}-${Date.now().toString(36)}`;
    const bucket = storage();
    const put = async (path, file) => { const { error } = await bucket.upload(path, file.buffer, { contentType: file.mimetype, upsert: false }); if (error) throw fail(500, error.message); };
    await put(`${base}${ext}`, original);
    for (const size of [640, 1280]) { const copy = files[`w${size}`]?.[0]; if (copy && copy.mimetype === 'image/webp' && copy.size < 4 * 1024 * 1024) await put(`${base}-${size}.webp`, copy); }
    return { url: bucket.getPublicUrl(`${base}${ext}`).data.publicUrl, width: Number(width) || null, height: Number(height) || null };
  }

  return { listPosts, getPost, createPost, autosave, discardDraft, keywordUsage, savePost, removePost, revisions, revision, previewToken, verifyPreview,
    categories, saveCategory, removeCategory, tags, saveTag, mergeTag, removeTag, authors, saveAuthor, removeAuthor, linkSearch, saveImage };
}

let admin;
const getBlogAdmin = () => admin || (admin = createBlogAdmin());

module.exports = { createBlogAdmin, getBlogAdmin };
