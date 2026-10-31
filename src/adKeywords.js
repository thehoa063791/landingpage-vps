// Which Facebook campaigns belong to which funnel (Dashboard > Compare): the campaign name holds
// a funnel keyword ("01/10/2026_fb_conversion_dongtien", "22/10/2026_fb_message_htkt"). The
// registrations' utm_campaign does not name the campaign ("video", "zalo"), so names are the
// link. Editable per funnel in the admin; a funnel never saved uses its default keywords.
const { getCrmSetting, setCrmSetting } = require('./storage');

const KEY = 'funnel_ad_keywords';
const DEFAULTS = { 'dong-tien': ['dongtien'], trading: ['htkt'], richlife: ['richlife'] };
const MAX = 10;

const clean = list => [...new Set((Array.isArray(list) ? list : String(list || '').split(','))
  .map(k => String(k).trim().toLowerCase()).filter(k => k && k.length <= 40))].slice(0, MAX);
// ilike patterns for the keywords (% _ \ taken literally).
const patterns = keywords => keywords.map(k => `%${k.replace(/[\\%_]/g, ch => `\\${ch}`)}%`);

// { slug: [keyword, ...] } for every funnel with keywords.
async function allKeywords() {
  const saved = await getCrmSetting(KEY, {}).catch(() => ({})) || {};
  const out = { ...DEFAULTS };
  for (const [slug, row] of Object.entries(saved)) out[slug] = clean(row?.keywords);
  return out;
}

async function saveKeywords(slug, keywords) {
  const all = { ...(await getCrmSetting(KEY, {}) || {}) };
  all[slug] = { keywords: clean(keywords), updated_at: new Date().toISOString() };
  await setCrmSetting(KEY, all);
  return { slug, keywords: all[slug].keywords };
}

module.exports = { allKeywords, saveKeywords, clean, patterns, DEFAULTS };
