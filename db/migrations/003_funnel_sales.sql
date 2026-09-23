create table if not exists public.funnel_sales (
  id              uuid primary key default gen_random_uuid(),
  registration_id text not null unique,
  funnel_id       text not null default '',
  page_id         text not null default '',
  status          text not null default 'pending'
    check (status in ('pending', 'won', 'lost', 'refunded')),
  amount          bigint not null default 0 check (amount >= 0),
  currency        text not null default 'VND',
  note            text not null default '',
  sold_at         timestamptz,
  updated_by      uuid references public.auth_users(id) on delete set null,
  updated_by_email text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_funnel_sales_funnel_status
  on public.funnel_sales(funnel_id, status, sold_at desc);
create index if not exists idx_funnel_sales_page_status
  on public.funnel_sales(page_id, status, sold_at desc);
