-- A lead may place multiple orders. Keep every status transition with its time.
alter table public.funnel_sales
  drop constraint if exists funnel_sales_registration_id_key;

create index if not exists idx_funnel_sales_registration
  on public.funnel_sales(registration_id, created_at desc);

create table if not exists public.funnel_order_status_history (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.funnel_sales(id) on delete cascade,
  from_status      text,
  to_status        text not null,
  changed_at       timestamptz not null default now(),
  changed_by       uuid references public.auth_users(id) on delete set null,
  changed_by_email text not null default ''
);

create index if not exists idx_funnel_order_history_order
  on public.funnel_order_status_history(order_id, changed_at desc);

-- A navigation is one browser page load even when more than one tracking
-- bundle attempts to send the same pageview.
create unique index if not exists idx_events_pageview_navigation_unique
  on public.events ((event_meta->>'navigation_id'))
  where event = 'pageview' and coalesce(event_meta->>'navigation_id', '') <> '';
