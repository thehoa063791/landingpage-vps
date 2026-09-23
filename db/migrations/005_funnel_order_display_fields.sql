alter table public.funnel_sales
  add column if not exists payment_method text not null default '',
  add column if not exists created_by uuid references public.auth_users(id) on delete set null,
  add column if not exists created_by_email text not null default '';
