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

module.exports = { funnelOfPage, personOf, personFields };
