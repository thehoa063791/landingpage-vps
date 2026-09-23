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
// Routes – thứ tự quan trọng: specific trước, generic sau
app.use('/api/payment',      require('./src/routes/payment'));
app.use('/api',              require('./src/routes/api'));
app.use('/ads/api',          require('./src/routes/ads'));
app.use('/admin/webhooks',   require('./src/routes/adminWebhooks'));
app.use('/admin/cms',        require('./src/routes/cms'));
app.use('/admin',            require('./src/routes/admin'));
app.use('/',                 require('./src/routes/pages'));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin`);
});

module.exports = app;
