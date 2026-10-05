const esbuild = require('esbuild');
esbuild.build({
  entryPoints: ['src/admin/app.js'], bundle: true, minify: true,
  outfile: 'public/admin/react-shell.js', format: 'iife', target: ['es2020'],
  loader: { '.woff2': 'file' }, assetNames: 'fonts/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"' },
}).catch(() => process.exit(1));
