-- Short links and old URLs (src/redirects.js, Admin > Redirect). Imported from the WordPress
-- Redirection plugin with scripts/import-wp-redirects.cjs; wp_id keeps that import re-runnable.
create table if not exists public.redirects (
  id             bigserial primary key,
  source         text not null,
  -- Lowercase path without trailing slash: what requests are matched on.
  source_key     text not null,
  target         text not null,
  code           smallint not null default 301,
  -- 'pass' appends the request's query string to the target, 'ignore' drops it.
  query_mode     text not null default 'pass',
  enabled        boolean not null default true,
  -- Among rules with the same source, the lowest position wins (as in Redirection).
  position       integer not null default 0,
  group_name     text not null default '',
  title          text not null default '',
  note           text not null default '',
  hits           bigint not null default 0,
  last_access_at timestamptz,
  wp_id          integer unique,
  created_by     text,
  updated_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_redirects_source on public.redirects (source_key, position);
