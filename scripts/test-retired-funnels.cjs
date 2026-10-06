const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverFunnels, findFunnel } = require('../src/funnels');

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-funnels-'));
try {
  for (const slug of ['workshop', 'richlife-v2', 'richlife', 'hoc-trading', 'dong-tien']) {
    fs.mkdirSync(path.join(fixtureDir, slug));
    fs.writeFileSync(path.join(fixtureDir, slug, 'index.html'), `<title>${slug}</title>`);
  }
  const funnels = discoverFunnels(fixtureDir);
  assert.deepEqual(funnels.map(row => row.slug).sort(), ['dong-tien', 'hoc-trading', 'richlife']);
  assert.equal(findFunnel(funnels, 'richlife-v2', '').slug, 'richlife', 'Historical attribution remains available');
  assert.equal(findFunnel(funnels, 'workshop', '/p/workshop') == null, true);
  assert.equal(discoverFunnels().some(row => ['workshop', 'richlife-v2'].includes(row.slug)), false);
  console.log('PASS: retired folders excluded; active funnels and historical attribution preserved');
} finally {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
}
