const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const base = fs.readFileSync('scripts/test-hoc-trading-tracking.cjs', 'utf8');
function run(source, label) {
  const result = spawnSync(process.execPath, ['-e', source], { encoding: 'utf8' });
  assert.equal(result.status, 0, label + '\n' + result.stdout + result.stderr);
  console.log('PASS: ' + label);
}
for (const [slug, prefix, page] of [
  ['richlife-short', 'richlife_short', 'richlife-short'],
  ['richlife-medium', 'richlife_medium', 'richlife-medium'],
  ['richlife', 'richlife_v2', 'richlife-v2'],
]) {
  let source = base.replaceAll('hoc-trading', page).replaceAll('hoc_trading', prefix).replaceAll('HocTradingTracking', 'RichlifeTracking');
  source = source.replace(`pages/${page}/tracking.js`, `pages/${slug}/tracking.js`);
  source = source.replace("a.listeners['doc:focusin']({target:{closest:()=>true}});", "a.listeners['form:focusin']();");
  run(source, slug + ': attribution, browser/server IDs, form/CTA/scroll, conversion and thank-you');
}
const conversionTest = fs.readFileSync('scripts/test-richlife-bni-tracking.cjs', 'utf8');
for (const [slug, page, currency] of [['trading', 'trading', 'USD'], ['30s', '30strading-email-course', 'VND']]) {
  let source = conversionTest.replace("pages/richlife-bni/conversion.js", "public/js/lead-conversion.js")
    .replaceAll('richlife-bni', page).replaceAll('RichlifeBniConversion', 'LandingConversion')
    .replace('const context = { Date,', `const context = { document: { currentScript: { dataset: { page: '${page}', currency: '${currency}' } } }, Date,`);
  source = source.replace("assert.equal(a.pixels.length, 1);", `assert.equal(a.pixels[0][2].currency, '${currency}'); assert.equal(a.pixels[0][2].content_name, '${page}'); assert.equal(a.pixels.length, 1);`);
  run(source, slug + ': conversion, currency, configuration guard and thank-you recovery');
  for (const file of ['index.html', 'thank-you.html']) assert.ok(fs.readFileSync(`pages/${slug}/${file}`, 'utf8').includes('/js/lead-conversion.js'));
}
for (const slug of ['richlife-short', 'richlife-medium', 'richlife', 'hoc-trading']) {
  const source = fs.readFileSync(`pages/${slug}/tracking.js`, 'utf8');
  assert.ok(source.includes("window.__META_BROWSER_PIXEL?.initialized && typeof window.fbq"), slug + ' honors project Pixel configuration');
}
console.log('PASS: all static landing conversion integrations');
