#!/usr/bin/env node
// Runs every .sql file under db/migrations/ in lexical order.
// Idempotent — each migration uses `if not exists` guards.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function main() {
  const dir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    process.stdout.write(`▶ ${f} … `);
    try {
      await pool.query(sql);
      console.log('OK');
    } catch (err) {
      console.error('FAILED');
      console.error(err.message);
      process.exit(1);
    }
  }
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
