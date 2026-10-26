-- Blog (docs/blog-seo-plan.md, B1): SEO fields, authors, categories, tags, slug history, revisions.
-- blog_posts keeps its columns (the old CMS screen still writes them until B2).

create table if not exists public.blog_authors (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  job_title   text not null default '',
  bio         text not null default '',
  avatar      text not null default '',
  -- Profile links (website, Facebook, YouTube...), schema.org sameAs.
  same_as     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.blog_categories (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  description      text not null default '',
  seo_title        text not null default '',
  meta_description text not null default '',
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.blog_tags (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

update public.blog_posts set status = 'draft' where status not in ('draft', 'scheduled', 'published', 'archived');

alter table public.blog_posts
  add column if not exists content_json       jsonb,
  add column if not exists content_html       text not null default '',
  add column if not exists seo_title          text not null default '',
  add column if not exists meta_description   text not null default '',
  add column if not exists focus_keyword      text not null default '',
  add column if not exists canonical_url      text not null default '',
  add column if not exists robots             text not null default 'index',
  add column if not exists og_image           text not null default '',
  add column if not exists cover_alt          text not null default '',
  add column if not exists cover_width        integer,
  add column if not exists cover_height       integer,
  add column if not exists published_at       timestamptz,
  add column if not exists scheduled_at       timestamptz,
  -- The "updated" date readers see: changed only when the content really changes.
  add column if not exists content_updated_at timestamptz,
  add column if not exists author_id          uuid references public.blog_authors(id) on delete set null,
  add column if not exists category_id        uuid references public.blog_categories(id) on delete set null,
  add column if not exists word_count         integer not null default 0,
  add column if not exists reading_minutes    integer not null default 0,
  add column if not exists wp_id              bigint unique,
  -- Autosave of the editor: unsaved edits, applied to the post only when it is saved or published,
  -- so editing a published post never changes the live page by itself.
  add column if not exists draft              jsonb,
  add column if not exists draft_saved_at     timestamptz,
  -- +1 on each save; the editor sends the one it loaded, so two people never overwrite each
  -- other (updated_at cannot serve: the touch trigger moves it on autosave too).
  add column if not exists version            integer not null default 0;

alter table public.blog_posts drop constraint if exists blog_posts_status_check;
alter table public.blog_posts add constraint blog_posts_status_check check (status in ('draft', 'scheduled', 'published', 'archived'));
alter table public.blog_posts drop constraint if exists blog_posts_robots_check;
alter table public.blog_posts add constraint blog_posts_robots_check check (robots in ('index', 'noindex'));

create index if not exists idx_blog_posts_published on public.blog_posts(status, published_at desc);
create index if not exists idx_blog_posts_category on public.blog_posts(category_id);
create index if not exists idx_blog_posts_author on public.blog_posts(author_id);

create table if not exists public.blog_post_tags (
  post_id  uuid not null references public.blog_posts(id) on delete cascade,
  tag_id   uuid not null references public.blog_tags(id) on delete cascade,
  primary key (post_id, tag_id)
);
create index if not exists idx_blog_post_tags_tag on public.blog_post_tags(tag_id);

-- Old slugs of a post: /blog/<old> answers 301 to the current address.
create table if not exists public.blog_slug_history (
  slug        text primary key,
  post_id     uuid not null references public.blog_posts(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- A copy of the post at each save, to compare and restore (the admin keeps the latest 50).
create table if not exists public.blog_revisions (
  id          bigserial primary key,
  post_id     uuid not null references public.blog_posts(id) on delete cascade,
  data        jsonb not null,
  by_email    text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idx_blog_revisions_post on public.blog_revisions(post_id, created_at desc);

insert into public.blog_authors (slug, name, job_title, bio)
values ('pham-thanh-bien', 'Phạm Thành Biên', 'Chủ tịch Công ty Cổ phần Tập đoàn VINMOC',
        'Nhà đầu tư, nhà sáng lập Tập đoàn VINMOC, chia sẻ phương pháp đầu tư và xây dựng dòng tiền.')
on conflict (slug) do nothing;

insert into public.blog_categories (slug, name, description)
values ('kien-thuc-dau-tu', 'Kiến thức đầu tư', 'Kiến thức, tư duy và kinh nghiệm đầu tư tài chính.')
on conflict (slug) do nothing;

update public.blog_posts
   set published_at = coalesce(published_at, created_at),
       author_id = coalesce(author_id, (select id from public.blog_authors where slug = 'pham-thanh-bien'))
 where status = 'published';
