-- Database plan step A (docs/database-plan.md), approved 2026-10-22.
-- Runs once (schema_migrations, scripts/migrate.js) inside one transaction.

-- 1. The Dòng Tiền tables of 006/007: 008 copied them into learning_* and nothing reads them.
--    Dropped only when every row is in learning_*; otherwise the migration stops.
do $$
declare missing integer;
begin
  if to_regclass('public.dong_tien_lessons') is not null then
    select (select count(*) from public.dong_tien_lessons d where not exists (select 1 from public.learning_lessons l where l.course = 'dong-tien' and l.key = d.key))
         + (select count(*) from public.dong_tien_stages d where not exists (select 1 from public.learning_stages l where l.course = 'dong-tien' and l.key = d.key))
         + (select count(*) from public.dong_tien_learners d where not exists (select 1 from public.learning_learners l where l.course = 'dong-tien' and l.key = d.key))
         + (select count(*) from public.dong_tien_progress d where not exists (select 1 from public.learning_progress l where l.course = 'dong-tien' and l.key = d.key))
      into missing;
    if missing > 0 then raise exception 'dong_tien_* has % rows not in learning_*: not dropped', missing; end if;
  end if;
end $$;
drop table if exists public.dong_tien_progress, public.dong_tien_learners, public.dong_tien_lessons, public.dong_tien_stages;

-- 2. Rows pointing at leads that no longer exist: a tag is removed, a survey keeps its
--    answers without the link; Zoom attendances without a lead use NULL, not ''.
delete from public.lead_tags t where not exists (select 1 from public.registrations r where r.id = t.registration_id);
update public.surveys s set registration_id = null where registration_id is not null and not exists (select 1 from public.registrations r where r.id = s.registration_id);
update public.lead_zoom_attendances set registration_id = null where registration_id = '';
update public.lead_zoom_attendances z set registration_id = null where registration_id is not null and not exists (select 1 from public.registrations r where r.id = z.registration_id);

-- 3. Foreign keys to registrations. Deleting a lead removes its notes, tags, custom values and
--    learning progress; surveys and Zoom attendances stay without the link; a lead with
--    orders cannot be deleted (sales history).
alter table public.lead_notes drop constraint if exists lead_notes_registration_fk;
alter table public.lead_notes add constraint lead_notes_registration_fk foreign key (registration_id) references public.registrations(id) on delete cascade;
alter table public.lead_tags drop constraint if exists lead_tags_registration_fk;
alter table public.lead_tags add constraint lead_tags_registration_fk foreign key (registration_id) references public.registrations(id) on delete cascade;
alter table public.crm_custom_field_values drop constraint if exists crm_custom_field_values_registration_fk;
alter table public.crm_custom_field_values add constraint crm_custom_field_values_registration_fk foreign key (registration_id) references public.registrations(id) on delete cascade;
alter table public.surveys drop constraint if exists surveys_registration_fk;
alter table public.surveys add constraint surveys_registration_fk foreign key (registration_id) references public.registrations(id) on delete set null;
alter table public.lead_zoom_attendances drop constraint if exists lead_zoom_attendances_registration_fk;
alter table public.lead_zoom_attendances add constraint lead_zoom_attendances_registration_fk foreign key (registration_id) references public.registrations(id) on delete set null;
alter table public.funnel_sales drop constraint if exists funnel_sales_registration_fk;
alter table public.funnel_sales add constraint funnel_sales_registration_fk foreign key (registration_id) references public.registrations(id) on delete restrict;
-- learning_progress keeps the lead ID inside data: a stored generated column carries the key.
alter table public.learning_progress add column if not exists registration_id text generated always as (data->>'registration_id') stored;
alter table public.learning_progress drop constraint if exists learning_progress_registration_fk;
alter table public.learning_progress add constraint learning_progress_registration_fk foreign key (registration_id) references public.registrations(id) on delete cascade;

-- 4. webhook_logs without customer data: the lead ID replaces name, phone, email, IP and
--    cookies (src/storage.js insertWebhookLog). Older rows are cleared now; the payload is
--    kept 30 days and rows 12 months (scripts/maintenance.cjs, daily).
alter table public.webhook_logs add column if not exists lead_id text;
update public.webhook_logs set lead_id = coalesce(payload->>'lead_id', event_id) where lead_id is null;
update public.webhook_logs set contact_name = null, contact_phone = null, contact_email = null, contact_region = null, contact_attendance = null,
  fbc = null, fbp = null, ga = null, ip = null, user_agent = null
  where coalesce(contact_name, contact_phone, contact_email, contact_region, contact_attendance, fbc, fbp, ga, ip, user_agent) is not null;
update public.webhook_logs set payload = null where fired_at < now() - interval '30 days' and payload is not null;
create index if not exists idx_webhook_logs_lead on public.webhook_logs(lead_id);

-- 5. Indexes never used (pg_stat_user_indexes since 2026-08-17); reports filter on event_timestamp.
drop index if exists public.idx_events_created_at;
drop index if exists public.idx_events_session;
