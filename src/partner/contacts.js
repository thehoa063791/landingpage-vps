// A partner "contact" is one person: the CRM leads (one per funnel) that share an email or a
// phone number. Its contact_id is an HMAC of the earliest lead's email (or phone), so it is
// stable, reveals nothing, and needs no table. When a new lead joins two contacts, the ID
// derived from any email/phone of the merged contact still resolves (to the canonical one).
const crypto = require('crypto');
const { normalizeContactPhoneKey } = require('../storage');

const emailKey = value => String(value || '').trim().toLowerCase();
const phoneKey = value => { const key = normalizeContactPhoneKey(value); return /^\d{9,11}$/.test(key) ? key : ''; };
const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function createContactIndex({ secret }) {
  const built = new WeakMap();
  const contactId = anchor => `ct_${crypto.createHmac('sha256', secret).update(anchor).digest('base64url').slice(0, 22)}`;

  function build(registrations) {
    // Union-find over shared emails and phones.
    const parent = registrations.map((_, i) => i);
    const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    const owners = new Map();
    registrations.forEach((row, i) => {
      for (const key of [emailKey(row.email) && `email:${emailKey(row.email)}`, phoneKey(row.phone) && `phone:${phoneKey(row.phone)}`].filter(Boolean)) {
        if (owners.has(key)) parent[find(i)] = find(owners.get(key)); else owners.set(key, i);
      }
    });
    const groups = new Map();
    registrations.forEach((row, i) => { const root = find(i); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(row); });
    const byId = new Map(), byKey = new Map(), byRegistration = new Map();
    for (const rows of groups.values()) {
      rows.sort((a, b) => String(a.registered_at || '').localeCompare(String(b.registered_at || '')));
      const keys = [...new Set(rows.flatMap(row => [emailKey(row.email) && `email:${emailKey(row.email)}`, phoneKey(row.phone) && `phone:${phoneKey(row.phone)}`]).filter(Boolean))];
      if (!keys.length) continue;
      const first = rows[0], anchor = emailKey(first.email) ? `email:${emailKey(first.email)}` : phoneKey(first.phone) ? `phone:${phoneKey(first.phone)}` : keys[0];
      const latestName = [...rows].reverse().find(row => String(row.name || '').trim())?.name || '';
      const contact = {
        contact_id: contactId(anchor),
        name: String(latestName).trim(),
        emails: keys.filter(k => k.startsWith('email:')).map(k => k.slice(6)),
        phones: keys.filter(k => k.startsWith('phone:')).map(k => k.slice(6)),
        registrations: rows,
      };
      for (const key of keys) { byKey.set(key, contact); byId.set(contactId(key), contact); }
      for (const row of rows) byRegistration.set(row.id, contact);
    }
    return { byId, byKey, byRegistration };
  }
  const index = registrations => { if (!built.has(registrations)) built.set(registrations, build(registrations)); return built.get(registrations); };

  return {
    // Email wins over phone when both are given and point to different people.
    lookup(registrations, { email, phone } = {}) {
      const { byKey } = index(registrations);
      return (emailKey(email) && byKey.get(`email:${emailKey(email)}`)) || (phoneKey(phone) && byKey.get(`phone:${phoneKey(phone)}`)) || null;
    },
    byId: (registrations, id) => index(registrations).byId.get(String(id)) || null,
    byRegistration: (registrations, id) => index(registrations).byRegistration.get(String(id)) || null,
  };
}

module.exports = { createContactIndex, emailKey, phoneKey, isEmail };
