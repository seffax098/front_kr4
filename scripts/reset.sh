#!/usr/bin/env sh
set -eu

docker compose down -v
printf 'Контейнеры и именованные тома удалены. Для чистого запуска выполните: docker compose up -d --build\n'
