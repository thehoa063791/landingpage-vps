#!/usr/bin/env bash
# Daily database backup (cron as eventapp, 03:00 Asia/Ho_Chi_Minh):
#   0 3 * * * bash /opt/event-landingpage/deploy/backup-db.sh >> /opt/event-landingpage-backups/daily/backup.log 2>&1
# Writes daily/db-<date>.dump (pg_dump custom format), checks that it can be read back, keeps
# the newest KEEP files. On failure it exits non-zero and, when BACKUP_ALERT_URL is set in .env,
# POSTs {"event":"backup_failed"} there (e.g. an n8n webhook). The latest dump is also what
# scripts/pull-backup.ps1 copies off the server each week.
set -euo pipefail
umask 077
app=${APP_DIR:-/opt/event-landingpage}
dir=${BACKUP_DIR:-/opt/event-landingpage-backups/daily}
keep=${KEEP:-14}
mkdir -p "$dir"
stamp=$(date +%Y%m%d-%H%M)
file="$dir/db-$stamp.dump"

alert() {
  local message=$1
  echo "$(date '+%F %T') FAILED: $message"
  url=$(node -e "const e=require('$app/node_modules/dotenv').parse(require('fs').readFileSync('$app/.env'));process.stdout.write(e.BACKUP_ALERT_URL||'')" 2>/dev/null || true)
  [ -n "$url" ] && curl -fsS -m 10 -H 'Content-Type: application/json' -d "{\"event\":\"backup_failed\",\"host\":\"$(hostname)\",\"message\":\"$message\"}" "$url" > /dev/null || true
}
trap 'alert "line $LINENO"' ERR

# Connection settings from DATABASE_URL in .env (never printed).
node - "$app" "$file" <<'NODE'
const fs = require('node:fs'), cp = require('node:child_process');
const [app, file] = process.argv.slice(2);
const env = require(app + '/node_modules/dotenv').parse(fs.readFileSync(app + '/.env'));
const url = new URL(env.DATABASE_URL);
const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
const dump = cp.spawnSync('pg_dump', ['-Fc', '-f', file + '.part'], { env: pgEnv, stdio: ['ignore', 'inherit', 'inherit'] });
if (dump.status !== 0) process.exit(1);
NODE
# A dump that pg_restore cannot list is not a backup.
pg_restore --list "$file.part" > /dev/null
mv "$file.part" "$file"
ls -1t "$dir"/db-*.dump | tail -n +$((keep + 1)) | xargs -r rm -f
echo "$(date '+%F %T') OK $(basename "$file") $(du -h "$file" | cut -f1), kept $(ls -1 "$dir"/db-*.dump | wc -l)"

# Deploy backups next to daily/: keep the newest KEEP_DEPLOY (each holds files and often a
# database dump and an old Next build).
deploy_dir=$(dirname "$dir")
keep_deploy=${KEEP_DEPLOY:-5}
# Only folders named like a deploy backup (name-20261026T083037Z): never daily/ nor the folder
# being written (BACKUP_DIR may point elsewhere; on 2026-10-26 that pruned daily/ itself).
ls -1t "$deploy_dir" | grep -E '^[a-z0-9-]+-[0-9]{8}T[0-9]{6}Z$' | grep -vx -e daily -e "$(basename "$dir")" | tail -n +$((keep_deploy + 1)) | while IFS= read -r old; do
  [ -n "$old" ] && rm -rf -- "${deploy_dir:?}/$old" && echo "$(date '+%F %T') removed deploy backup $old"
done

# Data retention (webhook payloads 30 days, deliveries 12 months).
(cd "$app" && node scripts/maintenance.cjs)
