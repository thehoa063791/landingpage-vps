#!/usr/bin/env node
require('dotenv').config();

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');
const { Pool } = require('pg');

const projectRoot = path.resolve(__dirname, '..');
const backupsRoot = path.join(projectRoot, 'backups');
const dryRun = process.argv.includes('--dry-run');
const explicitBackup = process.argv.find((arg) => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);
// A valid bcrypt value that intentionally matches no known password. Supabase
// backups do not expose auth password hashes, but restored user IDs are still
// needed by CRM foreign keys. An admin can reset/create credentials afterward.
const LOCKED_PASSWORD_HASH = bcrypt.hashSync(crypto.randomUUID(), 12);

function backupPath(backupDir, relativePath) {
  return path.join(backupDir, ...String(relativePath).split(/[\\/]+/));
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function serialize(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) return JSON.stringify(value);
  return value;
}

async function findBackup() {
  if (explicitBackup) return path.resolve(projectRoot, explicitBackup);
  const entries = await fs.readdir(backupsRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(backupsRoot, entry.name);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!await fs.pathExists(manifestPath)) continue;
    const manifest = await fs.readJson(manifestPath);
    if (manifest.completed_at && Array.isArray(manifest.errors) && manifest.errors.length === 0) {
      candidates.push({ dir, createdAt: new Date(manifest.created_at).getTime() || 0 });
    }
  }
  candidates.sort((a, b) => b.createdAt - a.createdAt);
  if (!candidates.length) throw new Error(`No completed backup found under ${backupsRoot}`);
  return candidates[0].dir;
}

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

async function validateBackup(backupDir, manifest) {
  const files = [];
  for (const item of Object.values(manifest.tables || {})) files.push(item);
  if (manifest.auth?.file) files.push(manifest.auth);
  for (const item of files) {
    const file = backupPath(backupDir, item.file);
    if (!await fs.pathExists(file)) throw new Error(`Missing backup file: ${item.file}`);
    if (item.sha256 && await sha256(file) !== item.sha256) throw new Error(`Checksum mismatch: ${item.file}`);
  }
}

async function tableInfo(client) {
  const { rows } = await client.query(`
    select c.relname as table_name, c.relkind,
           (array_agg(a.attname order by a.attnum) filter (where a.attnum > 0 and not a.attisdropped))::text[] as columns,
           coalesce((select array_agg(pa.attname::text order by u.ord)
                     from pg_index i
                     cross join lateral unnest(i.indkey) with ordinality u(attnum, ord)
                     join pg_attribute pa on pa.attrelid = i.indrelid and pa.attnum = u.attnum
                     where i.indrelid = c.oid and i.indisprimary), '{}'::text[]) as primary_key
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v')
    group by c.oid, c.relname, c.relkind
  `);
  return new Map(rows.map((row) => [row.table_name, row]));
}

async function upsertRows(client, table, rows, info) {
  if (!rows.length) return 0;
  const allowed = new Set(info.columns);
  const columns = [...new Set(rows.flatMap(Object.keys))].filter((column) => allowed.has(column));
  const primaryKey = info.primary_key || [];
  if (!columns.length) return 0;
  if (!primaryKey.length || primaryKey.some((column) => !columns.includes(column))) {
    throw new Error(`${table}: no usable primary key for safe upsert`);
  }
  const uniqueRows = new Map();
  for (const row of rows) {
    const key = primaryKey.map((column) => JSON.stringify(row[column])).join('|');
    uniqueRows.set(key, row);
  }
  rows = [...uniqueRows.values()];
  const updateColumns = columns.filter((column) => !primaryKey.includes(column));
  const chunkSize = Math.max(1, Math.floor(30000 / columns.length));
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const params = [];
    const values = chunk.map((row) => `(${columns.map((column) => {
      params.push(serialize(row[column]));
      return `$${params.length}`;
    }).join(', ')})`).join(', ');
    const conflict = primaryKey.map(quoteIdent).join(', ');
    const action = updateColumns.length
      ? `DO UPDATE SET ${updateColumns.map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`).join(', ')}`
      : 'DO NOTHING';
    await client.query(
      `INSERT INTO public.${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) VALUES ${values} ON CONFLICT (${conflict}) ${action}`,
      params,
    );
  }
  return rows.length;
}

function shapeAuthUsers(users) {
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    password_hash: user.encrypted_password || LOCKED_PASSWORD_HASH,
    role: user.role || user.raw_app_meta_data?.role || 'authenticated',
    full_name: user.raw_user_meta_data?.full_name || user.raw_user_meta_data?.name || '',
    active: !user.banned_until,
    created_at: user.created_at,
    updated_at: user.updated_at,
  }));
}

async function restoreStorage(backupDir, manifest) {
  const source = path.join(backupDir, 'storage');
  const target = path.resolve(process.env.STORAGE_ROOT || path.join(projectRoot, 'storage'));
  if (!await fs.pathExists(source)) return 0;
  let copied = 0;
  for (const bucket of Object.keys(manifest.storage?.buckets || {})) {
    const bucketSource = path.join(source, bucket);
    if (!await fs.pathExists(bucketSource)) continue;
    if (!dryRun) await fs.copy(bucketSource, path.join(target, bucket), { overwrite: true, errorOnExist: false });
    copied += manifest.storage.buckets[bucket].files || 0;
  }
  return copied;
}

async function main() {
  const backupDir = await findBackup();
  const manifest = await fs.readJson(path.join(backupDir, 'manifest.json'));
  console.log(`Backup: ${path.relative(projectRoot, backupDir)}`);
  await validateBackup(backupDir, manifest);
  console.log('Checksums: OK');

  if (dryRun) {
    const tableRows = Object.values(manifest.tables || {}).reduce((sum, item) => sum + Number(item.rows || 0), 0);
    const storageFiles = await restoreStorage(backupDir, manifest);
    console.log(`Dry run: ${Object.keys(manifest.tables || {}).length} database objects, ${tableRows} rows, ${manifest.auth?.users || 0} auth users, ${storageFiles} storage files`);
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  const client = await pool.connect();
  try {
    const tables = await tableInfo(client);
    const ordered = [
      'businesses', 'ad_accounts', 'campaigns', 'ad_sets', 'creatives', 'ads',
      'registrations', 'events', 'webhooks', 'webhook_logs', 'payments', 'surveys',
      'crm_profiles', 'crm_settings', 'crm_custom_fields', 'crm_custom_field_values',
      'lead_notes', 'zoom_meetings', 'lead_zoom_attendances', 'blog_posts',
      'facebook_pages', 'media_items', 'publish_jobs', 'notifications', 'sync_jobs',
      'daily_stats', 'breakdown_stats', 'business_members',
    ];
    const available = Object.keys(manifest.tables || {}).map((name) => name.replace(/^public\./, ''));
    for (const name of available) if (!ordered.includes(name)) ordered.push(name);

    await client.query('BEGIN');
    if (manifest.auth?.file && tables.has('auth_users')) {
      const users = await fs.readJson(backupPath(backupDir, manifest.auth.file));
      const count = await upsertRows(client, 'auth_users', shapeAuthUsers(users), tables.get('auth_users'));
      console.log(`auth_users: ${count}`);
    }
    for (const table of ordered) {
      const item = manifest.tables?.[`public.${table}`];
      if (!item) continue;
      const info = tables.get(table);
      if (!info) { console.log(`${table}: skipped (not part of project schema)`); continue; }
      if (info.relkind === 'v') { console.log(`${table}: skipped (view)`); continue; }
      const rows = await fs.readJson(backupPath(backupDir, item.file));
      const count = await upsertRows(client, table, rows, info);
      console.log(`${table}: ${count}`);
    }
    await client.query('COMMIT');
    const storageFiles = await restoreStorage(backupDir, manifest);
    console.log(`Storage files: ${storageFiles}`);
    console.log('Restore completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Restore failed: ${error.message}`);
  process.exit(1);
});
