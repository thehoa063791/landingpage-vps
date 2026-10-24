// node scripts/test-partner-contacts.cjs — partner API people (src/partner/contacts.js) once leads
// carry their CRM contact (contact step 4): grouping by contact, family emails, old IDs.
const assert = require('node:assert/strict');
const { createContactIndex } = require('../src/partner/contacts');

const index = createContactIndex({ secret: 'partner-contacts-test-secret-with-32-chars' });
const lead = (id, name, email, phone, page, at, contact_id = null) => ({ id, name, email, phone, page_id: page, registered_at: at, contact_id });
const before = [
  lead('a1', 'Nguyễn Văn An', 'an@gmail.com', '0912000001', 'trading', '2026-01-01T00:00:00Z'),
  lead('a2', 'Trần Bình', 'binh@gmail.com', '0912000001', 'dong-tien', '2026-02-01T00:00:00Z'),
  lead('h1', 'Lê Hà', 'home@gmail.com', '', 'zoom-event', '2026-03-01T00:00:00Z'),
  lead('h2', 'Phạm Tuấn', 'home@gmail.com', '', 'richlife', '2026-03-02T00:00:00Z'),
];
// Without contacts (old rules): the family email joins Hà and Tuấn; An and Bình stay apart.
const oldHome = index.lookup(before, { email: 'home@gmail.com' }).contact;
assert.equal(oldHome.registrations.length, 2);
const oldAn = index.lookup(before, { email: 'an@gmail.com' }).contact;
assert.equal(oldAn.registrations.length, 1);

// With contacts: an admin merged An and Bình; Hà and Tuấn are two people sharing an email.
const after = before.map(r => ({ ...r }));
Object.assign(after[0], { contact_id: 'c-an' }); Object.assign(after[1], { contact_id: 'c-an' });
Object.assign(after[2], { contact_id: 'c-ha' }); Object.assign(after[3], { contact_id: 'c-tuan' });
const an = index.lookup(after, { email: 'binh@gmail.com' });
assert.deepEqual(an.contact.registrations.map(r => r.id), ['a1', 'a2'], 'Merged by the admin: one person');
assert.equal(an.contact.contact_id, oldAn.contact_id, 'The person keeps the ID of its earliest email');
const home = index.lookup(after, { email: 'home@gmail.com' });
assert.deepEqual([home.contact.name, home.match.other_contacts], ['Phạm Tuấn', 1], 'Family email: latest person, the other counted');
// The ID saved before (derived from the family email) still resolves, to the first of them.
assert.equal(index.byId(after, oldHome.contact_id).name, 'Lê Hà');
// An old alias of Bình's email leads to the merged person.
const binhOld = index.lookup(before, { email: 'binh@gmail.com' }).contact.contact_id;
assert.equal(index.byId(after, binhOld).registrations.length, 2);
// A lead not linked to a contact yet still joins by email.
const fresh = [...after, lead('a3', 'An', 'an@gmail.com', '', 'breakout', '2026-04-01T00:00:00Z')];
assert.equal(index.lookup(fresh, { email: 'an@gmail.com' }).contact.registrations.length, 3);
console.log('PASS: partner people follow CRM contacts (admin merges, family emails apart with other_contacts), old IDs and email aliases resolve, unlinked leads join by email.');
