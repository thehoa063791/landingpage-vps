// Contacts at registration time (roadmap 3.4), for the routes that create leads: which person a
// form belongs to, and the person fields of a new registration's webhook. Without the database
// (local file storage) both stay empty and registration works as before.
const { discoverFunnels, findFunnel } = require('../funnels');

let funnels = null, funnelsAt = 0;
// Page IDs of one funnel ("trading", "trading-thank-you"...) count as the same funnel.
function funnelOfPage(pageId) {
  if (!funnels || Date.now() - funnelsAt > 60000) { funnels = discoverFunnels(); funnelsAt = Date.now(); }
  return findFunnel(funnels, pageId, '')?.slug || String(pageId || '');
}

async function usable() {
  try { return !!(await require('../storage').checkSupabase?.()); } catch { return false; }
}

async function personOf(form) {
  if (!await usable()) return null;
  return require('./service').matchPerson(form).catch(error => { console.warn('[contacts] person lookup failed:', error.message); return null; });
}

// contact_id, is_new_contact, is_new_funnel; {} when unknown. Never delays or fails a webhook.
async function personFields(registrationId) {
  if (!await usable()) return {};
  return require('./service').personFlags(registrationId, { funnelOf: funnelOfPage }).catch(error => { console.warn('[contacts] webhook fields unavailable:', error.message); return {}; });
}

// Contact step 4: the registration a person has in a course funnel, found by another email of
// the same person (an email already in their profile: matched earlier or merged by an admin).
// A family email shared by several people finds nobody. Returns the registration ID or null.
async function courseRegistrationOfPerson(email, pageId, { database } = {}) {
  const key = String(email || '').trim().toLowerCase();
  if (!key || !pageId) return null;
  if (!database && !await usable()) return null;
  const db = database || require('../db').pool;
  try {
    const { rows } = await db.query(`with person as (
        select min(i.contact_id::text)::uuid as contact_id from public.contact_identities i where i.kind = 'email' and i.value = $1 having count(distinct i.contact_id) = 1)
      select r.id from person join public.registrations r on r.contact_id = person.contact_id where r.page_id = $2 order by r.registered_at, r.id limit 1`, [key, pageId]);
    return rows[0]?.id || null;
  } catch (error) { console.warn('[contacts] course lookup by person failed:', error.message); return null; }
}

module.exports = { funnelOfPage, personOf, personFields, courseRegistrationOfPerson };
