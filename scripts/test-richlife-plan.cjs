// Richlife 12/12 (pages/richlife-plan) on /richlife: the real pages router,
// a stubbed /api/register, no outside services. Checks routing, the FAQ, the testimonial
// player, the form, the thank-you page, reduced motion and phone width.
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

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    assert.match(await (await fetch(`${base}/richlife`)).text(), /richlife-plan\/app\.js/);
    assert.match(await (await fetch(`${base}/richlife/thank-you`)).text(), /richlife-plan\/style\.css/);
    assert.match(await (await fetch(`${base}/thank-you-richlife`)).text(), /richlife-plan\/style\.css/);
    assert.match(await (await fetch(`${base}/richlife?v=short`)).text(), /richlife-short\/app\.js/, 'old versions stay reachable');
    assert.doesNotMatch(await (await fetch(`${base}/richlife?v=atlas`)).text(), /richlife-atlas/, 'the atlas version is gone');

    browser = await chromium.launch({ headless: true });
    for (const [width, height, reducedMotion] of [[1440, 900, 'no-preference'], [390, 844, 'reduce']]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
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
      await page.goto(`${base}/richlife?utm_source=facebook`);
      await page.addStyleTag({ content: '*{scroll-behavior:auto!important}' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${width}: no horizontal scroll`);
      assert.match(await page.textContent('h1'), /Đừng\sđể\snăm\smới/);
      assert.equal(await page.locator('.step').count(), 4);
      assert.equal(await page.locator('.topic-list li').count(), 5);

      // Intro (motion only): RICHLIFE shrinks into the logo, then the overlay is gone.
      await page.waitForFunction(() => !document.querySelector('.intro'), null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.topbar .logo-mark')).visibility), 'visible');

      // The four questions keep a score.
      await page.locator('.questions label >> nth=0').click();
      await page.locator('.questions label >> nth=2').click();
      assert.equal(await page.textContent('#score'), '2');

      // Blocks below the fold appear once scrolled to.
      await page.locator('.speaker-copy h2').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.speaker-copy h2')).opacity === '1');

      // FAQ opens; a testimonial card swaps the cover for the player.
      await page.click('.faq-list summary >> nth=0');
      assert.match(await page.textContent('.faq-list details[open] p'), /miễn\sphí/);
      await page.click('.voice >> nth=2');
      assert.equal(await page.getAttribute('.voice >> nth=2', 'aria-pressed'), 'true');
      assert.match(await page.getAttribute('#testimonial-player iframe', 'src'), /player\.vimeo\.com\/video\/1227224820/);

      // The floating sign-up button shows between the hero and the form, never over the form.
      await page.evaluate(() => document.getElementById('hanh-trinh').scrollIntoView());
      await page.waitForFunction(() => document.querySelector('.float-cta').classList.contains('on'));
      await page.evaluate(() => document.getElementById('registration-form').scrollIntoView({ block: 'center' }));
      await page.waitForFunction(() => !document.querySelector('.float-cta').classList.contains('on'));

      // Form: validation, then the registration body and the thank-you page.
      await page.click('#registration-form button[type="submit"]');
      assert.match(await page.textContent('#form-error'), /họ\svà\stên/);
      await page.fill('#name', 'Nguyễn Văn Test');
      await page.fill('#phone', '0901 234 567');
      await page.fill('#email', 'Test@Example.invalid');
      await page.click('#registration-form button[type="submit"]');
      await page.waitForURL(/\/richlife\/thank-you/);
      assert.equal(registrations.length, 1);
      const body = registrations[0];
      assert.equal(body.page_id, 'richlife-plan');
      assert.equal(body.attendance, 'RichLife');
      assert.equal(body.region, 'Online');
      assert.equal(body.email, 'test@example.invalid');
      assert.equal(body.utm_source, 'facebook');
      await page.waitForFunction(() => document.querySelector('#confirm-email')?.textContent === 'test@example.invalid');
      assert.match(await page.textContent('h1'), /Còn\s1\sbước\scuối/);
      assert.match(await page.evaluate(() => document.querySelector('link[rel="stylesheet"][href*="richlife-plan"]')?.href || ''), /richlife-plan/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${width}: thank-you fits`);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: /richlife (routing, FAQ, voices, form, thank-you, phone width, reduced motion)');
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
