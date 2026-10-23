#!/usr/bin/env node
// Roadmap 3.1 preview: groups every lead into people with the identity rules
// (src/contacts/identity.js) and reports what the contacts layer would look like.
// Read-only: no table is created or changed. Counts and masked samples only.
//   NODE_ENV=production node scripts/contacts-preview.cjs
require('dotenv').config();
const { pool } = require('../src/db');
const { cluster, emailKey, phoneKey, namesMatch } = require('../src/contacts/identity');

const mask = {
  name: v => String(v || '').split(' ').map(w => w ? w[0] + '*'.repeat(Math.max(0, w.length - 1)) : w).join(' '),
  email: v => v ? v.replace(/^(.)[^@]*(@.*)$/, '$1***$2') : '—',
  phone: v => v ? v.slice(0, 3) + '*'.repeat(Math.max(0, v.length - 6)) + v.slice(-3) : '—',
};
const pct = (n, d) => d ? `${(n / d * 100).toFixed(1)}%` : '0%';
const count = (items, fn, n = 10) => Object.entries(items.reduce((acc, x) => { const k = fn(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}: ${v}`).join(' · ');

(async () => {
  const { rows } = await pool.query(`select id, name, email, phone, page_id, registered_at, assigned_to from public.registrations order by registered_at, id`);
  const { groups, candidates, sharedPhones } = cluster(rows);
  const merged = groups.filter(g => g.length > 1);
  // Why each merged group joined: by email only, or (also) by phone + name.
  const byPhone = merged.filter(g => new Set(g.map(r => emailKey(r.email)).filter(Boolean)).size > 1 || g.some(r => !emailKey(r.email)));
  const multiFunnel = groups.filter(g => new Set(g.map(r => r.page_id)).size > 1);
  const saleConflicts = groups.filter(g => new Set(g.map(r => r.assigned_to).filter(Boolean)).size > 1);
  const noIdentity = groups.filter(g => g.every(r => !emailKey(r.email) && !phoneKey(r.phone)));

  console.log('== Tổng quan');
  console.log(`Lượt đăng ký (lead hiện có):        ${rows.length}`);
  console.log(`Khách hàng sau khi gộp:              ${groups.length}  (giảm ${rows.length - groups.length} dòng, ${pct(rows.length - groups.length, rows.length)})`);
  console.log(`Khách hàng có từ 2 lượt trở lên:     ${merged.length}`);
  console.log(`  trong đó gộp nhờ SĐT + tên:        ${byPhone.length}`);
  console.log(`Khách hàng ở từ 2 phễu trở lên:      ${multiFunnel.length}`);
  console.log(`Số lượt mỗi khách:                   ${count(groups, g => g.length >= 5 ? '5+' : String(g.length))}`);
  console.log(`Khách không có email lẫn SĐT hợp lệ: ${noIdentity.length}`);
  console.log('\n== Có thể trùng (không tự gộp, chờ duyệt ở 3.3)');
  console.log(`Cùng SĐT, khác tên (luật 3):         ${candidates.filter(c => c.reason === 'same_phone_other_name').length} cặp`);
  console.log(`Cùng tên, email gần giống (luật 5):  ${candidates.filter(c => c.reason === 'same_name_similar_email').length} cặp`);
  console.log(`SĐT dùng chung ≥4 tên (luật 8):      ${sharedPhones.length} số (${sharedPhones.reduce((s, p) => s + p.registrations, 0)} lượt)`);
  console.log('\n== Cần quyết ở 3.2');
  console.log(`Khách hàng đang có nhiều sale:       ${saleConflicts.length}`);
  console.log(`Phễu của khách nhiều phễu (top):     ${count(multiFunnel.flatMap(g => [...new Set(g.map(r => r.page_id))]), x => x, 8)}`);

  console.log('\n== Mẫu (đã che)');
  const show = g => g.map(r => `${r.page_id}:${mask.name(r.name)}/${mask.email(emailKey(r.email))}/${mask.phone(phoneKey(r.phone))}`).join('  +  ');
  console.log('Gộp theo email:', show(merged.find(g => !byPhone.includes(g) && new Set(g.map(r => r.page_id)).size > 1) || merged[0] || []));
  const viaPhone = byPhone.find(g => g.length === 2 && new Set(g.map(r => emailKey(r.email))).size === 2);
  if (viaPhone) console.log('Gộp theo SĐT + tên:', show(viaPhone), namesMatch(viaPhone[0].name, viaPhone[1].name) ? '(tên khớp)' : '');
  for (const reason of ['same_phone_other_name', 'same_name_similar_email']) {
    const c = candidates.find(x => x.reason === reason);
    if (c) console.log(`Có thể trùng (${reason}):`, show(groups[c.a].slice(0, 1)), '  ↔  ', show(groups[c.b].slice(0, 1)));
  }
  await pool.end();
})().catch(error => { console.error(error.message); process.exit(1); });
