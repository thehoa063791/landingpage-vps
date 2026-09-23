#!/usr/bin/env bash
set -euo pipefail
app=/opt/event-landingpage
release=/tmp/hoc-trading-release-20260918.tar.gz
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/opt/event-landingpage-backups/hoc-trading-$stamp
stage=$(mktemp -d /tmp/hoc-trading-stage.XXXXXX)
mkdir -p "$backup"
tar -C "$app" -czf "$backup/before.tar.gz" pages/hoc-trading src/routes/pages.js
tar -C "$stage" -xzf "$release"
cp "$app/src/routes/pages.js" "$stage/pages-next.js"
python3 - "$stage/pages-next.js" <<'PY'
import pathlib, sys
file = pathlib.Path(sys.argv[1])
text = file.read_text()
changes = {
    "router.get('/hoc-trading',": "router.get(['/hoc-trading', '/p/hoc-trading'],",
    "'hoc-trading', 'index.html'": "'hoc-trading', 'home.html'",
    "router.get('/thank-you-hoc-trading',": "router.get(['/thank-you-hoc-trading', '/hoc-trading/thank-you'],",
    "'hoc-trading', 'thank-you.html'": "'hoc-trading', 'register-sucess.html'",
}
for old, new in changes.items():
    if old not in text and new in text:
        continue
    if text.count(old) != 1:
        raise RuntimeError('Unexpected route: ' + old)
    text = text.replace(old, new)
file.write_text(text)
PY
node --check "$stage/pages-next.js"
for file in boot registration tracking support; do node --check "$stage/pages/hoc-trading/$file.js"; done
rollback() {
  echo "Deployment failed; restoring $backup/before.tar.gz" >&2
  tar -C "$app" -xzf "$backup/before.tar.gz"
  sudo -u eventapp pm2 reload landingpage
}
trap rollback ERR
cp -a "$stage/pages/hoc-trading/." "$app/pages/hoc-trading/"
chown -R eventapp:eventapp "$app/pages/hoc-trading"
install -o eventapp -g eventapp -m 644 "$stage/pages-next.js" "$app/src/routes/pages.js"
sudo -u eventapp pm2 reload landingpage
for attempt in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:3001/hoc-trading -o "$stage/served-home.html"; then break; fi
  sleep 1
done
cmp "$stage/served-home.html" "$app/pages/hoc-trading/home.html"
curl -fsS http://127.0.0.1:3001/thank-you-hoc-trading -o "$stage/served-thanks.html"
cmp "$stage/served-thanks.html" "$app/pages/hoc-trading/register-sucess.html"
# Retire old entry files only after the new routes are healthy.
for file in index.html thank-you.html; do
  if [ -f "$app/pages/hoc-trading/$file" ]; then mv "$app/pages/hoc-trading/$file" "$backup/$file"; fi
done
trap - ERR
printf 'BACKUP=%s\nSTAGE=%s\n' "$backup" "$stage"
sudo -u eventapp pm2 list
