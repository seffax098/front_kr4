#!/usr/bin/env sh
set -eu

BASE="${BASE:-http://localhost}"
HAPROXY_BASE="${HAPROXY_BASE:-http://localhost:8080}"

printf '\n== Nginx balancing test ==\n'
for i in 1 2 3 4 5 6; do
  printf 'Nginx request %s: ' "$i"
  curl -s "$BASE/"
  printf '\n'
done

printf '\n== HAProxy balancing test ==\n'
for i in 1 2 3 4; do
  printf 'HAProxy request %s: ' "$i"
  curl -s "$HAPROXY_BASE/"
  printf '\n'
done

printf '\n== API status ==\n'
curl -s "$BASE/api/status"
printf '\n'

printf '\n== Create user: PostgreSQL + MongoDB ==\n'
curl -s -X POST "$BASE/api/users" \
  -H 'Content-Type: application/json' \
  -d '{"first_name":"Тест","last_name":"Пользователь","age":20,"profile":{"contacts":{"email":"test@example.com"},"interests":["postgres","mongodb","redis"],"preferences":{"script":true}}}'
printf '\n'

printf '\n== Users cache: second response should be source=cache ==\n'
curl -s "$BASE/api/users"
printf '\n'
curl -s "$BASE/api/users"
printf '\n'

printf '\n== Create product: PostgreSQL + MongoDB ==\n'
curl -s -X POST "$BASE/api/products" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Тестовый товар","price":999,"description":"Создан scripts/test.sh","document":{"tags":["test","cache"],"stock":5,"attributes":{"source":"script"}}}'
printf '\n'

printf '\n== Products cache: second response should be source=cache ==\n'
curl -s "$BASE/api/products"
printf '\n'
curl -s "$BASE/api/products"
printf '\n'

printf '\n== Done ==\n'
