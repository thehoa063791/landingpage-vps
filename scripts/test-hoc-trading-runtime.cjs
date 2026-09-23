const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const testModules = process.env.HOC_TEST_NODE_MODULES || path.join(require('node:os').tmpdir(), 'hoc-trading-runtime-check/node_modules');
const { JSDOM, VirtualConsole, ResourceLoader } = require(path.join(testModules, 'jsdom'));
const root = path.resolve('pages/hoc-trading');
class LocalResources extends ResourceLoader {
  fetch(url) {
    const parsed = new URL(url);
    let file;
    if (parsed.protocol === 'file:') file = fileURLToPath(parsed);
    else if (parsed.pathname.startsWith('/p/hoc-trading/')) file = path.join(root, parsed.pathname.slice('/p/hoc-trading/'.length));
    else if (parsed.pathname.startsWith('/pages/hoc-trading/')) file = path.join(root, parsed.pathname.slice('/pages/hoc-trading/'.length));
    else if (parsed.pathname === '/js/meta-pixel.js') file = path.resolve('public/js/meta-pixel.js');
    if (!file) return null; // No analytics/CDN traffic during this test.
    assert.ok(fs.existsSync(file), 'Missing runtime asset: ' + file);
    return Promise.resolve(fs.readFileSync(file));
  }
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check(url, file, preview) {
  const errors = [], requests = [];
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const vc = new VirtualConsole();
  vc.on('error', (...args) => errors.push(args.join(' ')));
  vc.on('jsdomError', error => { if (!error.message.includes('navigation')) errors.push(error.message); });
  const dom = new JSDOM(html, {
    url, runScripts: 'dangerously', resources: new LocalResources(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.fetch = async (requestUrl, init) => {
        requests.push({ url: requestUrl, init });
        return { ok: true, text: async () => html, json: async () => requestUrl === '/api/register' ? { success: true, event_id: 'test-registration' } : { enabled: false } };
      };
    },
  });
  try {
    const w = dom.window, doc = w.document;
    for (let attempt = 0; attempt < 100 && !doc.querySelector('#dc-root h1'); attempt++) await wait(30);
    assert.ok(doc.querySelector('#dc-root h1'), 'Page must render: ' + url);
    assert.equal(doc.querySelectorAll('.sc-placeholder-error').length, 0);
    if (file === 'home.html') {
      const inputs = [...doc.querySelectorAll('#dc-root input')];
      assert.equal(inputs.length, 3);
      const problemGrid = doc.querySelector('#van-de [style*="grid-template-columns"]');
      assert.equal(problemGrid.style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
      w.innerWidth = 375;
      w.dispatchEvent(new w.Event('resize'));
      await wait(30);
      assert.equal(problemGrid.style.gridTemplateColumns, 'minmax(0, 1fr)');
      const testimonial = doc.querySelector('#kiem-chung img');
      testimonial.click();
      await wait(30);
      const zoom = doc.querySelector('#kiem-chung [style*="position: fixed"]');
      assert.ok(zoom, 'Gallery event binding must still open the image');
      zoom.click();
      await wait(30);
      const button = doc.querySelector('#dc-root button');
      assert.equal(button.disabled, false);
      button.click();
      await wait(30);
      assert.match(doc.querySelector('#dang-ky').textContent, /Vui lòng nhập họ và tên/);
      const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
      for (const [i, value] of ['Test User', '0901234567', 'test@example.com'].entries()) {
        setter.call(inputs[i], value);
        inputs[i].dispatchEvent(new w.Event('input', { bubbles: true }));
      }
      button.click();
      await wait(450);
      if (preview) {
        assert.ok(!requests.some(r => r.url === '/api/register'));
        assert.match(doc.querySelector('#dang-ky').textContent, /bản xem trước/);
      } else {
        const saved = requests.find(r => r.url === '/api/register');
        assert.ok(saved, 'Valid form must reach registration API');
        assert.equal(JSON.parse(saved.init.body).name, 'Test User');
        assert.equal(w.HocTradingRegistration.receipt().id, 'test-registration');
      }
      for (const image of doc.querySelectorAll('#dc-root img')) {
        assert.ok(!image.src.includes('/p/hoc-trading/') || !preview, 'Preview image must resolve locally');
      }
    } else {
      assert.ok(doc.querySelector('a[href="tel:0862421919"]'));
      assert.ok(!doc.querySelector('#dc-root').textContent.includes('Biên nhận'));
    }
    assert.deepEqual(errors, []);
    console.log('PASS runtime:', url);
  } finally { dom.window.close(); }
}
(async () => {
  await check('https://example.test/hoc-trading', 'home.html', false);
  await check('http://localhost:5500/pages/hoc-trading/home.html', 'home.html', true);
  await check(pathToFileURL(path.join(root, 'home.html')).href, 'home.html', true);
  await check('https://example.test/thank-you-hoc-trading', 'register-sucess.html', false);
})().catch(error => { console.error(error); process.exitCode = 1; });
