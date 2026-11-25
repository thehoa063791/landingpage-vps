// /richlife A/B test: richlife-plan (full) vs richlife-plan-short. Real pages router, stubbed
// /api/register, no outside services. Checks the 50/50 draw, the sticky cookie (thank-you included),
// ?v= overrides, the old ?v=short/medium pages, and the short page itself at desktop and phone width.
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
require.cache[require.resolve('../src/storage')] = { exports: { supabase: null } };

const app = express();
const assets = express.static(path.resolve('pages'), { index: false, redirect: false });
app.use('/p', (req, res, next) => /\.html$/i.test(req.path) ? next() : assets(req, res, next));
app.use(require('../src/routes/pages'));
app.use(express.static(path.resolve('public')));

const variantOf = html => /\/p\/richlife-plan-short\/app\.js/.test(html) ? 'richlife-plan-short'
  : /\/p\/richlife-plan\/app\.js/.test(html) ? 'richlife-plan' : 'other';
const cookieOf = res => (res.headers.get('set-cookie') || '').match(/ab_richlife3=([^;]+)/)?.[1] || '';

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    // A new visitor is drawn into one of the two versions and gets a cookie that matches.
    const seen = { 'richlife-plan': 0, 'richlife-plan-short': 0 };
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`${base}/richlife`);
      const variant = variantOf(await res.text());
      assert.ok(variant in seen, 'draws one of the two versions');
      assert.equal(cookieOf(res), variant, 'cookie names the version shown');
      assert.match(res.headers.get('cache-control'), /no-store/);
      seen[variant]++;
    }
    assert.ok(seen['richlife-plan'] > 10 && seen['richlife-plan-short'] > 10, `roughly half each: ${JSON.stringify(seen)}`);

    // The cookie keeps the visitor on the same version, landing and thank-you page alike.
    for (const slug of ['richlife-plan', 'richlife-plan-short']) {
      const headers = { cookie: `ab_richlife3=${slug}` };
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${base}/richlife`, { headers });
        assert.equal(variantOf(await res.text()), slug);
        assert.equal(cookieOf(res), '', 'no new cookie for a returning visitor');
      }
      const ty = await (await fetch(`${base}/richlife/thank-you`, { headers })).text();
      assert.match(ty, new RegExp(`/p/${slug}/tracking\\.js`), `${slug}: thank-you follows the cookie`);
    }
    // A thank-you visit without a cookie shows the full version's page and sets nothing.
    const bare = await fetch(`${base}/richlife/thank-you`);
    assert.match(await bare.text(), /\/p\/richlife-plan\/tracking\.js/);
    assert.equal(cookieOf(bare), '');
    // An unknown cookie value is drawn again.
    assert.notEqual(cookieOf(await fetch(`${base}/richlife`, { headers: { cookie: 'ab_richlife3=richlife-atlas' } })), '');

    // ?v= forces a version and moves the cookie; the old versions stay outside the test.
    const forced = await fetch(`${base}/richlife?v=plan-short`, { headers: { cookie: 'ab_richlife3=richlife-plan' } });
    assert.equal(variantOf(await forced.text()), 'richlife-plan-short');
    assert.equal(cookieOf(forced), 'richlife-plan-short');
    const old = await fetch(`${base}/richlife?v=medium`);
    assert.match(await old.text(), /richlife-medium\/app\.js/);
    assert.equal(cookieOf(old), '', 'old versions do not join the test');

    // The short page: only hero, topics, testimonials, form and footer.
    browser = await chromium.launch({ headless: true });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const registrations = [];
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/register') { registrations.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true, event_id: 'lead-1' } }); }
        if (url.pathname === '/api/track' || url.pathname === '/api/meta-config') return route.fulfill({ json: { success: true, enabled: false } });
        if (url.hostname !== '127.0.0.1') return route.abort();
        return route.continue();
      });
      await page.goto(`${base}/richlife?v=plan-short&utm_source=facebook`);
      const sections = await page.evaluate(() => [...document.querySelectorAll('main > section')].map(s => s.className));
      assert.deepEqual(sections, ['hero', 'topics', 'voices-section', 'final']);
      assert.equal(await page.locator('footer.footer').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${width}: no horizontal scroll`);
      assert.match(await page.textContent('h1'), /Đừng\sđể\snăm\smới/);
      assert.equal(await page.locator('.topic-list li').count(), 4);
      assert.equal(await page.isVisible('.mbar'), width < 720);
      await page.click('#intro-video .video-cover');
      assert.match(await page.getAttribute('#intro-video iframe', 'src'), /player\.vimeo\.com\/video\/1232320997/);
      await page.click('.voice >> nth=1');
      assert.match(await page.getAttribute('#testimonial-player iframe', 'src'), /player\.vimeo\.com\/video\/1227224945/);

      await page.fill('#name', 'Nguyễn Văn Test');
      await page.fill('#phone', '0901 234 567');
      await page.fill('#email', 'test@example.invalid');
      await page.click('#registration-form button[type="submit"]');
      assert.match(await page.textContent('#form-error'), /khu\svực/);
      await page.selectOption('#region', 'Hồ Chí Minh');
      await page.click('#registration-form button[type="submit"]');
      await page.waitForURL(/\/richlife\/thank-you/);
      assert.equal(registrations.length, 1);
      assert.equal(registrations[0].page_id, 'richlife-plan-short');
      assert.equal(registrations[0].region, 'Hồ Chí Minh');
      assert.equal(registrations[0].utm_source, 'facebook');
      // The thank-you page is the short version's (its own tracking), via the cookie.
      assert.match(await page.evaluate(() => [...document.scripts].map(s => s.src).join(' ')), /richlife-plan-short\/tracking\.js/);
      await page.waitForFunction(() => document.querySelector('#confirm-email')?.textContent === 'test@example.invalid');
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(`PASS: /richlife A/B (draw ${JSON.stringify(seen)}, sticky cookie, ?v=, old versions, short page and form)`);
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
