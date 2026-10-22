// node scripts/test-wp-leads.cjs — cleaning and merging of WordPress leads (scripts/wp-leads.cjs)
// on synthetic rows. The import SQL is checked against real Postgres separately (PGlite).
const assert = require('node:assert/strict');
const { cleanEmail, cleanPhone, cleanRegion, prepare, tuples, sameName, importId } = require('./wp-leads.cjs');

const stats = { emailTyposFixed: 0 };
assert.equal(cleanEmail(' An.Nguyen@GMAIL.con ', stats), 'an.nguyen@gmail.com'); assert.equal(stats.emailTyposFixed, 1);
assert.equal(cleanEmail('khong co', stats), '');
assert.equal(cleanEmail('a@b', stats), '');
assert.deepEqual(cleanPhone('+84 912 345 678'), { phone: '0912345678', kind: 'vn' });
assert.deepEqual(cleanPhone('912345678'), { phone: '0912345678', kind: 'vn' });
assert.deepEqual(cleanPhone('0911111111'), { phone: '', kind: 'test' });
assert.deepEqual(cleanPhone('0123456789'), { phone: '', kind: 'invalid' });
assert.deepEqual(cleanPhone('+1 415 555 0100'), { phone: '+14155550100', kind: 'intl' });
assert.deepEqual(cleanPhone('123'), { phone: '', kind: 'invalid' });
assert.equal(cleanRegion('Hà nội'), 'Hà Nội'); assert.equal(cleanRegion('TP HCM'), 'Hồ Chí Minh'); assert.equal(cleanRegion('Đồng nai'), 'Các tỉnh khác');
assert.equal(cleanRegion('Option B'), ''); assert.equal(cleanRegion('Nước Ngoài'), 'Nước ngoài');
assert.ok(sameName('Nguyễn Văn An', 'nguyen van an')); assert.ok(sameName('Nguyễn Văn An', 'Văn An')); assert.ok(!sameName('Nguyễn Văn An', 'Trần Bình')); assert.ok(!sameName('', 'An'));
assert.deepEqual([...tuples("(1,NULL,'O\\'Neil','a@x.vn','2024-01-02 03:04:05','{\\\"phone\\\":\\\"0912\\\"}'),(2,5,'B','','2024-01-01 00:00:00',NULL)")],
  [['1', null, "O'Neil", 'a@x.vn', '2024-01-02 03:04:05', '{"phone":"0912"}'], ['2', '5', 'B', '', '2024-01-01 00:00:00', null]]);

const rows = [
  { id: 1, name: 'Nguyễn Văn An', email: 'AN@gmail.com', date: '2023-05-01 10:00:00', cf: { phone: '0912345678', page_slug: 'loinhuan', mapping_hidden_347: 'facebook', mapping_hidden_549: 'convert', mapping_radio_131: 'Các tỉnh khác' } },
  { id: 2, name: 'An Nguyễn', email: 'an@gmail.con', date: '2024-02-01 09:00:00', cf: { phone: '+84 988 777 666', page_slug: 'richlife', mapping_hidden_347: 'google', mapping_radio_131: 'Hà Nội', mapping_radio_18: 'Chứng khoán, tài sản số, tiền tệ' } },
  { id: 3, name: 'Test', email: 'test@gmail.com', date: '2024-02-01 09:00:00', cf: { phone: '0912000000' } },
  { id: 4, name: 'Không email', email: '', date: '2022-01-01 08:00:00', cf: { inf_field_Phone1: '0977 111 222', inf_form_name: 'Form thông tin' } },
  { id: 5, name: 'Không liên hệ', email: 'sai', date: '2022-01-01 08:00:00', cf: { phone: '12' } },
  { id: 6, name: '', email: 'b@yahoo.com', date: '2021-03-03 03:03:03', cf: { inf_field_FirstName: 'Trần', inf_field_LastName: 'Bình', mapping_select_628: 'Khu vực khác' } },
];
const { leads, stats: s } = prepare(rows);
assert.deepEqual({ rows: s.rows, test: s.droppedTest, noContact: s.droppedNoContact, kept: s.entriesKept, leads: s.leads, phoneOnly: s.leadsPhoneOnly, twice: s.leadsRegisteredMoreThanOnce },
  { rows: 6, test: 1, noContact: 1, kept: 4, leads: 3, phoneOnly: 1, twice: 1 });
const an = leads.find(l => l.email === 'an@gmail.com');
assert.deepEqual({ name: an.name, phone: an.phone, region: an.region, interest: an.interest, first: an.registered_at, last: an.last_registered_at, source: an.utm_source, medium: an.utm_medium, pages: an.registrations.map(r => r.page) },
  { name: 'An Nguyễn', phone: '0988777666', region: 'Hà Nội', interest: 'Chứng khoán, tài sản số, tiền tệ', first: '2023-05-01T03:00:00.000Z', last: '2024-02-01T02:00:00.000Z', source: 'facebook', medium: 'convert', pages: ['loinhuan', 'richlife'] },
  'Latest contact details, first-touch attribution, full history (times are Vietnam local)');
assert.equal(leads.find(l => l.wp_key === 'phone:0977111222').registrations[0].form, 'Form thông tin');
assert.deepEqual({ name: leads.find(l => l.email === 'b@yahoo.com').name, region: leads.find(l => l.email === 'b@yahoo.com').region }, { name: 'Trần Bình', region: 'Các tỉnh khác' });
assert.match(importId(an), /^wp-[0-9a-f]{24}$/); assert.equal(importId(an), importId({ ...an }), 'Stable IDs make the import re-runnable');
console.log('PASS: WordPress leads: email/phone/region cleaning, test and contactless rows dropped, one lead per email (or phone) with latest details, first-touch UTM and full history, stable import IDs.');
