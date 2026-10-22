#!/usr/bin/env node
// Runs each .sql file under db/migrations/ once, in lexical order, each in its own
// transaction, and records it in public.schema_migrations.
//   node scripts/migrate.js           apply pending migrations
//   node scripts/migrate.js --status  list applied and pending files, change nothing
// An existing database without schema_migrations (created before 2026-10-22) is baselined:
// files up to BASELINE are recorded as applied without running them again.
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

const BASELINE = '013_redirects.sql';

async function main() {
  const dir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const statusOnly = process.argv.includes('--status');
  const fresh = !(await pool.query(`select to_regclass('public.schema_migrations') as t`)).rows[0].t;
  if (fresh && statusOnly) {
    console.log('schema_migrations does not exist yet: the next run creates it.');
  }
  if (!statusOnly) {
    await pool.query(`create table if not exists public.schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now(), baseline boolean not null default false)`);
  }
  const applied = fresh ? new Map() : new Map((await pool.query('select name, checksum from public.schema_migrations')).rows.map(r => [r.name, r.checksum]));
  const checksum = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r/g, '')).digest('hex');

  if (fresh && !statusOnly && (await pool.query(`select to_regclass('public.registrations') as t`)).rows[0].t) {
    for (const file of files.filter(f => f <= BASELINE)) {
      await pool.query('insert into public.schema_migrations (name, checksum, baseline) values ($1, $2, true) on conflict do nothing', [file, checksum(file)]);
      applied.set(file, checksum(file));
      console.log(`= ${file} (baseline: already in this database)`);
    }
  }

  for (const file of files) {
    if (applied.has(file)) {
      if (statusOnly) console.log(`✓ ${file}${applied.get(file) !== checksum(file) ? '  (file changed since it ran)' : ''}`);
      continue;
    }
    if (statusOnly) { console.log(`· ${file}  pending`); continue; }
    const client = await pool.connect();
    process.stdout.write(`▶ ${file} … `);
    try {
      await client.query('begin');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('insert into public.schema_migrations (name, checksum) values ($1, $2)', [file, checksum(file)]);
      await client.query('commit');
      console.log('OK');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      console.error('FAILED (rolled back)');
      console.error(err.message);
      process.exit(1);
    } finally {
      client.release();
    }
  }
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
