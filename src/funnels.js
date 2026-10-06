const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(__dirname, '..', 'pages');
// Retired pages must stay out of admin even if an old deployment leaves their folders behind.
const RETIRED_FUNNELS = new Set(['workshop', 'richlife-v2']);
const KNOWN_ALIASES = {
  dongtien: ['dongtien'],
  '30s': ['30s', '30strading-email-course', '30s-trading'],
  workshop: ['workshop', 'trading-mastery-workshop'],
  'hoc-trading': ['hoc-trading'],
  richlife: ['richlife', 'richlife-v2'],
  'richlife-short': ['richlife-short'],
  'richlife-medium': ['richlife-medium'],
  'richlife-bni': ['richlife-bni'],
  'richlife-live': ['richlife-live'],
  free: ['free'],
};

function titleFromSlug(slug) {
  return slug.split(/[-_]/).filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function discoverFunnels(pagesDir = PAGES_DIR) {
  let entries = [];
  try { entries = fs.readdirSync(pagesDir, { withFileTypes: true }); } catch { return []; }
  return entries.filter(entry => entry.isDirectory() && !RETIRED_FUNNELS.has(entry.name)).map(entry => {
    const slug = entry.name;
    const dir = path.join(pagesDir, slug);
    const files = fs.readdirSync(dir).filter(name => /\.(?:html|js)$/i.test(name));
    const pageIds = new Set(KNOWN_ALIASES[slug] || [slug]);
    let title = titleFromSlug(slug);
    let hasThankYou = false;
    for (const name of files) {
      hasThankYou ||= /thank|success|sucess/i.test(name);
      let source = '';
      try { source = fs.readFileSync(path.join(dir, name), 'utf8'); } catch { continue; }
      const titleMatch = source.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && /(?:index|home)\.html/i.test(name)) title = titleMatch[1].replace(/\s+/g, ' ').trim();
      for (const match of source.matchAll(/pageId\s*:\s*['"]([^'"]+)['"]/g)) {
        const id = match[1].replace(/-(?:thank-you|thankyou|success|sucess)$/i, '');
        if (id) pageIds.add(id);
      }
    }
    return { id: slug, slug, name: title, page_ids: [...pageIds], has_thank_you: hasThankYou, url: `/p/${slug}` };
  }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function isThankYou(value) {
  return /thank[-_ ]?you|register[-_ ]?su+c?ess|\/thank-you/i.test(String(value || ''));
}

function findFunnel(funnels, pageId, url) {
  const clean = String(pageId || '').replace(/-(?:thank-you|thankyou|success|sucess)$/i, '');
  // Exact match first so e.g. "richlife-bni" is not claimed by the "richlife" prefix.
  const byId = funnels.find(funnel => funnel.page_ids.includes(clean))
    || funnels.find(funnel => funnel.page_ids.some(id => clean.startsWith(id + '-')));
  if (byId) return byId;
  const match = String(url || '').match(/\/p\/([^/?#]+)/);
  return match ? funnels.find(funnel => funnel.slug === match[1]) : null;
}

module.exports = { discoverFunnels, findFunnel, isThankYou };
