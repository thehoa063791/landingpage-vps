#!/usr/bin/env node
// Nightly data retention, run by deploy/backup-db.sh after the backup (database plan step A):
// - contacts: every lead linked to its person (src/contacts/service.js syncAll);
// - webhook_logs: the payload (customer data sent to the webhook) is cleared after 30 days;
//   delivery rows (lead ID, time, status, error) are deleted after 12 months.
// Prints counts only.
require('dotenv').config();
const { pool } = require('../src/db');

(async () => {
  const cleared = await pool.query(`update public.webhook_logs set payload = null where payload is not null and fired_at < now() - interval '30 days'`);
  const removed = await pool.query(`delete from public.webhook_logs where fired_at < now() - interval '12 months'`);
  console.log(`${new Date().toISOString()} maintenance: webhook payloads cleared ${cleared.rowCount}, old deliveries removed ${removed.rowCount}`);
  // Contacts: link any lead the live path missed and refresh possible duplicates (roadmap 3.1).
  try { console.log(`${new Date().toISOString()} contacts sync: ${JSON.stringify(await require('../src/contacts/service').syncAll())}`); }
  catch (error) { console.error('contacts sync failed:', error.message); }
  // Zoom events: sessions to events, attendances to people (roadmap 3.6), after the contacts.
  try { console.log(`${new Date().toISOString()} zoom events: ${JSON.stringify(await require('../src/zoomEvents').refresh())}`); }
  catch (error) { console.error('zoom events refresh failed:', error.message); }
  await pool.end();
})().catch(error => { console.error('maintenance failed:', error.message); process.exit(1); });
