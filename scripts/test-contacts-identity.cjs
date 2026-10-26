// node scripts/test-contacts-identity.cjs — identity rules (src/contacts/identity.js).
const assert = require('node:assert/strict');
const { cluster, namesMatch, phoneKey, emailsNearlySame } = require('../src/contacts/identity');

assert.ok(namesMatch('Hòa', 'Đinh Thế Hòa')); assert.ok(namesMatch('NGUYEN VAN AN', 'Nguyễn Văn An')); assert.ok(!namesMatch('Nguyễn Văn An', 'Trần Bình')); assert.ok(!namesMatch('', 'An'));
assert.equal(phoneKey('+84 912 345 678'), '0912345678'); assert.equal(phoneKey('0911111111'), '', 'test phone'); assert.equal(phoneKey('123'), '');
assert.ok(emailsNearlySame('nguyenvanan@gmail.com', 'nguyenvanan@yahoo.com'), 'same name before @');
assert.ok(emailsNearlySame('nguyenvanan@gmail.com', 'nguyenvanann@gmail.com'), 'one typo');
assert.ok(!emailsNearlySame('an@gmail.com', 'ab@gmail.com'), 'too short to judge');
assert.ok(!emailsNearlySame('hoangminh@gmail.com', 'thanhlong@gmail.com'));

let n = 0;
const r = (name, email, phone, page = 'p') => ({ id: `r${++n}`, name, email, phone, page_id: page, registered_at: `2026-01-${String(n).padStart(2, '0')}` });
const rows = [
  r('Nguyễn Văn An', 'an@gmail.com', '0912345678', 'richlife'),   // r1
  r('An', 'AN@gmail.com ', '', 'trading'),                         // r2  rule 1 with r1
  r('Văn An', 'an.work@gmail.com', '+84 912 345 678', 'zoom'),     // r3  rule 2 with r1 (phone + name)
  r('Trần Thị Bình', 'binh@gmail.com', '0912345678', 'richlife'),  // r4  rule 3: same phone, other name
  r('Lê Minh Châu', 'lechau@gmail.com', '0933000111'),             // r5
  r('Lê Minh Châu', 'lechau@yahoo.com', '0944000222'),             // r6  rule 5 with r5
  r('Lê Minh Châu', 'chau.le@outlook.com', ''),                    // r7  rule 4: name only, separate
  r('Khách 1', 'k1@gmail.com', '0977000000'), r('Khách 2', 'k2@gmail.com', '0977000000'),
  r('Khách 3', 'k3@gmail.com', '0977000000'), r('Khách 4', 'k4@gmail.com', '0977000000'), // rule 8: shared phone, 4 names
  r('Khách 4', 'k4b@gmail.com', '0977000000'),                     // would match "Khách 4" by name, but the phone is shared
  r('Test', 'test1@gmail.com', '0911111111'), r('Test', 'test2@gmail.com', '0911111111'), // rule 11: test phone
];
const { groups, candidates, sharedPhones } = cluster(rows);
const groupOf = id => groups.findIndex(g => g.some(x => x.id === id));
assert.equal(groupOf('r1'), groupOf('r2'), 'rule 1');
assert.equal(groupOf('r1'), groupOf('r3'), 'rule 2 (and 7: r2 joins through r1)');
assert.notEqual(groupOf('r1'), groupOf('r4'), 'rule 3: not merged');
assert.ok(candidates.some(c => c.reason === 'same_phone_other_name' && [c.a, c.b].includes(groupOf('r4'))), 'rule 3: candidate');
assert.notEqual(groupOf('r5'), groupOf('r6'));
assert.ok(candidates.some(c => c.reason === 'same_name_similar_email' && [c.a, c.b].sort().join() === [groupOf('r5'), groupOf('r6')].sort().join()), 'rule 5');
assert.ok(!candidates.some(c => [c.a, c.b].includes(groupOf('r7'))), 'rule 4: same name, unrelated email: no candidate');
assert.equal(sharedPhones.length, 1); assert.equal(sharedPhones[0].phone, '0977000000');
assert.notEqual(groupOf('r11'), groupOf('r12'), 'rule 8: a shared phone joins nobody');
assert.ok(!candidates.some(c => c.key === '0977000000'), 'rule 8: no candidates for a shared phone');
assert.notEqual(groupOf('r13'), groupOf('r14'), 'rule 11: test phone ignored');
// Rule 1 exception: same email, names clearly different → review, not merged; empty name merges.
const fam = cluster([r('Nguyễn Hà Linh', 'home@gmail.com', ''), r('Phạm Quốc Tuấn', 'home@gmail.com', ''), r('', 'home@gmail.com', '')]);
assert.equal(fam.groups.length, 2, 'Different names stay apart; the nameless one joins');
assert.ok(fam.candidates.some(c => c.reason === 'same_email_other_name' && c.key === 'home@gmail.com'));
// Rule 9: a "not the same person" decision keeps two registrations apart.
const apart = cluster([r('Phạm Dũng', 'd1@gmail.com', '0988000111'), r('Dũng', 'd2@gmail.com', '0988000111')], { notSame: new Set([`r${n - 1}|r${n}`]) });
assert.equal(apart.groups.length, 2);
assert.equal(groups.find(g => g.some(x => x.id === 'r1'))[0].id, 'r1', 'Oldest registration first');
console.log('PASS: identity rules 1–5, 7–9, 11 (email, phone+name, review candidates, name-only separate, chains, shared and test phones, not-same decisions).');

// Contact summary (src/contacts/service.js): first touch from the earliest arrival, old WordPress
// forms included; last touch = the latest registration's own source, empty when it had none.
{
  const { summary } = require('../src/contacts/service');
  const zoomLead = { id: 'z', name: 'Biên', email: 'b@vinmoc.com', phone: '', page_id: 'zoom', registered_at: '2026-07-07T12:40:23Z', utm_source: 'zoom', utm_medium: 'meeting', utm_campaign: '822' };
  const trading = { id: 't', name: 'Biên', email: 'b@gmail.com', phone: '0987767889', page_id: 'trading', registered_at: '2026-10-21T09:51:59Z', utm_source: '',
    imported_forms: [{ at: '2025-03-17T16:06:51Z', page: 'wp:nennhat', source: '' }, { at: '2023-05-28T13:58:25Z', page: 'wordpress', source: '' }] };
  const s = summary([zoomLead, trading]);
  assert.equal(s.first_registered_at, '2023-05-28T13:58:25.000Z', 'Known since the oldest WordPress form');
  assert.deepEqual([s.first_touch.site, s.first_touch.source, s.first_touch.page_id], ['wordpress', '', 'wordpress']);
  assert.deepEqual([s.last_touch.source, s.last_touch.page_id, s.last_touch.at], ['', 'trading', '2026-10-21T09:51:59.000Z'], 'Latest registration without a source is not given the Zoom source');
  const tagged = summary([zoomLead, { ...trading, imported_forms: null, last_touch: { source: 'facebook', medium: 'cpc', at: '2026-10-20T01:00:00Z', landing_path: '/trading' } }]);
  assert.deepEqual([tagged.first_touch.source, tagged.last_touch.source, tagged.last_touch.landing_path], ['zoom', 'facebook', '/trading']);
  console.log('PASS: contact summary — WordPress history as first arrival, last touch from the latest registration only.');
}
