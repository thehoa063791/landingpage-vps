// Blog reads (docs/blog-seo-plan.md §4–5). A post is public when published, or scheduled with
// its time reached (no job needed to publish on time). Lists are paged in SQL.
const { pool } = require('../db');

const PUBLIC = `(p.status = 'published' or (p.status = 'scheduled' and p.scheduled_at <= now()))`;
const POST_COLS = `p.id, p.title, p.slug, p.excerpt, p.content, p.content_html, p.cover_image, p.cover_alt, p.cover_width, p.cover_height,
  p.status, p.seo_title, p.meta_description, p.focus_keyword, p.canonical_url, p.robots, p.og_image, p.word_count, p.reading_minutes,
  coalesce(p.published_at, p.scheduled_at, p.created_at) as published_at, coalesce(p.content_updated_at, p.updated_at) as modified_at,
  p.created_at, p.updated_at,
  a.id as author_id, a.slug as author_slug, a.name as author_name, a.job_title as author_job_title, a.bio as author_bio, a.avatar as author_avatar, a.same_as as author_same_as,
  c.id as category_id, c.slug as category_slug, c.name as category_name`;
const FROM = `from public.blog_posts p left join public.blog_authors a on a.id = p.author_id left join public.blog_categories c on c.id = p.category_id`;

function createBlogRepository({ database = pool } = {}) {
  const q = (sql, params = []) => database.query(sql, params).then(r => r.rows);

  async function withTags(posts) {
    if (!posts.length) return posts;
    const rows = await q(`select pt.post_id, t.slug, t.name from public.blog_post_tags pt join public.blog_tags t on t.id = pt.tag_id where pt.post_id = any($1::uuid[]) order by t.name`, [posts.map(p => p.id)]);
    for (const post of posts) post.tags = rows.filter(r => r.post_id === post.id).map(({ slug, name }) => ({ slug, name }));
    return posts;
  }

  // { rows, total } of public posts, newest first; filter by category, tag or author ID.
  async function listPosts({ page = 1, size = 12, categoryId = null, tagId = null, authorId = null } = {}) {
    const where = [PUBLIC], params = [];
    if (categoryId) { params.push(categoryId); where.push(`p.category_id = $${params.length}`); }
    if (authorId) { params.push(authorId); where.push(`p.author_id = $${params.length}`); }
    if (tagId) { params.push(tagId); where.push(`exists (select 1 from public.blog_post_tags pt where pt.post_id = p.id and pt.tag_id = $${params.length})`); }
    const [{ total }] = await q(`select count(*)::int as total from public.blog_posts p where ${where.join(' and ')}`, params);
    params.push(size, (Math.max(1, page) - 1) * size);
    const rows = await q(`select ${POST_COLS} ${FROM} where ${where.join(' and ')} order by coalesce(p.published_at, p.scheduled_at, p.created_at) desc, p.id limit $${params.length - 1} offset $${params.length}`, params);
    return { rows: await withTags(rows), total };
  }

  // The post at this slug whatever its status (the page decides: 410 when archived...), or null.
  async function postBySlug(slug) {
    const [post] = await q(`select ${POST_COLS}, ${PUBLIC} as is_public ${FROM} where p.slug = $1`, [slug]);
    return post ? (await withTags([post]))[0] : null;
  }
  async function postById(id) {
    const [post] = await q(`select ${POST_COLS}, ${PUBLIC} as is_public ${FROM} where p.id = $1`, [id]);
    return post ? (await withTags([post]))[0] : null;
  }

  // The current slug of a post that had this slug before (301), or null.
  async function renamedSlug(slug) {
    const [row] = await q(`select p.slug from public.blog_slug_history h join public.blog_posts p on p.id = h.post_id where h.slug = $1 and p.slug <> $1`, [slug]);
    return row?.slug || null;
  }

  const categoryBySlug = async slug => (await q(`select c.*, (select count(*)::int from public.blog_posts p where p.category_id = c.id and ${PUBLIC}) as posts from public.blog_categories c where c.slug = $1`, [slug]))[0] || null;
  const tagBySlug = async slug => (await q(`select t.*, (select count(*)::int from public.blog_post_tags pt join public.blog_posts p on p.id = pt.post_id where pt.tag_id = t.id and ${PUBLIC}) as posts from public.blog_tags t where t.slug = $1`, [slug]))[0] || null;
  const authorBySlug = async slug => (await q(`select a.*, (select count(*)::int from public.blog_posts p where p.author_id = a.id and ${PUBLIC}) as posts from public.blog_authors a where a.slug = $1`, [slug]))[0] || null;
  const categories = () => q(`select c.slug, c.name, (select count(*)::int from public.blog_posts p where p.category_id = c.id and ${PUBLIC}) as posts from public.blog_categories c order by c.position, c.name`);

  // Same category first, then shared tags, then the newest; never the post itself.
  async function related(post, limit = 3) {
    const rows = await q(`select ${POST_COLS} ${FROM} where ${PUBLIC} and p.id <> $1
      order by (p.category_id is not distinct from $2::uuid and $2::uuid is not null) desc,
               (select count(*) from public.blog_post_tags a1 join public.blog_post_tags a2 on a2.tag_id = a1.tag_id where a1.post_id = p.id and a2.post_id = $1) desc,
               coalesce(p.published_at, p.created_at) desc limit $3`, [post.id, post.category_id || null, limit]);
    return rows;
  }
  // The neighbours in publishing order: { previous (older), next (newer) }.
  async function neighbours(post) {
    const at = post.published_at;
    const [previous] = await q(`select p.slug, p.title ${FROM} where ${PUBLIC} and coalesce(p.published_at, p.scheduled_at, p.created_at) < $1 order by coalesce(p.published_at, p.scheduled_at, p.created_at) desc limit 1`, [at]);
    const [next] = await q(`select p.slug, p.title ${FROM} where ${PUBLIC} and coalesce(p.published_at, p.scheduled_at, p.created_at) > $1 order by coalesce(p.published_at, p.scheduled_at, p.created_at) asc limit 1`, [at]);
    return { previous: previous || null, next: next || null };
  }

  // Every public post for sitemaps, feeds and llms.txt (small: no content unless asked).
  const allPublic = ({ content = false, limit = 50000 } = {}) => q(`select ${content ? POST_COLS : `p.id, p.slug, p.title, p.excerpt, p.meta_description, p.robots, p.canonical_url, p.cover_image, p.cover_alt,
      coalesce(p.published_at, p.scheduled_at, p.created_at) as published_at, coalesce(p.content_updated_at, p.updated_at) as modified_at, c.slug as category_slug, c.name as category_name, a.name as author_name`}
    ${FROM} where ${PUBLIC} order by coalesce(p.published_at, p.scheduled_at, p.created_at) desc limit $1`, [limit]);
  const indexableTaxonomies = () => q(`select 'chu-de' as kind, c.slug, max(coalesce(p.content_updated_at, p.updated_at)) as modified_at, count(*)::int as posts
      from public.blog_categories c join public.blog_posts p on p.category_id = c.id and ${PUBLIC} group by c.slug
    union all select 'tac-gia', a.slug, max(coalesce(p.content_updated_at, p.updated_at)), count(*)::int
      from public.blog_authors a join public.blog_posts p on p.author_id = a.id and ${PUBLIC} group by a.slug`);

  return { listPosts, postBySlug, postById, renamedSlug, categoryBySlug, tagBySlug, authorBySlug, categories, related, neighbours, allPublic, indexableTaxonomies };
}

let repository;
const getBlogRepository = () => repository || (repository = createBlogRepository());

module.exports = { createBlogRepository, getBlogRepository, PUBLIC };
