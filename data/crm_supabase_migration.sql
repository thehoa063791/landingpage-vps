-- Mini CRM schema for the admin panel.
-- Run this in Supabase SQL editor, then insert at least one admin profile.

alter table public.registrations
  add column if not exists assigned_to uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists last_interaction_at timestamptz;

create table if not exists public.crm_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'sale' check (role in ('admin', 'sale')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  registration_id text not null,
  interaction_type text not null default 'note'
    check (interaction_type in ('call', 'message', 'meeting', 'email', 'note')),
  body text not null,
  author_id uuid references auth.users(id) on delete set null,
  author_email text not null default '',
  author_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.lead_notes
  add column if not exists interaction_type text not null default 'note';

do $$
begin
  alter table public.lead_notes
    add constraint lead_notes_interaction_type_check
    check (interaction_type in ('call', 'message', 'meeting', 'email', 'note'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_registrations_assigned_to
  on public.registrations(assigned_to);

create index if not exists idx_registrations_last_interaction_at
  on public.registrations(last_interaction_at desc);

create index if not exists idx_lead_notes_registration_id_created_at
  on public.lead_notes(registration_id, created_at desc);

create table if not exists public.crm_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_custom_fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  label text not null,
  key text not null,
  type text not null default 'text'
    check (type in ('text', 'number', 'date', 'boolean', 'dropdown', 'multiselect', 'url', 'currency')),
  required boolean not null default false,
  default_value text not null default '',
  group_name text not null default 'Thông tin khác',
  sort_order integer not null default 0,
  options jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists idx_crm_custom_fields_user_id_sort
  on public.crm_custom_fields(user_id, sort_order, label);

create unique index if not exists idx_crm_custom_fields_global_key
  on public.crm_custom_fields(key)
  where user_id is null;

create table if not exists public.crm_custom_field_values (
  registration_id text not null,
  field_id uuid not null references public.crm_custom_fields(id) on delete cascade,
  value jsonb not null default '""'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_email text not null default '',
  updated_by_name text not null default '',
  primary key (registration_id, field_id)
);

create index if not exists idx_crm_custom_field_values_registration
  on public.crm_custom_field_values(registration_id);

create table if not exists public.crm_tag_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#5c6ac4',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.crm_tag_categories(id) on delete set null,
  name text not null,
  slug text not null,
  color text not null default '#5c6ac4',
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);

create index if not exists idx_crm_tags_category_active
  on public.crm_tags(category_id, active, name);

create table if not exists public.lead_tags (
  registration_id text not null,
  tag_id uuid not null references public.crm_tags(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_by_email text not null default '',
  assigned_by_name text not null default '',
  assigned_at timestamptz not null default now(),
  primary key (registration_id, tag_id)
);

create index if not exists idx_lead_tags_registration
  on public.lead_tags(registration_id);

create index if not exists idx_lead_tags_tag
  on public.lead_tags(tag_id);

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

-- Example seed after creating a user in Supabase Auth:
-- insert into public.crm_profiles (user_id, email, full_name, role)
-- values ('00000000-0000-0000-0000-000000000000', 'admin@example.com', 'Admin', 'admin')
-- on conflict (user_id) do update set role = 'admin', active = true;
