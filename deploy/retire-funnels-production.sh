#!/usr/bin/env bash
# Apply a selective release built from the current live admin source.
# The archive must contain the four files below and expected-before.sha256.
# RELEASE=/tmp/retire-funnels-release.tar.gz bash retire-funnels-production.sh
set -euo pipefail
app=/opt/event-landingpage
release=${RELEASE:-/tmp/retire-funnels-release.tar.gz}
stage=$(mktemp -d /tmp/retire-funnels-stage.XXXXXX)
backup=/opt/event-landingpage-backups/retire-funnels-$(date -u +%Y%m%dT%H%M%SZ)
files=(src/funnels.js src/admin/app.js public/admin.html public/admin/react-shell.js)
slugs=(workshop richlife-v2)

tar -xzf "$release" -C "$stage"
# Abort before writing anything if another deployment changed a target file.
(cd "$app" && sha256sum -c "$stage/expected-before.sha256")
node --check "$stage/src/funnels.js"
node --check "$stage/public/admin/react-shell.js"
node - "$stage/public/admin/react-shell.js" <<'NODE'
const assert = require('node:assert/strict');
const code = require('node:fs').readFileSync(process.argv[2], 'utf8');
for (const marker of ['from_demo', 'demo-sale-', 'demo-lead-']) assert.equal(code.includes(marker), false);
NODE

mkdir -p "$backup"
items=("${files[@]}")
for slug in "${slugs[@]}"; do
  [ ! -d "$app/pages/$slug" ] || items+=("pages/$slug")
done
tar -C "$app" -czf "$backup/before.tar.gz" "${items[@]}"
echo "Backup: $backup/before.tar.gz"

rollback() {
  echo "Restoring $backup/before.tar.gz" >&2
  tar -C "$app" -xzf "$backup/before.tar.gz"
  sudo -u eventapp pm2 reload landingpage
}
trap rollback ERR
for file in "${files[@]}"; do
  install -o eventapp -g eventapp -m 644 "$stage/$file" "$app/$file"
done
for slug in "${slugs[@]}"; do
  [ ! -d "$app/pages/$slug" ] || mv "$app/pages/$slug" "$backup/removed-$slug"
done
sudo -u eventapp pm2 reload landingpage

node - "$app" <<'NODE'
const assert = require('node:assert/strict');
const app = process.argv[2];
const rows = require(app + '/src/funnels.js').discoverFunnels();
assert.equal(rows.some(row => ['workshop', 'richlife-v2'].includes(row.slug)), false);
for (const slug of ['richlife', 'hoc-trading', '30s']) assert(rows.some(row => row.slug === slug));
console.log('Active funnels:', rows.map(row => row.slug).join(', '));
NODE
for attempt in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3001/admin; then break; fi
  sleep 1
done
for route in / /admin /admin/react-shell.js /richlife /hoc-trading /30s; do
  curl -fsS -o /dev/null "http://127.0.0.1:3001$route"
done
for slug in "${slugs[@]}"; do
  test ! -d "$app/pages/$slug"
done
trap - ERR
rm -rf "$stage"
echo 'Production funnel cleanup completed.'
