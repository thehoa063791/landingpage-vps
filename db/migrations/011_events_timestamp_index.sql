-- Admin reports read events by time range (storage.getEventsWhere); without this index
-- every range scanned and sorted the whole table.
create index if not exists idx_events_event_timestamp on public.events (event_timestamp);
