-- Shared learning storage for every course funnel (src/learningCourses.js).
-- `course` is the funnel page_id; learner/progress keys are CRM registration IDs,
-- which already belong to one page_id.
create table if not exists public.learning_lessons (
  course text not null,
  key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (course, key)
);
create table if not exists public.learning_stages (
  course text not null,
  key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (course, key)
);
create table if not exists public.learning_learners (
  course text not null,
  key text not null references public.registrations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (course, key)
);
create table if not exists public.learning_progress (
  course text not null,
  key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (course, key)
);
create index if not exists idx_learning_progress_lead on public.learning_progress (course, (data->>'registration_id'));
create index if not exists idx_learning_progress_lesson on public.learning_progress (course, (data->>'lesson_id'));

-- Carry over the Dòng Tiền course. The dong_tien_* tables are no longer written, so
-- re-running only fills missing rows and never overwrites later edits.
insert into public.learning_lessons (course, key, data, updated_at)
  select 'dong-tien', key, data, updated_at from public.dong_tien_lessons on conflict do nothing;
insert into public.learning_stages (course, key, data, updated_at)
  select 'dong-tien', key, data, updated_at from public.dong_tien_stages on conflict do nothing;
insert into public.learning_learners (course, key, data, updated_at)
  select 'dong-tien', key, data, updated_at from public.dong_tien_learners on conflict do nothing;
insert into public.learning_progress (course, key, data, updated_at)
  select 'dong-tien', key, data, updated_at from public.dong_tien_progress on conflict do nothing;
