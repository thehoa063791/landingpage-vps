-- Roadmap 3.6 (docs/zoom-event-plan.md): Zoom events. An event is what people are invited to
-- (title, time, Zoom room, optional /zoom page); its sessions are the meetings Zoom reports;
-- registrations and attendances meet at the contact (src/zoomEvents.js).
create table if not exists public.zoom_events (
  id               uuid primary key default gen_random_uuid(),
  title            text not null default '',
  zoom_kind        text not null default 'meeting' check (zoom_kind in ('meeting', 'webinar')),
  zoom_id          text not null default '',
  starts_at        timestamptz,
  duration_minutes integer not null default 120,
  status           text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  has_page         boolean not null default true,
  -- /zoom page content (banner, headline, share image...), as zoom_event_settings held it.
  page             jsonb not null default '{}'::jsonb,
  -- Registration key prefix of events created from the old single setting ("meeting:<id>").
  legacy_key       text,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Only one event is open on /zoom at a time.
create unique index if not exists idx_zoom_events_one_open_page on public.zoom_events ((true)) where has_page and status = 'open';
create index if not exists idx_zoom_events_zoom_id on public.zoom_events (zoom_id);

-- Which meeting (session) belongs to which event; excluded sessions (rehearsals) do not count.
create table if not exists public.zoom_event_sessions (
  zoom_meeting_uuid text primary key references public.zoom_meetings(zoom_meeting_uuid) on delete cascade,
  event_id          uuid not null references public.zoom_events(id) on delete cascade,
  source            text not null default 'auto' check (source in ('auto', 'manual')),
  excluded          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_zoom_event_sessions_event on public.zoom_event_sessions (event_id);

-- Internal meetings stay out of lists and reports (auto: few people, nobody known; or by hand).
alter table public.zoom_meetings add column if not exists hidden boolean not null default false;
alter table public.zoom_meetings add column if not exists hidden_by text not null default '';

alter table public.zoom_event_registrations add column if not exists event_id uuid references public.zoom_events(id) on delete set null;
alter table public.zoom_event_registrations add column if not exists email text;
alter table public.zoom_event_registrations add column if not exists registration_id text;
alter table public.zoom_event_registrations add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.zoom_event_registrations add column if not exists created_at timestamptz;
create unique index if not exists idx_zoom_event_registrations_event_email on public.zoom_event_registrations (event_id, email) where event_id is not null;
create index if not exists idx_zoom_event_registrations_contact on public.zoom_event_registrations (contact_id);

alter table public.lead_zoom_attendances add column if not exists contact_id uuid references public.contacts(id) on delete set null;
-- email (matched automatically), manual (linked by an admin), created (admin created the person)
alter table public.lead_zoom_attendances add column if not exists match_source text not null default '';
create index if not exists idx_lead_zoom_attendances_contact on public.lead_zoom_attendances (contact_id);
