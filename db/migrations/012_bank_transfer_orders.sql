-- Paid funnels (src/bankTransfer.js): each order gets a short transfer code that the buyer
-- types as the bank transfer content, so a payment can be matched to its order.
alter table public.funnel_sales
  add column if not exists payment_ref text not null default '',
  add column if not exists customer_confirmed_at timestamptz;

create unique index if not exists idx_funnel_sales_payment_ref
  on public.funnel_sales(payment_ref)
  where payment_ref <> '';
