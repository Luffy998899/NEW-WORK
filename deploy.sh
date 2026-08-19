#!/usr/bin/env bash
#
# GrowthBox one-shot deployment script.
#
# Deploys this Node/Express site on an Ubuntu/Debian server and makes it live
# on your domain over HTTPS:
#   - installs Node.js, nginx and certbot (if missing)
#   - installs the app dependencies
#   - runs the app as a systemd service (auto-restart, starts on boot)
#   - configures nginx as a reverse proxy for your domain
#   - obtains & installs a free Let's Encrypt TLS certificate (auto-renewing)
#
# Usage (run on the SERVER, as root):
#   sudo bash deploy.sh
#
# Before running, point your domain's DNS A record (and www, if you want it)
# at this server's public IP. Ports 80 and 443 must be reachable.
#
set -euo pipefail

# ---------- helpers ----------
BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"
info()  { echo -e "${GREEN}==>${RESET} $*"; }
warn()  { echo -e "${YELLOW}!!${RESET} $*"; }
err()   { echo -e "${RED}ERROR:${RESET} $*" >&2; }
die()   { err "$*"; exit 1; }

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="growthbox"
SERVICE="growthbox"
ENV_FILE="/etc/growthbox.env"
APP_PORT="3000"

# ---------- pre-flight ----------
[ "$(id -u)" -eq 0 ] || die "Please run as root:  sudo bash deploy.sh"
[ -f "$APP_DIR/server.js" ] || die "server.js not found in $APP_DIR — run this from inside the project folder."
command -v apt-get >/dev/null 2>&1 || die "This script supports Debian/Ubuntu (apt). For other systems, see the README."

echo -e "${BOLD}GrowthBox deployment${RESET}"
echo "Project: $APP_DIR"
echo

# ---------- collect input ----------
read -rp "Your domain (e.g. example.com): " DOMAIN
[ -n "${DOMAIN:-}" ] || die "A domain is required."
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"

read -rp "Also serve www.$DOMAIN ? [Y/n]: " WWW
WWW="${WWW:-Y}"
DOMAIN_ARGS="-d $DOMAIN"
SERVER_NAMES="$DOMAIN"
if [[ "$WWW" =~ ^[Yy]$ ]]; then
  DOMAIN_ARGS="$DOMAIN_ARGS -d www.$DOMAIN"
  SERVER_NAMES="$DOMAIN www.$DOMAIN"
fi

read -rp "Email for Let's Encrypt (renewal & security notices): " LE_EMAIL
[ -n "${LE_EMAIL:-}" ] || die "An email is required for certificate registration."

read -rsp "Admin panel password (leave blank to auto-generate): " ADMIN_PASSWORD; echo
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  ADMIN_PASSWORD="$(openssl rand -base64 12 2>/dev/null || head -c 12 /dev/urandom | base64)"
  GENERATED_PW=1
fi

read -rp "Postgres DATABASE_URL (optional, blank = store content in local files): " DATABASE_URL

echo
info "Deploying $DOMAIN — this will install packages and may take a few minutes."
echo

# ---------- install system packages ----------
export DEBIAN_FRONTEND=noninteractive
info "Updating apt & installing base packages..."
apt-get update -y -qq
apt-get install -y -qq curl ca-certificates gnupg openssl ufw >/dev/null

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 18 ]; then
  info "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
info "Node.js $(node -v) / npm $(npm -v)"

info "Installing nginx & certbot..."
apt-get install -y -qq nginx certbot python3-certbot-nginx >/dev/null

# ---------- app user & dependencies ----------
if ! id "$APP_USER" >/dev/null 2>&1; then
  info "Creating system user '$APP_USER'..."
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi

info "Installing app dependencies (npm install)..."
( cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund )

# The app writes content/uploads to ./data and ./public/uploads (file backend).
info "Setting write permissions on data & uploads..."
mkdir -p "$APP_DIR/data" "$APP_DIR/public/uploads"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR/data" "$APP_DIR/public/uploads"

# ---------- environment file ----------
info "Writing environment file $ENV_FILE ..."
SESSION_SECRET="$(openssl rand -hex 32)"
umask 077
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=$APP_PORT
SESSION_SECRET=$SESSION_SECRET
ADMIN_USER=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
[ -n "${DATABASE_URL:-}" ] && echo "DATABASE_URL=$DATABASE_URL" >> "$ENV_FILE"
chmod 600 "$ENV_FILE"
umask 022

# ---------- systemd service ----------
info "Creating systemd service '$SERVICE'..."
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=GrowthBox website
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) $APP_DIR/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl restart "$SERVICE"
sleep 2
if ! systemctl is-active --quiet "$SERVICE"; then
  err "The app service failed to start. Logs:"
  journalctl -u "$SERVICE" -n 30 --no-pager || true
  die "Fix the above and re-run."
fi
info "App service is running on 127.0.0.1:$APP_PORT"

# ---------- firewall (if ufw is in use) ----------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  info "Opening firewall for HTTP/HTTPS..."
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
fi

# ---------- nginx reverse proxy ----------
info "Configuring nginx for $SERVER_NAMES ..."
NGINX_SITE="/etc/nginx/sites-available/$DOMAIN"
cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAMES;

    client_max_body_size 6M;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/$DOMAIN"
# Drop the default site so it doesn't shadow our server_name.
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
info "nginx is proxying $DOMAIN -> the app."

# ---------- TLS certificate via certbot ----------
info "Requesting a Let's Encrypt certificate (certbot)..."
if certbot --nginx $DOMAIN_ARGS --non-interactive --agree-tos -m "$LE_EMAIL" --redirect; then
  CERT_OK=1
  info "Certificate installed. HTTPS + auto-renewal are configured."
else
  CERT_OK=0
  warn "certbot could not obtain a certificate right now."
  warn "This almost always means DNS for $DOMAIN isn't pointing at this server yet,"
  warn "or ports 80/443 aren't reachable. The site is already live over HTTP."
  warn "Once DNS is correct, finish HTTPS with:"
  warn "    sudo certbot --nginx $DOMAIN_ARGS -m $LE_EMAIL --agree-tos --redirect"
fi

# ---------- done ----------
echo
echo -e "${BOLD}${GREEN}Deployment complete.${RESET}"
if [ "${CERT_OK:-0}" = "1" ]; then
  echo -e "  Website:     ${BOLD}https://$DOMAIN${RESET}"
  echo -e "  Admin panel: ${BOLD}https://$DOMAIN/admin${RESET}"
else
  echo -e "  Website:     ${BOLD}http://$DOMAIN${RESET}  (HTTPS pending DNS — see above)"
  echo -e "  Admin panel: ${BOLD}http://$DOMAIN/admin${RESET}"
fi
echo -e "  Admin login: ${BOLD}admin${RESET} / ${BOLD}$ADMIN_PASSWORD${RESET}"
[ "${GENERATED_PW:-0}" = "1" ] && echo -e "  ${YELLOW}(auto-generated password — save it now)${RESET}"
echo
echo "Useful commands:"
echo "  systemctl status $SERVICE      # service status"
echo "  journalctl -u $SERVICE -f      # live logs"
echo "  systemctl restart $SERVICE     # restart after code changes"
echo "  Edit secrets in $ENV_FILE then restart the service."
echo
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Content is stored in $APP_DIR/data (local files). To use a database"
  echo "instead, add DATABASE_URL to $ENV_FILE and restart the service."
fi
