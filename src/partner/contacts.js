// A partner "contact" is one person: the CRM leads (one per funnel) that belong together.
// Since contact step 4 (2026-10-24) the person is the CRM contact (registrations.contact_id,
// src/contacts/): the same identity rules and the admin's merge/split decisions. Leads not
// linked to a contact yet (just created, or without the database) are grouped as before:
// - the same email joins them;
// - the same phone only joins leads whose names match (one name's words all appear in the
//   other, ignoring accents and case), since families share numbers and numbers get mistyped.
// Its contact_id is an HMAC of the earliest lead's email, so it is stable, reveals nothing,
// and needs no table; the ID derived from any email of a contact resolves to it.
const crypto = require('crypto');
const { normalizeContactPhoneKey } = require('../storage');

const emailKey = value => String(value || '').trim().toLowerCase();
const phoneKey = value => { const key = normalizeContactPhoneKey(value); return /^\d{9,11}$/.test(key) ? key : ''; };
const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const nameWords = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
// "Hòa" and "Thế Hòa" match "Đinh Thế Hòa"; an empty name matches nothing.
function namesMatch(a, b) {
  const x = nameWords(a), y = nameWords(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)];
  return short.every(word => long.has(word));
}
const byDate = (a, b) => String(a.registered_at || '').localeCompare(String(b.registered_at || ''));

function createContactIndex({ secret }) {
  const built = new WeakMap();
  const contactId = anchor => `ct_${crypto.createHmac('sha256', secret).update(anchor).digest('base64url').slice(0, 22)}`;

  function build(registrations) {
    const parent = registrations.map((_, i) => i);
    const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    const join = (a, b) => { parent[find(a)] = find(b); };
    const byEmail = new Map(), byPhone = new Map(), byContact = new Map();
    registrations.forEach((row, i) => {
      if (row.contact_id) { if (byContact.has(row.contact_id)) join(i, byContact.get(row.contact_id)); else byContact.set(row.contact_id, i); }
      const email = emailKey(row.email), phone = phoneKey(row.phone);
      if (email) { if (!byEmail.has(email)) byEmail.set(email, []); byEmail.get(email).push(i); }
      if (phone) { if (!byPhone.has(phone)) byPhone.set(phone, []); byPhone.get(phone).push(i); }
    });
    // Rules for leads without a contact; two leads that both have one follow their contacts.
    const ruled = (a, b) => !(registrations[a].contact_id && registrations[b].contact_id);
    for (const rows of byEmail.values()) {
      for (let a = 1; a < rows.length; a++) if (ruled(rows[0], rows[a])) join(rows[a], rows[0]);
      if (rows.length > 2) for (let a = 1; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) if (ruled(rows[a], rows[b])) join(rows[a], rows[b]);
    }
    for (const rows of byPhone.values()) {
      for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
        if (ruled(rows[a], rows[b]) && find(rows[a]) !== find(rows[b]) && namesMatch(registrations[rows[a]].name, registrations[rows[b]].name)) join(rows[a], rows[b]);
      }
    }
    const groups = new Map();
    registrations.forEach((row, i) => { const root = find(i); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(row); });
    const byId = new Map(), contactsByEmail = new Map(), contactsByPhone = new Map(), byRegistration = new Map();
    const built = [];
    // Earliest people first, so an email shared by a family keeps pointing at the first of them.
    for (const rows of [...groups.values()].map(list => list.sort(byDate)).sort((x, y) => byDate(x[0], y[0]))) {
      rows.sort(byDate);
      const emails = [...new Set(rows.map(row => emailKey(row.email)).filter(Boolean))];
      const phones = [...new Set(rows.map(row => phoneKey(row.phone)).filter(Boolean))];
      if (!emails.length && !phones.length) continue;
      const first = rows[0];
      // A contact without email is keyed by phone and name: several people may share the phone.
      const anchor = emailKey(first.email) ? `email:${emailKey(first.email)}` : emails.length ? `email:${emails[0]}` : `phone:${phoneKey(first.phone) || phones[0]}:${nameWords(first.name).join(' ')}`;
      const contact = {
        // Two people sharing their earliest email (a family email) cannot share an ID: the later one is keyed by its CRM contact.
        contact_id: byId.has(contactId(anchor)) ? contactId(first.contact_id ? `contact:${first.contact_id}` : `${anchor}:${first.id}`) : contactId(anchor),
        name: String([...rows].reverse().find(row => String(row.name || '').trim())?.name || '').trim(),
        emails, phones, registrations: rows,
        latest_email: [...rows].reverse().map(row => emailKey(row.email)).find(Boolean) || '',
        latest_phone: [...rows].reverse().map(row => phoneKey(row.phone)).find(Boolean) || '',
      };
      byId.set(contact.contact_id, contact);
      built.push(contact);
      for (const email of emails) { if (!contactsByEmail.has(email)) contactsByEmail.set(email, []); contactsByEmail.get(email).push(contact); }
      for (const phone of phones) { if (!contactsByPhone.has(phone)) contactsByPhone.set(phone, []); contactsByPhone.get(phone).push(contact); }
      for (const row of rows) byRegistration.set(row.id, contact);
    }
    // Aliases: the ID derived from any email of a contact resolves to it (an ID saved before two
    // profiles were merged keeps working). A contact's own ID always wins over an alias.
    for (const contact of built) for (const email of contact.emails) if (!byId.has(contactId(`email:${email}`))) byId.set(contactId(`email:${email}`), contact);
    return { byId, contactsByEmail, contactsByPhone, byRegistration };
  }
  const index = registrations => { if (!built.has(registrations)) built.set(registrations, build(registrations)); return built.get(registrations); };

  return {
    // { contact, match } or null. Email wins over phone. A phone shared by several contacts
    // returns the one that registered with it last; match.other_contacts counts the others.
    lookup(registrations, { email, phone } = {}) {
      const { contactsByEmail, contactsByPhone } = index(registrations);
      // An email shared by several people (a family email) returns the one who registered
      // with it last; match.other_contacts counts the others, as for a shared phone.
      const mailCandidates = (emailKey(email) && contactsByEmail.get(emailKey(email))) || [];
      if (mailCandidates.length) {
        const lastWithEmail = c => c.registrations.filter(row => emailKey(row.email) === emailKey(email)).map(row => String(row.registered_at || '')).sort().at(-1) || '';
        const contact = [...mailCandidates].sort((a, b) => lastWithEmail(b).localeCompare(lastWithEmail(a)))[0];
        return { contact, match: { by: 'email', value: emailKey(email), other_contacts: mailCandidates.length - 1 } };
      }
      const candidates = (phoneKey(phone) && contactsByPhone.get(phoneKey(phone))) || [];
      if (!candidates.length) return null;
      // The person who most recently registered with this phone.
      const lastWithPhone = c => c.registrations.filter(row => phoneKey(row.phone) === phoneKey(phone)).map(row => String(row.registered_at || '')).sort().at(-1) || '';
      const contact = [...candidates].sort((a, b) => lastWithPhone(b).localeCompare(lastWithPhone(a)))[0];
      return { contact, match: { by: 'phone', value: phoneKey(phone), other_contacts: candidates.length - 1 } };
    },
    byId: (registrations, id) => index(registrations).byId.get(String(id)) || null,
    byRegistration: (registrations, id) => index(registrations).byRegistration.get(String(id)) || null,
  };
}

module.exports = { createContactIndex, emailKey, phoneKey, isEmail, namesMatch };
