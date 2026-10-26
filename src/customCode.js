// Mã nhúng của từng phễu (Admin > Funnels > một phễu > Mã nhúng): header code goes before
// </head>, body code right after <body>, on every page of the funnel. HTML pages get it on the
// server (src/routes/pages.js); the Next.js course pages load loaderScript() instead.
const { getCrmSetting, setCrmSetting } = require('./storage');

const KEY = 'funnel_custom_code';
const MAX_LENGTH = 50000;
const TTL = 30000;

let cache = {};
let loadedAt = 0;
let loading = null;

// Settings saved on another server instance show up within TTL.
function ready() {
  if (Date.now() - loadedAt < TTL) return Promise.resolve();
  loading ||= getCrmSetting(KEY, {})
    .then(value => { cache = value && typeof value === 'object' ? value : {}; loadedAt = Date.now(); })
    .catch(error => { console.warn('[custom-code] load failed:', error.message); loadedAt = Date.now() - TTL + 5000; })
    .finally(() => { loading = null; });
  return loading;
}

function codeOf(slug) {
  const row = cache[slug] || {};
  return { head: row.head || '', body: row.body || '', updated_at: row.updated_at || null };
}

async function getCode(slug) {
  await ready();
  return codeOf(slug);
}

async function saveCode(slug, { head = '', body = '' } = {}) {
  const clean = value => String(value || '').slice(0, MAX_LENGTH);
  const all = { ...(await getCrmSetting(KEY, {}) || {}) };
  const row = { head: clean(head), body: clean(body), updated_at: new Date().toISOString() };
  if (row.head.trim() || row.body.trim()) all[slug] = row; else delete all[slug];
  await setCrmSetting(KEY, all);
  cache = all; loadedAt = Date.now();
  return codeOf(slug);
}

// Uses the cache: callers await ready() first (the pages router does it per request).
function inject(html, slug) {
  const { head, body } = codeOf(slug);
  let out = html;
  if (head.trim()) out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, () => `${head}\n</head>`) : `${head}\n${out}`;
  if (body.trim()) out = /<body\b[^>]*>/i.test(out) ? out.replace(/<body\b[^>]*>/i, match => `${match}\n${body}`) : `${out}\n${body}`;
  return out;
}

// Script for pages the server does not render (Next.js course app): adds the same code to the
// page once. Scripts inserted with innerHTML do not run, so each one is recreated.
function loaderScript(slug) {
  const { head, body } = codeOf(slug);
  if (!head.trim() && !body.trim()) return '/* no custom code */\n';
  return `(function () {
  if (window.__funnelCustomCode) return;
  window.__funnelCustomCode = true;
  function add(html, target, first) {
    if (!html) return;
    var box = document.createElement('div');
    box.innerHTML = html;
    var nodes = Array.prototype.slice.call(box.childNodes);
    var anchor = first ? target.firstChild : null;
    nodes.forEach(function (node) {
      if (node.nodeName === 'SCRIPT') {
        var script = document.createElement('script');
        Array.prototype.forEach.call(node.attributes, function (a) { script.setAttribute(a.name, a.value); });
        script.text = node.text;
        node = script;
      }
      target.insertBefore(node, anchor);
    });
  }
  add(${JSON.stringify(head).replace(/</g, '\\u003c')}, document.head, false);
  add(${JSON.stringify(body).replace(/</g, '\\u003c')}, document.body, true);
})();\n`;
}

module.exports = { ready, getCode, saveCode, inject, loaderScript, MAX_LENGTH };
