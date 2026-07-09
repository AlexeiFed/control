#!/usr/bin/env bash
# Обёртка: актуальный деплой — scripts/deploy.sh
exec "$(cd "$(dirname "$0")/.." && pwd)/scripts/deploy.sh" "$@"
