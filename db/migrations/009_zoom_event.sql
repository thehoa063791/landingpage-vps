-- /zoom funnel (src/zoomEvent.js): one row per email and Zoom event, holding the
-- personal Zoom join link. `key` is "<event_key>|<email>"; event_key is
-- "<meeting|webinar>:<zoom id>", so a new event in admin starts fresh rows.
create table if not exists public.zoom_event_registrations (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_zoom_event_registrations_access
  on public.zoom_event_registrations ((data->>'access_key'));
