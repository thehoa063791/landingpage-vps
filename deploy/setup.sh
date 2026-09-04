#!/usr/bin/env bash
# One-shot bootstrap for a fresh Ubuntu 22.04 / 24.04 VPS.
# Run as root (or with sudo). Idempotent — safe to re-run.
set -euo pipefail

APP_USER="${APP_USER:-landingpage}"
APP_DIR="${APP_DIR:-/opt/landingpage}"
DB_NAME="${DB_NAME:-landingpage}"
DB_USER="${DB_USER:-landingpage}"
DB_PASS="${DB_PASS:-CHANGE_ME}"
NODE_MAJOR="${NODE_MAJOR:-20}"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

log "Installing base packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg lsb-release ufw nginx

log "Installing Node.js ${NODE_MAJOR}.x"
if ! command -v node >/dev/null || [[ "$(node -v)" != v${NODE_MAJOR}* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

log "Installing PostgreSQL"
apt-get install -y postgresql postgresql-contrib
systemctl enable --now postgresql

log "Creating DB role + database"
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres createdb -O ${DB_USER} ${DB_NAME}

log "Creating app user + directory"
id -u ${APP_USER} >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin ${APP_USER}
mkdir -p ${APP_DIR} ${APP_DIR}/logs ${APP_DIR}/storage
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}

log "UFW firewall"
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
yes | ufw enable || true

cat <<EOF

──────────────────────────────────────────────────────────────
Base setup done. Next steps (as ${APP_USER}):

  sudo -u ${APP_USER} -H bash -c '
    cd ${APP_DIR} &&
    # copy source here (rsync/git clone), then:
    npm ci --omit=dev &&
    cp .env.example .env &&
    # edit .env (DATABASE_URL, JWT_SECRET, PUBLIC_BASE_URL) then:
    npm run db:migrate &&
    node scripts/seed-admin.js admin@your-domain.com "strong-password" "Admin" &&
    pm2 start ecosystem.config.js &&
    pm2 save
  '

Then wire up Nginx:
  cp ${APP_DIR}/deploy/nginx.conf /etc/nginx/sites-available/landingpage.conf
  # edit server_name + ssl_certificate paths
  ln -s /etc/nginx/sites-available/landingpage.conf /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx

Finally issue TLS:
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d your-domain.com -d www.your-domain.com
──────────────────────────────────────────────────────────────
EOF
