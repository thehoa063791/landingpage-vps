#!/usr/bin/env node
// Create (or reset the password of) an admin user in auth_users + crm_profiles.
// Usage:  node scripts/seed-admin.js admin@example.com 'strong-password' 'Full Name'
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

async function main() {
  const [email, password, fullName = ''] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: node scripts/seed-admin.js <email> <password> [fullName]');
    process.exit(2);
  }
  const hash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const up = await client.query(
      `INSERT INTO auth_users (email, password_hash, email_confirmed_at)
       VALUES ($1, $2, now())
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             email_confirmed_at = coalesce(auth_users.email_confirmed_at, now())
       RETURNING id, email`,
      [email, hash]
    );
    const user = up.rows[0];
    await client.query(
      `INSERT INTO crm_profiles (user_id, email, full_name, role, active)
       VALUES ($1, $2, $3, 'admin', true)
       ON CONFLICT (user_id) DO UPDATE
         SET role = 'admin', active = true, full_name = EXCLUDED.full_name`,
      [user.id, user.email, fullName || user.email]
    );
    await client.query('COMMIT');
    console.log(`✔ Admin ready: ${user.email} (id=${user.id})`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
