-- Weekly webinar funnels: which way each seat came, so the admin can measure the two flows
-- apart. 'landing': the landing page (and the thank-you / personal links); 'link': the quick
-- join on a week link (/w/dong-tien/20h-16-11-26).
alter table public.webinar_enrollments add column if not exists source text not null default 'landing';
do $$ begin
  alter table public.webinar_enrollments add constraint webinar_enrollments_source check (source in ('landing', 'link'));
exception when duplicate_object then null; end $$;
