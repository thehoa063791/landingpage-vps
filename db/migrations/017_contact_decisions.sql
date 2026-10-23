-- Roadmap 3.3: decisions on possible duplicates and manual merges/splits, kept per registration
-- pair so they survive regrouping (src/contacts/service.js reads them before applying the
-- identity rules): 'same' joins the two registrations' people, 'not_same' keeps them apart.
create table if not exists public.contact_decisions (
  registration_a text not null,
  registration_b text not null,
  decision       text not null check (decision in ('same', 'not_same')),
  reason         text not null default '',
  by_email       text not null default '',
  created_at     timestamptz not null default now(),
  primary key (registration_a, registration_b),
  check (registration_a < registration_b)
);
create index if not exists idx_contact_decisions_b on public.contact_decisions(registration_b);

-- Name, email or phone chosen by hand when merging; the computed summary does not replace them.
alter table public.contacts add column if not exists pinned jsonb not null default '{}'::jsonb;
