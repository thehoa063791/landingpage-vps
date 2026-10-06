const esbuild = require('esbuild');
function buildAdmin({ demo = false, outfile = 'public/admin/react-shell.js' } = {}) {
  return esbuild.build({
    entryPoints: ['src/admin/app.js'], bundle: true, minify: true,
    outfile, format: 'iife', target: ['es2020'],
    loader: { '.woff2': 'file' }, assetNames: 'fonts/[name]-[hash]',
    define: { 'process.env.NODE_ENV': '"production"', __ADMIN_DEMO_ENABLED__: String(demo) },
    // Omit the fixture module itself: its top-level data initialization has side effects.
    plugins: demo ? [] : [{
      name: 'exclude-admin-demo',
      setup(build) {
        build.onResolve({ filter: /^\.\/demo\.js$/ }, () => ({ path: 'disabled-demo', namespace: 'disabled-demo' }));
        build.onLoad({ filter: /.*/, namespace: 'disabled-demo' }, () => ({ contents: 'export const demoFetch = null; export const demoUser = null;' }));
      },
    }],
  });
}
module.exports = { buildAdmin };
if (require.main === module) buildAdmin().catch(() => process.exit(1));
