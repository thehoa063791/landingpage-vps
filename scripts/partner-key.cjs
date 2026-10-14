#!/usr/bin/env node
// Partner API keys (docs/PARTNER_API.md). Usually managed in Admin > Cài đặt > API đối tác;
// this is the server-side fallback.
//   node scripts/partner-key.cjs create --name "AI CSKH" --scopes contact:basic,learning:read [--courses trading,dong-tien] [--rate 60] [--ips 1.2.3.4]
//   node scripts/partner-key.cjs list
//   node scripts/partner-key.cjs rotate <id>     (new key, same settings; the old key stops)
//   node scripts/partner-key.cjs revoke <id>
// Keys are printed once; only their hash is stored. A change made here reaches the running
// server within 30 seconds (changes made in the admin apply at once).
require('dotenv').config();
const { createClientStore, validateClientInput } = require('../src/partner/clients');
const { keyOptions } = require('../src/partner/facets');
const { pool } = require('../src/db');

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) result[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
  return result;
}
const printKey = key => console.log('\nKHÓA API (chỉ hiện một lần, hãy gửi cho đối tác qua kênh an toàn):\n' + key);

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const store = createClientStore();
  if (command === 'create') {
    const opts = options(rest), known = keyOptions();
    const input = validateClientInput({ name: opts.name, scopes: opts.scopes, courses: opts.courses, rate_limit_per_minute: opts.rate, ip_allowlist: opts.ips },
      { scopes: known.scopes.map(s => s.scope), courses: known.courses.map(c => c.id) });
    const { client, key } = await store.create(input, { by: 'cli' });
    console.log(`Đã tạo khóa cho "${client.name}" (id ${client.id})`);
    console.log(`Scopes: ${client.scopes.join(', ')} | Khóa học: ${client.courses.join(', ') || 'tất cả'} | ${client.rate_limit_per_minute} lượt/phút`);
    printKey(key);
  } else if (command === 'list') {
    for (const c of await store.list()) console.log([c.id, c.name, `${c.key_prefix}…`, c.scopes.join(','), c.courses.join(',') || 'all', `${c.rate_limit_per_minute}/min`, c.revoked_at ? `REVOKED ${c.revoked_at}` : 'active', `last used ${c.last_used_at || '-'}`].join(' | '));
  } else if (command === 'rotate') {
    if (!rest[0]) throw new Error('Cần id của khóa.');
    const result = await store.rotate(rest[0], { by: 'cli' });
    if (!result) throw new Error('Không tìm thấy khóa đang hoạt động với id này.');
    console.log(`Đã đổi khóa cho "${result.client.name}". Khóa cũ ngừng hoạt động.`);
    printKey(result.key);
  } else if (command === 'revoke') {
    if (!rest[0]) throw new Error('Cần id của khóa.');
    console.log(await store.revoke(rest[0]) ? 'Đã thu hồi.' : 'Không tìm thấy khóa đang hoạt động với id này.');
  } else {
    console.log('Dùng: create | list | rotate <id> | revoke <id> (xem đầu file).');
  }
}

// Exit explicitly: the CRM storage module keeps timers alive.
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await pool.end().catch(() => {}); process.exit(process.exitCode || 0); });
