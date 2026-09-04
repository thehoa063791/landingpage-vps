-- Ads analytics and social publishing data restored from the former Supabase project.
create table if not exists businesses (
  id uuid primary key, name text not null, slug text, plan text, timezone text,
  settings jsonb, created_at timestamptz, updated_at timestamptz
);
create table if not exists business_members (
  id uuid primary key, business_id uuid references businesses(id), user_id uuid references auth_users(id),
  role text, invited_by uuid references auth_users(id), created_at timestamptz
);
create table if not exists ad_accounts (
  id uuid primary key, business_id uuid references businesses(id), platform text, platform_account_id text,
  name text, currency text, timezone text, access_token_enc text, status text, last_synced_at timestamptz,
  meta_info jsonb, created_at timestamptz, updated_at timestamptz
);
create table if not exists campaigns (
  id uuid primary key, account_id uuid references ad_accounts(id), platform_id text, name text, objective text,
  conversion_goal text, status text, daily_budget numeric, lifetime_budget numeric, start_time timestamptz,
  stop_time timestamptz, raw_data jsonb, created_at timestamptz, updated_at timestamptz
);
create table if not exists ad_sets (
  id uuid primary key, campaign_id uuid references campaigns(id), account_id uuid references ad_accounts(id),
  platform_id text, name text, status text, optimization_goal text, billing_event text, bid_amount numeric,
  daily_budget numeric, lifetime_budget numeric, targeting jsonb, start_time timestamptz, stop_time timestamptz,
  raw_data jsonb, created_at timestamptz, updated_at timestamptz
);
create table if not exists creatives (
  id uuid primary key, account_id uuid references ad_accounts(id), platform_id text, name text, type text,
  headline text, body text, call_to_action text, image_url text, thumbnail_url text, asset_data jsonb,
  created_at timestamptz, updated_at timestamptz
);
create table if not exists ads (
  id uuid primary key, ad_set_id uuid references ad_sets(id), campaign_id uuid references campaigns(id),
  account_id uuid references ad_accounts(id), creative_id uuid references creatives(id), platform_id text,
  name text, status text, raw_data jsonb, created_at timestamptz, updated_at timestamptz
);
create table if not exists daily_stats (
  id uuid primary key, date date not null, entity_type text not null, entity_id uuid not null,
  account_id uuid references ad_accounts(id), spend numeric default 0, impressions bigint default 0,
  reach bigint default 0, clicks bigint default 0, link_clicks bigint default 0, frequency numeric default 0,
  actions jsonb, action_values jsonb, video_metrics jsonb, quality_scores jsonb, attribution_window text,
  is_final boolean, created_at timestamptz, updated_at timestamptz
);
create table if not exists breakdown_stats (
  id uuid primary key, date date not null, entity_type text not null, entity_id uuid not null,
  account_id uuid references ad_accounts(id), breakdown_type text, breakdown_value text, spend numeric default 0,
  impressions bigint default 0, reach bigint default 0, clicks bigint default 0, link_clicks bigint default 0,
  actions jsonb, action_values jsonb, attribution_window text, created_at timestamptz, updated_at timestamptz
);
create table if not exists sync_jobs (
  id uuid primary key, account_id uuid references ad_accounts(id), job_type text, date_from date, date_to date,
  status text, rows_upserted integer, error_message text, started_at timestamptz, finished_at timestamptz,
  meta jsonb, created_at timestamptz, updated_at timestamptz
);
create index if not exists idx_daily_stats_range on daily_stats(date, entity_type, entity_id);
create index if not exists idx_breakdown_stats_range on breakdown_stats(date, breakdown_type, entity_id);

create table if not exists facebook_pages (
  id uuid primary key, page_id text, name text, access_token text, default_caption_template text,
  default_hashtags jsonb, watermark_text text, preferred_times jsonb, is_active boolean,
  created_at timestamptz, updated_at timestamptz
);
create table if not exists media_items (
  id uuid primary key, source_url text, source_platform text, author text, title text, description text,
  original_caption text, draft_caption text, hashtags jsonb, thumbnail_url text, direct_video_url text,
  storage_path text, video_hash text, niche text, status text, error_message text,
  discovered_at timestamptz, resolved_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create table if not exists publish_jobs (
  id uuid primary key, media_item_id uuid references media_items(id), facebook_page_id uuid references facebook_pages(id),
  caption text, scheduled_at timestamptz, status text, facebook_post_id text, attempts integer,
  last_error text, published_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create table if not exists notifications (
  id uuid primary key, level text, title text, message text, media_item_id uuid references media_items(id),
  publish_job_id uuid references publish_jobs(id), is_read boolean, created_at timestamptz
);
