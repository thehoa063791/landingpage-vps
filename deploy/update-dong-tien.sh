#!/usr/bin/env bash
# Selective root update + Next.js /dong-tien deployment. Never replaces .env or CRM data.
# RELEASE=/tmp/dong-tien-release.tar.gz bash /tmp/update-dong-tien.sh
set -euo pipefail
umask 077
app=/opt/event-landingpage
release=${RELEASE:-/tmp/dong-tien-release.tar.gz}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/opt/event-landingpage-backups/dong-tien-$stamp
mkdir -p /opt/event-landingpage-releases
stage=$(mktemp -d /opt/event-landingpage-releases/dong-tien.XXXXXX)
tar -xzf "$release" -C "$stage"

check_before() {
  node - "$app" "$stage" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto');
const [app,stage]=process.argv.slice(2);
const hashes=JSON.parse(fs.readFileSync(stage+'/expected-before.json','utf8'));
for(const [file,expected] of Object.entries(hashes)){
  if(file.includes('..')||file.startsWith('/'))throw Error('Invalid path');
  const actual=fs.existsSync(app+'/'+file)?crypto.createHash('sha256').update(fs.readFileSync(app+'/'+file)).digest('hex'):null;
  if(actual!==expected)throw Error('Production changed; merge before replacing '+file);
}
const nginx=crypto.createHash('sha256').update(fs.readFileSync('/etc/nginx/sites-available/landingpage-event')).digest('hex');
if(nginx!==JSON.parse(fs.readFileSync(stage+'/release-metadata.json','utf8')).nginxBefore)throw Error('Nginx changed');
NODE
}
check_before
test ! -e "$app/pages/dong-tien"
node - "$app" "$stage" <<'NODE'
const fs=require('node:fs');
const [app,stage]=process.argv.slice(2);
const env=require(app+'/node_modules/dotenv').parse(fs.readFileSync(app+'/.env'));
if(![env.DONG_TIEN_SESSION_SECRET,env.JWT_SECRET,env.ADMIN_COOKIE_SECRET,env.ADMIN_PASSWORD].some(Boolean))throw Error('Missing learning session secret');
fs.writeFileSync(stage+'/pages/dong-tien/.env.production.local','ADMIN_API_URL=http://127.0.0.1:3001\nNEXT_TELEMETRY_DISABLED=1\nLEAD_API_KEY='+JSON.stringify(env.LEAD_API_KEY||'')+'\n',{mode:0o600});
console.log('Production session secret configured; API key stays on server.');
NODE
chown -R eventapp:eventapp "$stage"
chmod 755 "$stage"
sudo -u eventapp bash -c 'set -e; cd "$1"; NEXT_TELEMETRY_DISABLED=1 npm ci --no-audit --no-fund; NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1536 npm run build' _ "$stage/pages/dong-tien"
check_before

mkdir -p "$backup"
cp /etc/nginx/sites-available/landingpage-event "$backup/nginx.conf"
cp "$app/.env" "$backup/root.env"
node - "$app" "$stage" "$backup" <<'NODE'
const fs=require('node:fs'),cp=require('node:child_process');
const [app,stage,backup]=process.argv.slice(2);
const hashes=JSON.parse(fs.readFileSync(stage+'/expected-before.json','utf8'));
fs.writeFileSync(backup+'/existing-files.txt',Object.keys(hashes).filter(file=>hashes[file]!==null).join('\n')+'\n');
fs.writeFileSync(backup+'/new-files.json',JSON.stringify(Object.keys(hashes).filter(file=>hashes[file]===null)));
const env=require(app+'/node_modules/dotenv').parse(fs.readFileSync(app+'/.env'));
const url=env.DATABASE_URL?new URL(env.DATABASE_URL):null;
const pgEnv={...process.env,...env,...(url?{PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)}:{})};
const result=cp.spawnSync('pg_dump',['-Fc','-f',backup+'/database.dump'],{env:pgEnv,stdio:'inherit'});
if(result.status!==0)throw Error('Database backup failed');
NODE
tar -C "$app" -czf "$backup/root-files.tar.gz" -T "$backup/existing-files.txt"
echo "Backup: $backup"

rollback() {
  echo "Deployment failed; restoring application and nginx from $backup" >&2
  sudo -u eventapp pm2 delete next-dong-tien || true
  [ ! -d "$app/pages/dong-tien" ] || mv "$app/pages/dong-tien" "$backup/failed-child"
  tar -C "$app" -xzf "$backup/root-files.tar.gz"
  node - "$app" "$backup/new-files.json" <<'NODE'
const fs=require('node:fs');const [app,list]=process.argv.slice(2);
for(const file of JSON.parse(fs.readFileSync(list,'utf8')))fs.rmSync(app+'/'+file,{force:true});
NODE
  cp "$backup/nginx.conf" /etc/nginx/sites-available/landingpage-event
  nginx -t && systemctl reload nginx
  sudo -u eventapp pm2 reload landingpage
}
trap rollback ERR

# Only new learning tables/configuration are initialized. Existing production configuration wins.
node "$stage/deploy/seed-dong-tien-production.cjs" "$app" "$stage"
node - "$app" "$stage" <<'NODE'
const fs=require('node:fs'),path=require('node:path');const [app,stage]=process.argv.slice(2);
for(const file of JSON.parse(fs.readFileSync(stage+'/deployment-files.json','utf8'))){
  fs.mkdirSync(path.dirname(app+'/'+file),{recursive:true});fs.copyFileSync(stage+'/'+file,app+'/'+file);
}
NODE
while IFS= read -r file; do chown eventapp:eventapp "$app/$file"; chmod 644 "$app/$file"; done < <(node -e 'for(const f of require(process.argv[1]))console.log(f)' "$stage/deployment-files.json")
mkdir -p "$app/storage/dong-tien-thumbnails"
cp -an "$stage/storage/dong-tien-thumbnails/." "$app/storage/dong-tien-thumbnails/"
chown -R eventapp:eventapp "$app/storage/dong-tien-thumbnails"
mv "$stage/pages/dong-tien" "$app/pages/dong-tien"
mkdir -p "$app/pages/dong-tien/logs"
chown -R eventapp:eventapp "$app/pages/dong-tien"
sudo -u eventapp pm2 reload landingpage
sudo -u eventapp pm2 start "$app/pages/dong-tien/ecosystem.config.js"
for attempt in {1..15}; do
  if curl -fsS -o /dev/null http://127.0.0.1:3002/dong-tien && curl -fsS -o /dev/null http://127.0.0.1:3001/admin/; then break; fi
  sleep 1
done
curl -fsS -o /dev/null http://127.0.0.1:3002/dong-tien
install -o root -g root -m 644 "$stage/nginx-after.conf" /etc/nginx/sites-available/landingpage-event
nginx -t
systemctl reload nginx
for route in / /admin/ /richlife /hoc-trading /30s /dong-tien /dong-tien/v1 /dong-tien/v2 /dong-tien/learn /dong-tien/api/project/config; do
  curl -fsS -o /dev/null "https://event.phamthanhbien.com$route"
done
cmp "$app/.env" "$backup/root.env"
sudo -u eventapp pm2 save
trap - ERR
echo "Deployed Dòng Tiền. Backup: $backup"
