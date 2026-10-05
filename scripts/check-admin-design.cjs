// Guard the design rules that previously caused silent regressions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');
const css = postcss.parse(fs.readFileSync('src/admin/styles.css', 'utf8'));
const selectors = new Set();
css.walkRules(rule => {
  const parents = [];
  for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) parents.unshift(`@${p.name} ${p.params}`);
  const key = `${parents.join('|')}|${rule.selector}`;
  assert(!selectors.has(key), `Repeated selector: ${key}. Replace its original definition.`);
  selectors.add(key);
  const props = new Set();
  rule.walkDecls(decl => {
    assert(!props.has(decl.prop), `Repeated declaration: ${rule.selector}/${decl.prop}`);
    props.add(decl.prop);
    if (decl.prop === 'font-size' && /^\d+(\.\d+)?px$/.test(decl.value)) assert(parseFloat(decl.value) >= 12, `Text below 12px: ${rule.selector}`);
  });
});
const app = fs.readFileSync('src/admin/app.js', 'utf8');
assert(!/\b(?:window\.)?(?:confirm|prompt)\(/.test(app), 'Use the shared accessible dialog.');
assert(!/Chart\.js|window\.Chart|new Chart\(/.test(app), 'Use the shared Recharts component.');
assert(!/h\('select'/.test(app), 'Use the shared Base UI Select.');
assert(!/doughnut|type: 'pie'/.test(app), 'Use bar / line charts.');
console.log('Admin design checks passed: unique selectors/declarations, readable text, shared controls and charts.');
