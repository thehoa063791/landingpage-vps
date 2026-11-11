-- Weekly webinar funnels: who really watched each session, pulled from EverWebinar
-- (/everwebinar/registrants) after it (src/webinarProgram.js syncAttendance). A row of
-- webinar_session_joins can now exist without a click on our link (clicks = 0): someone who
-- reached the room another way still counts as attending.
alter table public.webinar_session_joins add column if not exists attended_live boolean not null default false;
alter table public.webinar_session_joins add column if not exists live_seconds integer not null default 0;
alter table public.webinar_session_joins add column if not exists attended_replay boolean not null default false;
alter table public.webinar_session_joins add column if not exists replay_seconds integer not null default 0;
alter table public.webinar_session_joins add column if not exists attendance_at timestamptz;

-- The last pull of each session, what it found, and the error when it failed.
create table if not exists public.webinar_attendance_syncs (
  program   text not null,
  starts_on date not null,
  position  integer not null,
  synced_at timestamptz not null default now(),
  matched   integer not null default 0,
  attended  integer not null default 0,
  error     text not null default '',
  primary key (program, starts_on, position)
);
