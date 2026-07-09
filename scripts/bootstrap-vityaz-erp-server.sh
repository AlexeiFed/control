#!/usr/bin/env bash
# Вызывается с сервера через: ssh ... env ... bash -s < scripts/bootstrap-vityaz-erp-server.sh
# Не трогает PM2/vityaz (порт 3001) и конфиги vityaz-security.

set -euo pipefail

require_var() {
  local n="$1"
  if [[ -z "${!n:-}" ]]; then
    echo "bootstrap: требуется переменная $n" >&2
    exit 1
  fi
}

require_var REMOTE_DIR
require_var APP_USER
require_var APP_PORT
require_var DOMAIN
require_var WWW_DOMAIN
require_var VITYAZ_ERP_DB_PASSWORD
require_var ERP_SESSION_SECRET
require_var ADMINISTRATOR_ROLE_PASSWORD
require_var PLANNER_ROLE_PASSWORD
require_var ACCOUNTANT_ROLE_PASSWORD
require_var SEED_ADMIN_EMAIL
require_var SEED_ADMIN_PASSWORD

export DOMAIN WWW_DOMAIN APP_PORT

if ! id -u "${APP_USER}" &>/dev/null; then
  useradd --system --home "${REMOTE_DIR}" --create-home --shell /usr/sbin/nologin "${APP_USER}"
fi

mkdir -p "${REMOTE_DIR}/data"
chown -R "${APP_USER}:${APP_USER}" "${REMOTE_DIR}"

if ! command -v envsubst >/dev/null; then
  apt-get update -qq
  apt-get install -y gettext-base
fi

psql_quote() {
  # Экранирование одинарных кавычек для литерала в psql: O'Reilly -> 'O''Reilly'
  printf "%s" "${1//\'/\'\'}"
}

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='vityaz_erp'" | grep -q 1; then
  pw_literal="$(psql_quote "${VITYAZ_ERP_DB_PASSWORD}")"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE USER vityaz_erp WITH PASSWORD '${pw_literal}';"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='vityaz_erp'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE vityaz_erp OWNER vityaz_erp;"
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -d vityaz_erp <<'SQL'
GRANT ALL ON SCHEMA public TO vityaz_erp;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO vityaz_erp;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO vityaz_erp;
SQL

ENC_PASS_PY="$(
  VITYAZ_ERP_DB_PASSWORD="${VITYAZ_ERP_DB_PASSWORD}" python3 -c \
    "import os, urllib.parse; print(urllib.parse.quote(os.environ['VITYAZ_ERP_DB_PASSWORD'], safe=''))"
)"
DATABASE_URL="postgresql://vityaz_erp:${ENC_PASS_PY}@127.0.0.1:5432/vityaz_erp"
ADMIN_NAME="${SEED_ADMIN_NAME:-Администратор}"

if [[ ! -f "${REMOTE_DIR}/.env" ]]; then
  umask 077
  {
    echo "NODE_ENV=production"
    echo "PORT=${APP_PORT}"
    echo "DATABASE_URL=${DATABASE_URL}"
    echo "ERP_SESSION_SECRET=${ERP_SESSION_SECRET}"
    echo "ADMINISTRATOR_ROLE_PASSWORD=${ADMINISTRATOR_ROLE_PASSWORD}"
    echo "PLANNER_ROLE_PASSWORD=${PLANNER_ROLE_PASSWORD}"
    echo "ACCOUNTANT_ROLE_PASSWORD=${ACCOUNTANT_ROLE_PASSWORD}"
    echo "SEED_ADMIN_EMAIL=${SEED_ADMIN_EMAIL}"
    echo "SEED_ADMIN_PASSWORD=${SEED_ADMIN_PASSWORD}"
    echo "SEED_ADMIN_NAME=${ADMIN_NAME}"
  } >"${REMOTE_DIR}/.env"
  chown "${APP_USER}:${APP_USER}" "${REMOTE_DIR}/.env"
  chmod 600 "${REMOTE_DIR}/.env"
else
  echo "bootstrap: ${REMOTE_DIR}/.env уже есть — не перезаписываю"
fi

export APP_USER REMOTE_DIR
envsubst '${DOMAIN} ${WWW_DOMAIN} ${APP_PORT} ${REMOTE_DIR}' <"${REMOTE_DIR}/deploy/nginx-vityaz-erp.conf.template" \
  >/etc/nginx/sites-available/vityaz-erp

ln -sf /etc/nginx/sites-available/vityaz-erp /etc/nginx/sites-enabled/vityaz-erp
nginx -t
systemctl reload nginx

envsubst '${APP_USER} ${REMOTE_DIR}' <"${REMOTE_DIR}/deploy/vityaz-erp.service.template" \
  >/etc/systemd/system/vityaz-erp.service

systemctl daemon-reload
systemctl enable vityaz-erp.service

echo "bootstrap: готово (nginx + systemd + postgres + .env). Далее с локальной машины: bash scripts/deploy.sh"
