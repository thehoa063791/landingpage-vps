const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const utils = require('../src/utils');
const db = require('../src/db');
// Exercise the real router without logging in or accessing application data.
utils.adminCookieOrAuth = (_req, _res, next) => next();
const router = require('../src/routes/ads');
test('Ads returns actionable JSON for database connection and schema failures', async () => {
  const original = db.pool.query;
  const app = express(); app.use('/ads/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const [code, status, message] of [['ECONNREFUSED', 503, 'PostgreSQL'], ['42P01', 500, 'db:migrate'], ['42703', 500, 'db:migrate']]) {
      db.pool.query = async () => { throw Object.assign(new Error('sensitive connection detail'), { code }); };
      for (const endpoint of ['accounts', 'kpis']) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/ads/api/${endpoint}`);
        assert.equal(response.status, status);
        const payload = await response.json();
        assert.equal(payload.code, code);
        assert.ok(payload.error.includes(message));
        assert.ok(!JSON.stringify(payload).includes('sensitive'));
      }
    }
  } finally {
    db.pool.query = original;
    await new Promise(resolve => server.close(resolve));
    await db.pool.end();
  }
});
