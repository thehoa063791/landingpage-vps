#!/usr/bin/env node
// Groups every lead into contacts (src/contacts/service.js syncAll).
//   NODE_ENV=production node scripts/contacts-sync.cjs           dry run: writes, counts, rolls back
//   NODE_ENV=production node scripts/contacts-sync.cjs --apply   first build / repair
// Runs nightly from scripts/maintenance.cjs as well.
require('dotenv').config();
const { pool } = require('../src/db');
const { syncAll } = require('../src/contacts/service');

(async () => {
  const apply = process.argv.includes('--apply');
  const started = Date.now();
  const counts = await syncAll({ apply });
  console.log(`${apply ? 'Applied' : 'Dry run (rolled back)'} in ${Date.now() - started} ms:`, JSON.stringify(counts));
  if (apply) {
    const { rows: [t] } = await pool.query(`select (select count(*) from public.contacts where merged_into is null)::int contacts,
      (select count(*) from public.registrations where contact_id is null)::int unlinked,
      (select count(*) from public.contact_candidates where status = 'open')::int open_candidates,
      (select count(*) from public.contact_identities)::int identities`);
    console.log('Totals:', JSON.stringify(t));
  }
  await pool.end();
})().catch(error => { console.error(error.message); process.exit(1); });
