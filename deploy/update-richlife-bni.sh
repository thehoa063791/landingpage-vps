#!/usr/bin/env bash
# Deploy the richlife-bni page to the live server (run as root on the VPS).
#
# The server is NOT a git checkout and some pages there are newer than git,
# so this only touches the three things the page needs:
#   pages/richlife-bni/   src/routes/pages.js   src/funnels.js
#
# Build the release locally from the branch, upload it, then run this script:
#   git -c core.autocrlf=false archive --format=tar.gz -o richlife-bni-release.tar.gz \
#     feat/richlife-bni pages/richlife-bni src/routes/pages.js src/funnels.js
#   scp richlife-bni-release.tar.gz deploy/update-richlife-bni.sh root@45.252.249.140:/tmp/
#   ssh root@45.252.249.140 'bash /tmp/update-richlife-bni.sh'
set -euo pipefail
app=/opt/event-landingpage
release=${RELEASE:-/tmp/richlife-bni-release.tar.gz}
base=http://127.0.0.1:3001
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/opt/event-landingpage-backups/richlife-bni-$stamp
stage=$(mktemp -d /tmp/richlife-bni-stage.XXXXXX)

# Refuse to overwrite files someone changed on the server since git main.
declare -A expected=(
  [src/routes/pages.js]=cdff0fbfedfdc0055a12aa0f7f56ed87cacc3cbb
  [src/funnels.js]=4a19d6e4fc1f33f30319172d1b939c4fca019e67
)
for file in "${!expected[@]}"; do
  actual=$(git hash-object "$app/$file")
  if [ "$actual" != "${expected[$file]}" ]; then
    echo "ABORT: $file on the server differs from git main ($actual). Merge it by hand first." >&2
    exit 1
  fi
done

tar -xzf "$release" -C "$stage"
node --check "$stage/src/routes/pages.js"
node --check "$stage/src/funnels.js"
node --check "$stage/pages/richlife-bni/app.js"

mkdir -p "$backup"
tar -C "$app" -czf "$backup/before.tar.gz" src/routes/pages.js src/funnels.js
echo "Backup: $backup/before.tar.gz"

rollback() {
  echo "Deployment failed; restoring $backup/before.tar.gz" >&2
  tar -C "$app" -xzf "$backup/before.tar.gz"
  rm -rf "$app/pages/richlife-bni"
  sudo -u eventapp pm2 reload landingpage
}
trap rollback ERR

cp -a "$stage/pages/richlife-bni" "$app/pages/"
install -o eventapp -g eventapp -m 644 "$stage/src/routes/pages.js" "$app/src/routes/pages.js"
install -o eventapp -g eventapp -m 644 "$stage/src/funnels.js" "$app/src/funnels.js"
chown -R eventapp:eventapp "$app/pages/richlife-bni"
sudo -u eventapp pm2 reload landingpage

# New pages must answer 200; existing funnels must still answer 200.
for attempt in 1 2 3 4 5; do
  curl -fsS -o /dev/null "$base/richlife-bni" && break
  sleep 1
done
for path in /richlife-bni /richlife-bni/thank-you /p/richlife-bni/style.css /p/richlife-bni/app.js / /free /richlife /workshop /30s /hoc-trading; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$base$path")
  echo "$code $path"
  [ "$code" = 200 ] || false
done
curl -fsS "$base/richlife-bni" | grep -q 'data-funnel="richlife-bni"'

trap - ERR
rm -rf "$stage"
echo "Deployed. Backup kept at $backup"
sudo -u eventapp pm2 list
