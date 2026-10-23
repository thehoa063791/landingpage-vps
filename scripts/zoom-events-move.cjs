#!/usr/bin/env node
// Roadmap 3.6 Z1, once: the events behind the old single /zoom setting (docs/zoom-event-plan.md §6).
// Without --apply it computes in a transaction that is rolled back and prints the counts.
//   NODE_ENV=production node scripts/zoom-events-move.cjs [--apply]
require('dotenv').config();
const { pool } = require('../src/db');
const { getCrmSetting } = require('../src/storage');
const { normalizeSettings, titleText } = require('../src/zoomEvent');
const { moveLegacyEvents } = require('../src/zoomEvents');

(async () => {
  const apply = process.argv.includes('--apply');
  const settings = normalizeSettings(await getCrmSetting('zoom_event_settings', {}));
  const started = Date.now();
  const result = await moveLegacyEvents({ settings, titleOf: titleText, apply });
  console.log(`${apply ? 'Applied' : 'Dry run (rolled back)'} in ${Date.now() - started} ms: ${JSON.stringify(result)}`);
  const { rows } = await pool.query(`select status, count(*)::int n, sum((select count(*) from public.zoom_event_sessions s where s.event_id = e.id))::int sessions,
      sum((select count(*) from public.zoom_event_registrations z where z.event_id = e.id))::int registrations from public.zoom_events e group by 1 order by 1`);
  console.log('Events now:', JSON.stringify(rows));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => process.exit(process.exitCode || 0));
