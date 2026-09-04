-- =============================================================================
-- Landing Page — Postgres init schema (self-hosted, replaces Supabase)
-- Run: psql -U postgres -d landingpage -f 001_init.sql
-- =============================================================================

create extension if not exists "pgcrypto";

-- ── Auth (replaces Supabase auth.users) ──────────────────────────────────────
create table if not exists public.auth_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_sign_in_at timestamptz
);

create index if not exists idx_auth_users_email on public.auth_users(lower(email));

-- ── Registrations (leads) ────────────────────────────────────────────────────
create table if not exists public.registrations (
  id           text primary key,
  data         jsonb not null default '{}'::jsonb,
  name         text not null default '',
  email        text not null default '',
  phone        text not null default '',
  attendance   text,
  interest     text,
  page_id      text not null default 'default',
  region       text,
  registered_at timestamptz not null default now(),
  utm_source   text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  referrer     text,
  ip           text,
  ga           text,
  fbc          text, fbp text,
  fbclid       text, gclid text, ttclid text, msclkid text, twclid text,
  session_id   text,
  user_agent   text,
  geo          jsonb,
  device       jsonb,
  assigned_to  uuid references public.auth_users(id) on delete set null,
  assigned_at  timestamptz,
  last_interaction_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_registrations_email       on public.registrations(lower(email));
create index if not exists idx_registrations_phone       on public.registrations(phone);
create index if not exists idx_registrations_page_id     on public.registrations(page_id);
create index if not exists idx_registrations_registered_at on public.registrations(registered_at desc);
create index if not exists idx_registrations_assigned_to on public.registrations(assigned_to);
create index if not exists idx_registrations_last_interaction_at on public.registrations(last_interaction_at desc);

-- ── Events (analytics) ───────────────────────────────────────────────────────
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  data            jsonb,
  event           text,
  event_timestamp timestamptz,
  session_id      text,
  ip              text,
  page_id         text,
  url             text,
  referrer        text,
  utm_source      text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  event_meta      jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_events_created_at on public.events(created_at desc);
create index if not exists idx_events_page_id    on public.events(page_id);
create index if not exists idx_events_event      on public.events(event);
create index if not exists idx_events_session    on public.events(session_id);

-- ── Webhooks ─────────────────────────────────────────────────────────────────
create table if not exists public.webhooks (
  id               text primary key,
  data             jsonb,
  name             text not null default '',
  url              text not null default '',
  active           boolean not null default true,
  last_triggered   timestamptz,
  last_status      integer,
  last_error       text,
  last_duration_ms integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);

create table if not exists public.webhook_logs (
  id                 uuid primary key default gen_random_uuid(),
  webhook_id         text,
  webhook_name       text,
  webhook_url        text,
  fired_at           timestamptz not null default now(),
  status_code        integer,
  duration_ms        integer,
  error              text,
  event              text,
  event_id           text,
  event_source       text,
  contact_name       text,
  contact_phone      text,
  contact_email      text,
  contact_region     text,
  contact_attendance text,
  utm_source         text, utm_medium text, utm_campaign text,
  utm_content        text, utm_term text, utm_channel text, utm_referrer text,
  fbclid text, gclid text, ttclid text, msclkid text, twclid text,
  fbc text, fbp text, ga text,
  ip text, user_agent text,
  payload jsonb
);

create index if not exists idx_webhook_logs_webhook on public.webhook_logs(webhook_id, fired_at desc);

-- ── Payments ─────────────────────────────────────────────────────────────────
create table if not exists public.payments (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Surveys (30s / academic) ─────────────────────────────────────────────────
create table if not exists public.surveys (
  id              uuid primary key default gen_random_uuid(),
  registration_id text,
  page_id         text not null default '30s-trading',
  q1_stage        text, q2_problem text, q3_error text, q4_goal text,
  q5_learning     text, q6_time text, q7_concern text, q8_expectation text, q9_priority text,
  submitted_at    timestamptz not null default now()
);
create index if not exists idx_surveys_registration on public.surveys(registration_id);
create index if not exists idx_surveys_submitted_at on public.surveys(submitted_at desc);

-- ── CRM Profiles / Settings ──────────────────────────────────────────────────
create table if not exists public.crm_profiles (
  user_id    uuid primary key references public.auth_users(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  role       text not null default 'sale' check (role in ('admin', 'sale')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Lead Notes ───────────────────────────────────────────────────────────────
create table if not exists public.lead_notes (
  id               uuid primary key default gen_random_uuid(),
  registration_id  text not null,
  interaction_type text not null default 'note'
    check (interaction_type in ('call', 'message', 'meeting', 'email', 'note')),
  body             text not null,
  author_id        uuid references public.auth_users(id) on delete set null,
  author_email     text not null default '',
  author_name      text not null default '',
  created_at       timestamptz not null default now()
);
create index if not exists idx_lead_notes_registration_created
  on public.lead_notes(registration_id, created_at desc);

-- ── Custom Fields ────────────────────────────────────────────────────────────
create table if not exists public.crm_custom_fields (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.auth_users(id) on delete set null,
  label         text not null,
  key           text not null,
  type          text not null default 'text'
    check (type in ('text','number','date','boolean','dropdown','multiselect','url','currency')),
  required      boolean not null default false,
  default_value text not null default '',
  group_name    text not null default 'Thông tin khác',
  sort_order    integer not null default 0,
  options       jsonb not null default '[]'::jsonb,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, key)
);
create unique index if not exists idx_crm_custom_fields_global_key
  on public.crm_custom_fields(key) where user_id is null;
create index if not exists idx_crm_custom_fields_user_sort
  on public.crm_custom_fields(user_id, sort_order, label);

create table if not exists public.crm_custom_field_values (
  registration_id  text not null,
  field_id         uuid not null references public.crm_custom_fields(id) on delete cascade,
  value            jsonb not null default '""'::jsonb,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.auth_users(id) on delete set null,
  updated_by_email text not null default '',
  updated_by_name  text not null default '',
  primary key (registration_id, field_id)
);
create index if not exists idx_crm_custom_field_values_registration
  on public.crm_custom_field_values(registration_id);

-- ── Tags ─────────────────────────────────────────────────────────────────────
create table if not exists public.crm_tag_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text not null default '#5c6ac4',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_tags (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references public.crm_tag_categories(id) on delete set null,
  name        text not null,
  slug        text not null,
  color       text not null default '#5c6ac4',
  description text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (category_id, slug)
);
create index if not exists idx_crm_tags_category_active
  on public.crm_tags(category_id, active, name);

create table if not exists public.lead_tags (
  registration_id   text not null,
  tag_id            uuid not null references public.crm_tags(id) on delete cascade,
  assigned_by       uuid references public.auth_users(id) on delete set null,
  assigned_by_email text not null default '',
  assigned_by_name  text not null default '',
  assigned_at       timestamptz not null default now(),
  primary key (registration_id, tag_id)
);
create index if not exists idx_lead_tags_registration on public.lead_tags(registration_id);
create index if not exists idx_lead_tags_tag          on public.lead_tags(tag_id);

-- ── Zoom Meetings / Attendances ──────────────────────────────────────────────
create table if not exists public.zoom_meetings (
  zoom_meeting_uuid text primary key,
  zoom_meeting_id   text not null default '',
  topic             text not null default '',
  start_time        timestamptz,
  duration          integer not null default 0,
  host_email        text not null default '',
  host_id           text not null default '',
  raw               jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_zoom_meetings_start_time on public.zoom_meetings(start_time desc);
create index if not exists idx_zoom_meetings_meeting_id on public.zoom_meetings(zoom_meeting_id);

create table if not exists public.lead_zoom_attendances (
  id                 uuid primary key default gen_random_uuid(),
  registration_id    text,
  lead_email         text not null,
  zoom_meeting_uuid  text not null references public.zoom_meetings(zoom_meeting_uuid) on delete cascade,
  zoom_meeting_id    text not null default '',
  zoom_display_name  text not null default '',
  join_time          timestamptz,
  leave_time         timestamptz,
  duration           integer not null default 0,
  raw                jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (lead_email, zoom_meeting_uuid, join_time)
);
create index if not exists idx_lead_zoom_attendances_registration
  on public.lead_zoom_attendances(registration_id, join_time desc);
create index if not exists idx_lead_zoom_attendances_email
  on public.lead_zoom_attendances(lead_email, join_time desc);

-- ── Blog Posts ───────────────────────────────────────────────────────────────
create table if not exists public.blog_posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  slug        text unique,
  content     text not null default '',
  excerpt     text not null default '',
  cover_image text not null default '',
  status      text not null default 'draft',
  author      text not null default '',
  tags        jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_blog_posts_status_created on public.blog_posts(status, created_at desc);

-- ── RPC: get_admin_stats ─────────────────────────────────────────────────────
-- Aggregates for admin analytics dashboard. Called from src/routes/admin.js.
create or replace function public.get_admin_stats(
  p_date_from timestamptz,
  p_date_to   timestamptz,
  p_page_id   text
) returns jsonb
language plpgsql
stable
as $$
declare
  v_result jsonb;
begin
  with base as (
    select *
    from public.events
    where (p_date_from is null or created_at >= p_date_from)
      and (p_date_to   is null or created_at <  p_date_to)
      and (p_page_id is null or p_page_id = '' or page_id = p_page_id)
  ),
  funnel_agg as (
    select event, count(*) as total, count(distinct session_id) as uniq
    from base
    where event in ('pageview','form_open','cta_click','exit_intent')
    group by event
  ),
  scroll_agg as (
    select coalesce(event_meta->>'depth', data->'data'->>'depth') as depth,
           count(*) as cnt
    from base where event = 'scroll_depth'
    group by depth
  ),
  time_agg as (
    select coalesce(event_meta->>'seconds', data->'data'->>'seconds') as bucket,
           count(*) as cnt
    from base where event = 'time_on_page'
    group by bucket
  ),
  cta_pos as (
    select coalesce(event_meta->>'position', data->'data'->>'position','other') as pos,
           count(*) as cnt
    from base where event = 'cta_click'
    group by pos
  ),
  traffic as (
    select coalesce(nullif(utm_source,''),'direct') as src,
           coalesce(nullif(utm_medium,''),'(none)') as med,
           coalesce(referrer,'') as ref,
           count(*) as cnt
    from base where event = 'pageview'
    group by 1,2,3
    order by cnt desc
    limit 200
  ),
  session_utm as (
    select session_id,
           coalesce(nullif(utm_source,''),'direct') as src,
           coalesce(nullif(utm_medium,''),'(none)') as med,
           coalesce(referrer,'') as ref
    from base
    where session_id is not null
    group by session_id, 2, 3, 4
  ),
  pages as (
    select distinct page_id from base where page_id is not null
  )
  select jsonb_build_object(
    'funnel',       coalesce((select jsonb_object_agg(event, jsonb_build_object('total', total, 'uniq', uniq)) from funnel_agg), '{}'::jsonb),
    'scroll_depth', coalesce((select jsonb_object_agg(depth, cnt) from scroll_agg where depth is not null), '{}'::jsonb),
    'time_on_page', coalesce((select jsonb_object_agg(bucket, cnt) from time_agg where bucket is not null), '{}'::jsonb),
    'cta_by_pos',   coalesce((select jsonb_object_agg(pos, cnt) from cta_pos), '{}'::jsonb),
    'traffic',      coalesce((select jsonb_agg(jsonb_build_object('src',src,'med',med,'ref',ref,'cnt',cnt)) from traffic), '[]'::jsonb),
    'session_utm',  coalesce((select jsonb_object_agg(session_id, jsonb_build_object('src',src,'med',med,'ref',ref)) from session_utm), '{}'::jsonb),
    'page_ids',     coalesce((select jsonb_agg(page_id order by page_id) from pages), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ── Trigger: updated_at auto-touch ───────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'auth_users','crm_profiles','crm_settings','crm_custom_fields',
    'crm_tag_categories','crm_tags','zoom_meetings','lead_zoom_attendances',
    'blog_posts','payments'
  ]) loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
