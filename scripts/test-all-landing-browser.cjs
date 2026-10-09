const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
// Serve the real HTML router and local assets without accessing CRM or external services.
require.cache[require.resolve('../src/storage')] = { exports: { supabase: null } };
const app = express();
const assets = express.static(path.resolve('pages'), { index: false, redirect: false });
app.use('/p', (req, res, next) => /\.html$/i.test(req.path) ? next() : assets(req, res, next));
app.use(require('../src/routes/pages'));
app.use(express.static(path.resolve('public')));
(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const slug of ['richlife-short','richlife-medium','richlife','richlife-bni','richlife-live','trading','30s','hoc-trading']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const tracks = [];
      let enabled = true;
      await page.addInitScript(() => { window.pixelCalls = []; window.fbq = (...args) => window.pixelCalls.push(args); });
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/meta-config') return route.fulfill({ json: { enabled, pixel_id:'TEST' } });
        if (url.pathname === '/api/track') { tracks.push(route.request().postDataJSON()); return route.fulfill({json:{success:true}}); }
        if (url.hostname !== '127.0.0.1') return route.abort();
        return route.continue();
      });
      const url = `http://127.0.0.1:${server.address().port}/p/${slug}?utm_source=facebook&fbclid=CLICK`;
      await page.goto(url);
      await page.waitForFunction(() => window.pixelCalls.some(call => call[1] === 'PageView'));
      await page.waitForTimeout(500);
      const pageviews = tracks.filter(item => item.event === 'pageview');
      assert.equal(pageviews.length, 1, slug + ': one server PageView');
      const pixel = await page.evaluate(() => window.pixelCalls.filter(call => call[1] === 'PageView'));
      assert.equal(pixel.length, 1, slug + ': one browser PageView');
      assert.equal(pixel[0][3].eventID, pageviews[0].data.event_id, slug + ': dedup ID');
      assert.equal(pixel[0][2].content_name, pageviews[0].data.page_id, slug + ': page ID');
      assert.equal(pageviews[0].data.utm_source, 'facebook', slug + ': UTM');
      const form = page.locator('form input[name="name"], form input[autocomplete="name"]').first();
      if (await form.count()) {
        await form.focus();
        await page.waitForTimeout(100);
        const opened = tracks.filter(item => item.event === 'form_open');
        assert.equal(opened.length, 1, slug + ': one form open');
      }
      const firstId = pixel[0][3].eventID;
      tracks.length = 0;
      await page.reload();
      await page.waitForFunction(() => window.pixelCalls.some(call => call[1] === 'PageView'));
      await page.waitForTimeout(200);
      const reloaded = await page.evaluate(() => window.pixelCalls.find(call => call[1] === 'PageView'));
      assert.notEqual(reloaded[3].eventID, firstId, slug + ': fresh reload event ID');
      assert.equal(reloaded[3].eventID, tracks.find(item => item.event === 'pageview').data.event_id);
      const receipt = 'lead-' + slug;
      await page.evaluate(async id => {
        const tracker = window.RichlifeTracking || window.HocTradingTracking || window.RichlifeBniConversion || window.RichlifeLiveConversion || window.LandingConversion;
        await tracker.registered({event_id:id});
      }, receipt);
      const converted = await page.evaluate(() => window.pixelCalls.filter(call => call[1] === 'CompleteRegistration'));
      assert.equal(converted.length, 1, slug + ': conversion');
      assert.equal(converted[0][3].eventID, receipt);
      const filename = slug === 'hoc-trading' ? 'register-sucess.html' : 'thank-you.html';
      tracks.length = 0;
      await page.goto(`http://127.0.0.1:${server.address().port}/p/${slug}/${filename}`);
      await page.waitForFunction(() => window.pixelCalls.some(call => call[1] === 'PageView'));
      await page.waitForTimeout(200);
      const thanks = await page.evaluate(() => window.pixelCalls);
      assert.equal(thanks.filter(call => call[1] === 'CompleteRegistration').length, 0, slug + ': no thank-you replay');
      assert.equal(thanks.find(call => call[1] === 'PageView')[2].content_name, tracks.find(item => item.event === 'pageview').data.page_id);
      enabled = false;
      await page.goto(url);
      await page.waitForFunction(() => window.RichlifeTracking || window.HocTradingTracking || window.RichlifeBniConversion || window.RichlifeLiveConversion || window.LandingConversion);
      await page.evaluate(async () => {
        const tracker = window.RichlifeTracking || window.HocTradingTracking || window.RichlifeBniConversion || window.RichlifeLiveConversion || window.LandingConversion;
        await tracker.registered({event_id:'disabled-pixel'});
      });
      assert.equal(await page.evaluate(() => window.pixelCalls.length), 0, slug + ': disabled Pixel ignores existing fbq');
      console.log('PASS browser: ' + slug + ' (landing, reload, conversion, thank-you)');
      await context.close();
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
