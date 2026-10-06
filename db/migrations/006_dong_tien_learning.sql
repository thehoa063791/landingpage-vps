-- Learning identity is the existing CRM lead ID, never an old academic user ID.
create table if not exists public.dong_tien_learners (
  key text primary key references public.registrations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.dong_tien_lessons (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.dong_tien_progress (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists idx_dong_tien_progress_lead on public.dong_tien_progress ((data->>'registration_id'));
create index if not exists idx_dong_tien_progress_lesson on public.dong_tien_progress ((data->>'lesson_id'));
