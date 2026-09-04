-- Zoom attendance tables for CRM lead detail.
-- Run this in Supabase SQL Editor before syncing Zoom to production data.

create table if not exists public.zoom_meetings (
  zoom_meeting_uuid text primary key,
  zoom_meeting_id text not null default '',
  topic text not null default '',
  start_time timestamptz,
  duration integer not null default 0,
  host_email text not null default '',
  host_id text not null default '',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_zoom_meetings_start_time
  on public.zoom_meetings(start_time desc);

create index if not exists idx_zoom_meetings_meeting_id
  on public.zoom_meetings(zoom_meeting_id);

create table if not exists public.lead_zoom_attendances (
  id uuid primary key default gen_random_uuid(),
  registration_id text,
  lead_email text not null,
  zoom_meeting_uuid text not null references public.zoom_meetings(zoom_meeting_uuid) on delete cascade,
  zoom_meeting_id text not null default '',
  zoom_display_name text not null default '',
  join_time timestamptz,
  leave_time timestamptz,
  duration integer not null default 0,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_email, zoom_meeting_uuid, join_time)
);

create index if not exists idx_lead_zoom_attendances_registration
  on public.lead_zoom_attendances(registration_id, join_time desc);

create index if not exists idx_lead_zoom_attendances_email
  on public.lead_zoom_attendances(lead_email, join_time desc);

create index if not exists idx_lead_zoom_attendances_meeting
  on public.lead_zoom_attendances(zoom_meeting_uuid);
