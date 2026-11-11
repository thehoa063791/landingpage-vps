-- Weekly webinar funnels (src/webinarProgram.js). webinar_cohorts holds what an admin sets per
-- cohort (its own Zalo group); webinar_enrollments fixes each person's cohort when they register,
-- so changing the cutoff later never moves anyone; webinar_session_joins records who entered
-- which session and their personal EverWebinar room.
create table if not exists public.webinar_cohorts (
  program    text not null,
  starts_on  date not null,
  zalo_name  text not null default '',
  zalo_url   text not null default '',
  updated_at timestamptz not null default now(),
  primary key (program, starts_on)
);

create table if not exists public.webinar_enrollments (
  id               uuid primary key default gen_random_uuid(),
  program          text not null,
  starts_on        date not null,
  registration_id  text not null references public.registrations(id) on delete cascade,
  email            text not null,
  access_key       text not null unique,
  zalo_clicked_at  timestamptz,
  created_at       timestamptz not null default now(),
  unique (program, email, starts_on)
);
create index if not exists idx_webinar_enrollments_cohort on public.webinar_enrollments (program, starts_on);
create index if not exists idx_webinar_enrollments_email on public.webinar_enrollments (program, email, starts_on desc);

-- One row per person, week link (/w/dong-tien/20h-16-11-26) and kind: visit, registered, entered.
create table if not exists public.webinar_link_events (
  program    text not null,
  slug       text not null,
  starts_on  date not null,
  kind       text not null check (kind in ('visit', 'registered', 'entered')),
  visitor    text not null,
  hits       integer not null default 1,
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  primary key (program, slug, kind, visitor)
);
create index if not exists idx_webinar_link_events_week on public.webinar_link_events (program, starts_on);

create table if not exists public.webinar_session_joins (
  enrollment_id uuid not null references public.webinar_enrollments(id) on delete cascade,
  position      integer not null,
  room_url      text not null default '',
  clicks        integer not null default 0,
  first_at      timestamptz,
  last_at       timestamptz,
  primary key (enrollment_id, position)
);
