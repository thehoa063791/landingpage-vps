-- Partner API (/api/partner/v1, src/partner/). Keys are stored as SHA-256 hashes only.
create table if not exists public.api_clients (
  id                    text primary key,
  name                  text not null,
  key_prefix            text not null,
  key_hash              text not null unique,
  scopes                text[] not null default '{}',
  -- Course IDs the key may read; empty means every course.
  courses               text[] not null default '{}',
  ip_allowlist          text[] not null default '{}',
  rate_limit_per_minute integer not null default 60,
  data                  jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  revoked_at            timestamptz,
  last_used_at          timestamptz
);

-- Who read which contact, without emails or phone numbers.
create table if not exists public.api_access_log (
  id          bigserial primary key,
  client_id   text,
  request_id  text not null,
  method      text not null,
  route       text not null,
  contact_id  text,
  facets      text[] not null default '{}',
  status      integer not null,
  duration_ms integer,
  created_at  timestamptz not null default now()
);
create index if not exists idx_api_access_log_client on public.api_access_log (client_id, created_at desc);

-- GET /changes reads progress in update order.
create index if not exists idx_learning_progress_updated on public.learning_progress (updated_at, course, key);
