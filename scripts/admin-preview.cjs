// Static preview: deliberately has no backend or production data access.
const express = require('express');
const path = require('path');
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/admin/auth/config', (_, res) => res.json({ googleEnabled: false }));
app.get('/admin/auth/me', (_, res) => res.status(401).json({ error: 'Static preview has no authenticated session' }));
app.get(/^\/admin(?:\/.*)?$/, (_, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.listen(4173, '127.0.0.1', () => console.log('Admin static preview: http://127.0.0.1:4173/admin'));
