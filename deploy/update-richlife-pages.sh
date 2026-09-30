#!/usr/bin/env bash
# Deploy the Richlife form pages (richlife-bni, richlife-live) to the live
# server. Run as root on the VPS. Safe to re-run for later page updates.
#
# The server is NOT a git checkout and some pages there are newer than git,
# so this only touches the page folders plus the shared files listed in
# `known` below (routes, funnels, and the hoc-trading tracker).
#
# Build the release locally from the branch, upload it, then run this script:
#   git -c core.autocrlf=false archive --format=tar.gz -o richlife-pages-release.tar.gz \
#     main pages/richlife-bni pages/richlife-live src/routes/pages.js src/funnels.js \
#     pages/hoc-trading/tracking.js
#   scp richlife-pages-release.tar.gz deploy/update-richlife-pages.sh root@45.252.249.140:/tmp/
#   ssh root@45.252.249.140 'bash /tmp/update-richlife-pages.sh'
set -euo pipefail
app=/opt/event-landingpage
release=${RELEASE:-/tmp/richlife-pages-release.tar.gz}
# SLUGS="richlife-live" limits the deploy to some pages (default: all of them).
read -r -a slugs <<< "${SLUGS:-richlife-bni richlife-live}"
base=http://127.0.0.1:3001
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/opt/event-landingpage-backups/richlife-pages-$stamp
stage=$(mktemp -d /tmp/richlife-pages-stage.XXXXXX)

tar -xzf "$release" -C "$stage"
node --check "$stage/src/routes/pages.js"
node --check "$stage/src/funnels.js"
for js in "$stage"/pages/*/*.js; do node --check "$js"; done

# Shared files are replaced only if the server still has a version we
# know (git main, the first richlife-bni deploy, or the hoc-trading tracker
# live before 30/09). Anything else means someone edited them on the
# server: stop and merge by hand.
declare -A known=(
  [src/routes/pages.js]="cdff0fbfedfdc0055a12aa0f7f56ed87cacc3cbb 60330684ceaaa4b91414b75c033f92928f736705"
  [src/funnels.js]="4a19d6e4fc1f33f30319172d1b939c4fca019e67 4cb2be4c5cdca4ef3b1e14da0af18ebb3f19ebd3"
  [pages/hoc-trading/tracking.js]="3c921d8f58513b9350f758563c13c32196efb5cd"
)
shared=()
for file in "${!known[@]}"; do
  actual=$(git hash-object "$app/$file")
  if [ "$actual" = "$(git hash-object "$stage/$file")" ]; then
    echo "unchanged: $file"
  elif [[ " ${known[$file]} " == *" $actual "* ]]; then
    shared+=("$file")
  else
    echo "ABORT: $file on the server ($actual) is not a version this script shipped. Merge it by hand first." >&2
    exit 1
  fi
done

mkdir -p "$backup"
backup_items=("${shared[@]}")
for slug in "${slugs[@]}"; do
  [ -d "$app/pages/$slug" ] && backup_items+=("pages/$slug")
done
if [ ${#backup_items[@]} -gt 0 ]; then
  tar -C "$app" -czf "$backup/before.tar.gz" "${backup_items[@]}"
else
  tar -czf "$backup/before.tar.gz" -T /dev/null
fi
echo "Backup: $backup/before.tar.gz (${backup_items[*]:-nothing})"

rollback() {
  echo "Deployment failed; restoring $backup/before.tar.gz" >&2
  for slug in "${slugs[@]}"; do rm -rf "$app/pages/$slug"; done
  tar -C "$app" -xzf "$backup/before.tar.gz"
  sudo -u eventapp pm2 reload landingpage
}
trap rollback ERR

for slug in "${slugs[@]}"; do
  rm -rf "$app/pages/$slug"
  cp -a "$stage/pages/$slug" "$app/pages/"
  chown -R eventapp:eventapp "$app/pages/$slug"
done
for file in "${shared[@]}"; do
  install -o eventapp -g eventapp -m 644 "$stage/$file" "$app/$file"
done
sudo -u eventapp pm2 reload landingpage

# Every Richlife page must answer 200; existing funnels must still answer 200.
for attempt in 1 2 3 4 5; do
  curl -fsS -o /dev/null "$base/richlife-bni" && break
  sleep 1
done
paths=(/ /free /richlife /workshop /30s /hoc-trading /p/hoc-trading/tracking.js)
for slug in "${slugs[@]}"; do
  paths+=("/$slug" "/$slug/thank-you" "/p/$slug/style.css" "/p/$slug/app.js")
done
for path in "${paths[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$base$path")
  echo "$code $path"
  [ "$code" = 200 ] || false
done
for slug in "${slugs[@]}"; do
  curl -fsS "$base/$slug" | grep -q "data-funnel=\"$slug\""
done

trap - ERR
rm -rf "$stage"
echo "Deployed. Backup kept at $backup"
sudo -u eventapp pm2 list
