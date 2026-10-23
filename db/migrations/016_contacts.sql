-- Contacts layer (roadmap 3.1, docs/contact-model-plan.md): one row per person. Registrations
-- stay as they are (one per form submission) and point to their person with contact_id.
-- Built and kept in sync by src/contacts/service.js and scripts/contacts-sync.cjs.
create table if not exists public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  display_name        text not null default '',
  primary_email       text not null default '',
  primary_phone       text not null default '',
  -- The sale in charge of the person (roadmap 3.2; filled from the earliest registration).
  owner_id            uuid references public.auth_users(id) on delete set null,
  -- First/last touch of the person (roadmap 3.5).
  first_touch         jsonb,
  last_touch          jsonb,
  first_registered_at timestamptz,
  last_registered_at  timestamptz,
  registrations_count integer not null default 0,
  -- A contact merged into another one keeps its row so old references can be followed.
  merged_into         uuid references public.contacts(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_contacts_last_registered on public.contacts(last_registered_at desc) where merged_into is null;

-- Ways to recognise a person. Email and phone may belong to several contacts (a family email
-- with different names, a shared phone); platform IDs belong to one.
create table if not exists public.contact_identities (
  kind       text not null check (kind in ('email', 'phone', 'zalo', 'messenger', 'hubcrm', 'ebila')),
  value      text not null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kind, value, contact_id)
);
create unique index if not exists idx_contact_identities_platform on public.contact_identities(kind, value) where kind not in ('email', 'phone');
create index if not exists idx_contact_identities_contact on public.contact_identities(contact_id);

alter table public.registrations add column if not exists contact_id uuid references public.contacts(id) on delete set null;
create index if not exists idx_registrations_contact on public.registrations(contact_id);

-- Every automatic or manual merge/split, so it can be explained and undone (roadmap 3.3).
create table if not exists public.contact_merges (
  id          bigserial primary key,
  kept_id     uuid,
  merged_id   uuid,
  action      text not null default 'merge' check (action in ('merge', 'split')),
  reason      text not null default '',
  by_email    text not null default '',
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Possible duplicates waiting for a decision (roadmap 3.3): rules 1 (same email, other name),
-- 3 (same phone, other name) and 5 (same name, similar email).
create table if not exists public.contact_candidates (
  contact_a  uuid not null references public.contacts(id) on delete cascade,
  contact_b  uuid not null references public.contacts(id) on delete cascade,
  reason     text not null,
  match_key  text not null default '',
  status     text not null default 'open' check (status in ('open', 'not_same', 'merged')),
  decided_by text not null default '',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (contact_a, contact_b, reason)
);
create index if not exists idx_contact_candidates_open on public.contact_candidates(status) where status = 'open';
