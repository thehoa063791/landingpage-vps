require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const morgan  = require('morgan');

process.on('unhandledRejection', (reason) => { console.error('[UnhandledRejection]', reason); });

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const { adminAssets, slowAdminRequests } = require('./src/adminAssets');
// The admin bundle goes out gzip-compressed and long-cached (before the plain static files).
app.use(adminAssets());
app.use(express.static(path.join(__dirname, 'public')));
// HTML entry points go through routes/pages.js so the shared funnel tracker is
// injected. Assets under /p remain static and cacheable.
const funnelAssets = express.static(path.join(__dirname, 'pages'), { index: false, redirect: false });
app.use('/p', (req, res, next) => /\.html$/i.test(req.path) ? next() : funnelAssets(req, res, next));
// Local Postgres-era replacement for Supabase Storage public URLs.
// Uploaded files live under ./storage/<bucket>/ and are served read-only.
app.use(
  process.env.STORAGE_PUBLIC_PATH || '/storage',
  express.static(path.resolve(process.env.STORAGE_ROOT || path.join(__dirname, 'storage')), {
    fallthrough: false,
    maxAge: '7d',
  })
);
app.use(morgan('combined'));
// First/last touch cookies on page loads (src/attribution.js); read again at registration.
app.use(require('./src/attribution').middleware());
app.use(['/admin', '/ads/api'], slowAdminRequests());
// Routes – thứ tự quan trọng: specific trước, generic sau
app.use('/api/payment',      require('./src/routes/payment'));
app.use('/api/learning/:course', require('./src/routes/learning'));
app.use('/api/dong-tien',     require('./src/routes/learning').legacyDongTien);
app.use('/api/zoom-event',    require('./src/routes/zoomEvent').createPublicRouter());
// Partner API (docs/PARTNER_API.md); the error handler also answers malformed JSON bodies.
app.use('/api/partner/v1',    require('./src/partner/router').createRouter(), require('./src/partner/router').errorHandler);
app.use('/api',              require('./src/routes/api'));
app.use('/ads/api',          require('./src/routes/ads'));
app.use('/admin/webhooks',   require('./src/routes/adminWebhooks'));
app.use('/admin/cms',        require('./src/routes/cms'));
app.use('/admin/zoom-event', require('./src/routes/zoomEvent').createAdminRouter());
app.use('/admin',            require('./src/routes/admin'));
app.use('/',                 require('./src/routes/pages'));
// Short links and old WordPress URLs (Admin > Redirect): only paths no page above serves.
app.use(require('./src/redirects').getRedirectStore().middleware());

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin`);
});

module.exports = app;
