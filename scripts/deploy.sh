#!/usr/bin/env bash
# Депой ERP: rsync → npm ci → db:migrate → build → restart vityaz-erp.service.
# Не затрагивает PM2-приложение на :3001 (vityaz-server).
#
# «Killed» / SIGKILL на `npm ci` или `next build` на маленьких VPS чаще всего из‑за Swap=0 при уже занятой RAM.
# Скрипт по умолчанию сам создаёт /swapfile (см. DEPLOY_ENSURE_SWAP), если подкачки нет и хватает места на /.
# Тюнинг в deploy/deploy.env: NEXT_NODE_MEMORY (heap для сборки), DEPLOY_SWAP_MB, DEPLOY_ENSURE_SWAP=0 чтобы не трогать swap.
#
# Из корня репозитория:
#   bash scripts/deploy.sh --bootstrap-only   # первый раз (postgres, nginx, systemd, .env)
#   bash scripts/deploy.sh
#
# Конфиг: deploy/deploy.env (шаблон deploy/deploy.env.example)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BOOTSTRAP_ONLY=false
[[ "${1:-}" == "--bootstrap-only" ]] && BOOTSTRAP_ONLY=true

if [[ -f "$ROOT/deploy/deploy.env" ]]; then
  # shellcheck source=/dev/null
  source "$ROOT/deploy/deploy.env"
fi

: "${DEPLOY_HOST:=85.209.9.29}"
: "${DEPLOY_USER:=root}"
: "${REMOTE_DIR:=/var/www/vityaz-erp}"
: "${REMOTE_APP_USER:=vityazerp}"
: "${APP_PORT:=3002}"
: "${DOMAIN:=vityaz-erp.ru}"
: "${WWW_DOMAIN:=www.vityaz-erp.ru}"

SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

echo "==> rsync → ${SSH_TARGET}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude data \
  --exclude .env \
  --exclude .env.* \
  --exclude playwright-report \
  --exclude test-results \
  --exclude "*.log" \
  --exclude .cursor \
  --exclude .npm \
  "$ROOT/" "${SSH_TARGET}:${REMOTE_DIR}/"

if [[ "$BOOTSTRAP_ONLY" == true ]]; then
  echo "==> remote: bootstrap (postgres, nginx, systemd, .env)"
  # shellcheck disable=SC2090
  ssh -o BatchMode=yes "${SSH_TARGET}" \
    REMOTE_DIR="${REMOTE_DIR}" \
    APP_USER="${REMOTE_APP_USER}" \
    APP_PORT="${APP_PORT}" \
    DOMAIN="${DOMAIN}" \
    WWW_DOMAIN="${WWW_DOMAIN}" \
    VITYAZ_ERP_DB_PASSWORD="${VITYAZ_ERP_DB_PASSWORD:?Задай VITYAZ_ERP_DB_PASSWORD в deploy/deploy.env}" \
    ERP_SESSION_SECRET="${ERP_SESSION_SECRET:?Задай ERP_SESSION_SECRET}" \
    ADMINISTRATOR_ROLE_PASSWORD="${ADMINISTRATOR_ROLE_PASSWORD:?}" \
    PLANNER_ROLE_PASSWORD="${PLANNER_ROLE_PASSWORD:?}" \
    ACCOUNTANT_ROLE_PASSWORD="${ACCOUNTANT_ROLE_PASSWORD:?}" \
    SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:?}" \
    SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:?}" \
    SEED_ADMIN_NAME="${SEED_ADMIN_NAME:-Администратор}" \
    bash -s <"$ROOT/scripts/bootstrap-vityaz-erp-server.sh"
  echo "==> bootstrap готов. Запусти: bash scripts/deploy.sh"
  exit 0
fi

echo "==> remote: install, migrate, build, restart"
ssh -o BatchMode=yes "${SSH_TARGET}" \
  REMOTE_DIR="${REMOTE_DIR}" \
  REMOTE_APP_USER="${REMOTE_APP_USER}" \
  NODE_MEMORY_MB="${NEXT_NODE_MEMORY:-768}" \
  DEPLOY_ENSURE_SWAP="${DEPLOY_ENSURE_SWAP:-1}" \
  DEPLOY_SWAP_MB="${DEPLOY_SWAP_MB:-2048}" \
  bash -s <<'REMOTE_SCRIPT'
set -euo pipefail

ensure_deploy_swap() {
  local enabled="${DEPLOY_ENSURE_SWAP:-1}"
  if [[ "$enabled" == "0" ]] || [[ "$enabled" == "false" ]]; then
    return 0
  fi

  local swap_mb total avail_kb need_kb
  swap_mb="${DEPLOY_SWAP_MB:-2048}"
  total="$(free -m | awk '/^Swap:/{print $2}')"
  if [[ "${total:-0}" -gt 0 ]]; then
    return 0
  fi

  if [[ -f /swapfile ]]; then
    chmod 600 /swapfile 2>/dev/null || true
    swapon /swapfile 2>/dev/null || true
    total="$(free -m | awk '/^Swap:/{print $2}')"
    if [[ "${total:-0}" -gt 0 ]]; then
      echo "deploy: активирован существующий /swapfile"
      return 0
    fi
  fi

  avail_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
  need_kb=$((swap_mb * 1024 + 512 * 1024))
  if [[ "${avail_kb:-0}" -lt "$need_kb" ]]; then
    echo "deploy: на / мало места для swap ${swap_mb}M (свободно ~$((avail_kb / 1024)) MiB, нужно ~$((need_kb / 1024)) MiB)." >&2
    echo "deploy: уменьши DEPLOY_SWAP_MB в deploy/deploy.env или освободи диск." >&2
    exit 1
  fi

  echo "deploy: swap выключен — создаю файл подкачки ${swap_mb}MiB (/swapfile)."
  if ! fallocate -l "${swap_mb}M" /swapfile 2>/dev/null; then
    dd if=/dev/zero of=/swapfile bs=1M count="$swap_mb" status=none
  fi
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -qE '^[[:space:]]*/swapfile[[:space:]]+none[[:space:]]+swap' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  free -h
}

chown -R "${REMOTE_APP_USER}:${REMOTE_APP_USER}" "${REMOTE_DIR}"

if [[ ! -f "${REMOTE_DIR}/.env" ]]; then
  echo "Нет ${REMOTE_DIR}/.env. Сначала: bash scripts/deploy.sh --bootstrap-only" >&2
  exit 1
fi

ensure_deploy_swap

sudo -u "${REMOTE_APP_USER}" bash -lc "
  set -euo pipefail
  cd '${REMOTE_DIR}'
  export NEXT_TELEMETRY_DISABLED=1
  export CI=1
  echo 'deploy: npm ci...'
  npm ci --no-audit --no-fund
  set -a && source .env && set +a
  if [[ -z \"\${DATABASE_URL:-}\" ]]; then
    echo 'deploy: DATABASE_URL пустой в .env — миграции невозможны' >&2
    exit 1
  fi
  echo 'deploy: миграции (db:migrate)...'
  npm run db:migrate
  # Idempotent repair: на случай «уже в schema_migrations, но ALTER на сервере не выполнился»
  if [[ -f scripts/idempotent-migrations.txt ]]; then
    echo 'deploy: idempotent repair (psql)...'
    while IFS= read -r f || [[ -n \"\$f\" ]]; do
      [[ -z \"\$f\" || \"\$f\" =~ ^[[:space:]]*# ]] && continue
      if [[ -f \"\$f\" ]]; then
        echo \"deploy: repair \$f\"
        psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -f \"\$f\" || exit 1
      else
        echo \"deploy: пропуск (нет файла) \$f\" >&2
      fi
    done < scripts/idempotent-migrations.txt
  fi
  export GENERATE_SOURCEMAP=false
  export NODE_OPTIONS=\"--max-old-space-size=${NODE_MEMORY_MB}\"
  echo 'deploy: next build (после Route list может идти Collecting build traces 1–3 мин без вывода)...'
  npm run build:webpack
  echo 'deploy: npm prune...'
  npm prune --omit=dev
  echo 'deploy: сборка завершена'
"

echo 'deploy: перезапуск vityaz-erp.service...'
systemctl daemon-reload || true
systemctl enable vityaz-erp.service
systemctl restart vityaz-erp.service
sleep 2
if systemctl is-active --quiet vityaz-erp.service; then
  echo 'vityaz-erp.service: active'
else
  journalctl -u vityaz-erp.service -n 80 --no-pager
  exit 1
fi
echo 'deploy: remote OK'
REMOTE_SCRIPT

echo "==> готово: https://${DOMAIN} (после certbot). Проверка: curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:${APP_PORT}/"
