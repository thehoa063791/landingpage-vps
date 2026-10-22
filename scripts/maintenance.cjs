#!/usr/bin/env node
// Nightly data retention, run by deploy/backup-db.sh after the backup (database plan step A):
// - webhook_logs: the payload (customer data sent to the webhook) is cleared after 30 days;
//   delivery rows (lead ID, time, status, error) are deleted after 12 months.
// Prints counts only.
require('dotenv').config();
const { pool } = require('../src/db');

(async () => {
  const cleared = await pool.query(`update public.webhook_logs set payload = null where payload is not null and fired_at < now() - interval '30 days'`);
  const removed = await pool.query(`delete from public.webhook_logs where fired_at < now() - interval '12 months'`);
  console.log(`${new Date().toISOString()} maintenance: webhook payloads cleared ${cleared.rowCount}, old deliveries removed ${removed.rowCount}`);
  await pool.end();
})().catch(error => { console.error('maintenance failed:', error.message); process.exit(1); });
