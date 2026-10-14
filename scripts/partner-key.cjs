#!/usr/bin/env node
// Partner API keys (docs/PARTNER_API.md).
//   node scripts/partner-key.cjs create --name "AI CSKH" --scopes contact:basic,learning:read [--courses trading,dong-tien] [--rate 60] [--ips 1.2.3.4]
//   node scripts/partner-key.cjs list
//   node scripts/partner-key.cjs revoke <id>
// The key is printed once by `create`; only its hash is stored. A revoked key stops working
// within 30 seconds in the running server.
require('dotenv').config();
const { createClientStore } = require('../src/partner/clients');
const { createFacets, scopeDescriptions } = require('../src/partner/facets');
const { courseIds } = require('../src/learningCourses');
const { pool } = require('../src/db');

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) result[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
  return result;
}
const list = value => String(value || '').split(',').map(v => v.trim()).filter(Boolean);

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const store = createClientStore();
  if (command === 'create') {
    const opts = options(rest), scopes = list(opts.scopes), courses = list(opts.courses), known = scopeDescriptions(createFacets());
    if (!opts.name || !scopes.length) throw new Error('Cần --name và --scopes. Scopes: ' + Object.keys(known).join(', '));
    const unknownScope = scopes.find(s => !known[s]);
    if (unknownScope) throw new Error(`Scope không tồn tại: ${unknownScope}. Scopes: ${Object.keys(known).join(', ')}`);
    const unknownCourse = courses.find(c => !courseIds().includes(c));
    if (unknownCourse) throw new Error(`Khóa học không tồn tại: ${unknownCourse}. Khóa học: ${courseIds().join(', ')}`);
    const rate = Number(opts.rate || 60);
    if (!Number.isInteger(rate) || rate < 1 || rate > 6000) throw new Error('--rate phải từ 1 đến 6000.');
    const { client, key } = await store.create({ name: opts.name, scopes, courses, rate_limit_per_minute: rate, ip_allowlist: list(opts.ips) });
    console.log(`Đã tạo khóa cho "${client.name}" (id ${client.id})`);
    console.log(`Scopes: ${client.scopes.join(', ')} | Khóa học: ${client.courses.join(', ') || 'tất cả'} | ${client.rate_limit_per_minute} lượt/phút`);
    console.log('\nKHÓA API (chỉ hiện một lần, hãy gửi cho đối tác qua kênh an toàn):\n' + key);
  } else if (command === 'list') {
    for (const c of await store.list()) console.log([c.id, c.name, `${c.key_prefix}…`, c.scopes.join(','), c.courses.join(',') || 'all', `${c.rate_limit_per_minute}/min`, c.revoked_at ? `REVOKED ${c.revoked_at}` : 'active', `last used ${c.last_used_at || '-'}`].join(' | '));
  } else if (command === 'revoke') {
    if (!rest[0]) throw new Error('Cần id của khóa.');
    console.log(await store.revoke(rest[0]) ? 'Đã thu hồi.' : 'Không tìm thấy khóa đang hoạt động với id này.');
  } else {
    console.log('Dùng: create | list | revoke <id> (xem đầu file).');
  }
}

// Exit explicitly: the CRM storage module keeps timers alive.
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await pool.end().catch(() => {}); process.exit(process.exitCode || 0); });
