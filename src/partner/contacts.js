// A partner "contact" is one person: the CRM leads (one per funnel) that belong together.
// - The same email always means the same person.
// - The same phone only joins leads whose names match (one name's words all appear in the
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
    const byEmail = new Map(), byPhone = new Map();
    registrations.forEach((row, i) => {
      const email = emailKey(row.email), phone = phoneKey(row.phone);
      if (email) { if (byEmail.has(email)) join(i, byEmail.get(email)); else byEmail.set(email, i); }
      if (phone) { if (!byPhone.has(phone)) byPhone.set(phone, []); byPhone.get(phone).push(i); }
    });
    for (const rows of byPhone.values()) {
      for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
        if (find(rows[a]) !== find(rows[b]) && namesMatch(registrations[rows[a]].name, registrations[rows[b]].name)) join(rows[a], rows[b]);
      }
    }
    const groups = new Map();
    registrations.forEach((row, i) => { const root = find(i); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(row); });
    const byId = new Map(), contactsByEmail = new Map(), contactsByPhone = new Map(), byRegistration = new Map();
    for (const rows of groups.values()) {
      rows.sort(byDate);
      const emails = [...new Set(rows.map(row => emailKey(row.email)).filter(Boolean))];
      const phones = [...new Set(rows.map(row => phoneKey(row.phone)).filter(Boolean))];
      if (!emails.length && !phones.length) continue;
      const first = rows[0];
      // A contact without email is keyed by phone and name: several people may share the phone.
      const anchor = emailKey(first.email) ? `email:${emailKey(first.email)}` : emails.length ? `email:${emails[0]}` : `phone:${phoneKey(first.phone) || phones[0]}:${nameWords(first.name).join(' ')}`;
      const contact = {
        contact_id: contactId(anchor),
        name: String([...rows].reverse().find(row => String(row.name || '').trim())?.name || '').trim(),
        emails, phones, registrations: rows,
        latest_email: [...rows].reverse().map(row => emailKey(row.email)).find(Boolean) || '',
        latest_phone: [...rows].reverse().map(row => phoneKey(row.phone)).find(Boolean) || '',
      };
      byId.set(contact.contact_id, contact);
      for (const email of emails) { contactsByEmail.set(email, contact); if (!byId.has(contactId(`email:${email}`))) byId.set(contactId(`email:${email}`), contact); }
      for (const phone of phones) { if (!contactsByPhone.has(phone)) contactsByPhone.set(phone, []); contactsByPhone.get(phone).push(contact); }
      for (const row of rows) byRegistration.set(row.id, contact);
    }
    return { byId, contactsByEmail, contactsByPhone, byRegistration };
  }
  const index = registrations => { if (!built.has(registrations)) built.set(registrations, build(registrations)); return built.get(registrations); };

  return {
    // { contact, match } or null. Email wins over phone. A phone shared by several contacts
    // returns the one that registered with it last; match.other_contacts counts the others.
    lookup(registrations, { email, phone } = {}) {
      const { contactsByEmail, contactsByPhone } = index(registrations);
      const byMail = emailKey(email) && contactsByEmail.get(emailKey(email));
      if (byMail) return { contact: byMail, match: { by: 'email', value: emailKey(email), other_contacts: 0 } };
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
