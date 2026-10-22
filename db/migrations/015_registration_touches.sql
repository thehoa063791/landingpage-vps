-- First and last touch of each registration (src/attribution.js, roadmap 1.2): where the
-- person first came from on that device, and the last non-direct source before submitting.
-- utm_* columns keep their meaning (the source sent with the form, as before).
alter table public.registrations
  add column if not exists first_touch jsonb,
  add column if not exists last_touch jsonb;
