# Unified Fullstack Platform

Единый проект для практических работ 19-24 по дисциплине «Фронтенд и бэкенд разработка».

Это не набор отдельных папок под каждую практику, а одно большое приложение, где все технологии работают вместе:

- **Node.js + Express** — backend API.
- **PostgreSQL** — реляционная часть данных: основные поля пользователей и товаров.
- **MongoDB** — NoSQL-документы: гибкие профили пользователей и дополнительные документы товаров.
- **Redis** — кэширование GET-запросов.
- **Nginx** — основной reverse proxy и балансировщик нагрузки на порту `80`.
- **HAProxy** — альтернативный балансировщик нагрузки на порту `8080`.
- **Docker Compose** — запуск всего стека одной командой.
- **Frontend** — простая HTML/CSS/JS-страница, которую отдает Nginx по адресу `/ui/`.

## Что реализовано по практикам

| Практика | Требование | Где реализовано |
|---|---|---|
| 19. PostgreSQL | CRUD API для пользователей с полями `id`, `first_name`, `last_name`, `age`, `created_at`, `updated_at` | `/api/users`, таблица `users` в PostgreSQL |
| 20. MongoDB | NoSQL-хранение пользовательских данных | MongoDB-коллекция `user_profiles`, поле `profile` в ответах `/api/users` |
| 21. Redis | Кэширование `/api/users`, `/api/users/:id`, `/api/products`, `/api/products/:id` | middleware `backend/src/middleware/cache.js`, TTL 60 сек. для users и 600 сек. для products |
| 22. Балансировка | Несколько backend-серверов, Nginx, HAProxy, `max_fails`, `fail_timeout` | `backend1`, `backend2`, `backend3`, `nginx/nginx.conf`, `haproxy/haproxy.cfg` |
| 23. Docker | Контейнеризация и Docker Compose | `Dockerfile`, `docker-compose.yml`, общая Docker-сеть и volumes |
| 24. КР-4 | README, проверка, подготовка репозитория | этот `README.md`, `.gitignore`, `docs/api-examples.http`, `scripts/test.sh` |



## Быстрый запуск

```bash
docker compose up -d --build
```

Проверить контейнеры:

```bash
docker compose ps
```

Открыть приложение:

- API через Nginx: `http://localhost/`
- Frontend: `http://localhost/ui/`
- API status: `http://localhost/api/status`
- HAProxy-альтернатива: `http://localhost:8080/`
- HAProxy stats: `http://localhost:8404/`

Остановить стек без удаления данных:

```bash
docker compose down
```

Полностью очистить контейнеры и данные PostgreSQL/MongoDB/Redis:

```bash
./scripts/reset.sh
```

## Проверка балансировки нагрузки

Nginx балансирует запросы между `backend1` и `backend2`, а `backend3` указан как резервный backend.

```bash
for i in {1..6}; do curl http://localhost/; echo; done
```

В ответах должно меняться поле `server`, например:

```json
{"server":"backend-1"}
{"server":"backend-2"}
```

HAProxy проверяется аналогично:

```bash
for i in {1..6}; do curl http://localhost:8080/; echo; done
```

## Проверка отказоустойчивости Nginx

В `nginx/nginx.conf` настроены параметры:

```nginx
server backend1:3000 max_fails=2 fail_timeout=30s;
server backend2:3000 max_fails=2 fail_timeout=30s;
server backend3:3000 backup max_fails=2 fail_timeout=30s;
```

Проверка:

```bash
docker compose stop backend1
for i in {1..6}; do curl http://localhost/; echo; done
```

Nginx перестанет отправлять запросы на остановленный контейнер и продолжит обслуживать трафик через оставшиеся backend-сервисы.

Вернуть контейнер:

```bash
docker compose start backend1
```

## API

### Служебные маршруты

| Метод | Адрес | Описание |
|---|---|---|
| GET | `/` | Ответ backend с идентификатором контейнера. Удобно для проверки балансировки |
| GET | `/health` | Healthcheck backend-сервиса |
| GET | `/api/status` | Информация о кэше и технологиях |
| DELETE | `/api/cache` | Очистка Redis-кэша приложения |

### Пользователи

Основные поля пользователя хранятся в PostgreSQL, а `profile` хранится в MongoDB.

| Метод | Адрес | Описание |
|---|---|---|
| POST | `/api/users` | Создание пользователя |
| GET | `/api/users` | Получение списка пользователей, Redis TTL 60 секунд |
| GET | `/api/users/:id` | Получение пользователя по ID, Redis TTL 60 секунд |
| PATCH | `/api/users/:id` | Обновление PostgreSQL-полей и/или MongoDB-профиля |
| DELETE | `/api/users/:id` | Удаление пользователя и его MongoDB-профиля |

Пример создания пользователя:

```bash
curl -X POST http://localhost/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Иван",
    "last_name": "Иванов",
    "age": 22,
    "profile": {
      "contacts": { "email": "ivan@example.com", "telegram": "@ivan" },
      "interests": ["docker", "redis", "postgres"],
      "preferences": { "theme": "dark" }
    }
  }'
```

Проверка кэша:

```bash
curl http://localhost/api/users
curl http://localhost/api/users
```

Первый ответ обычно содержит `"source":"server"`, второй — `"source":"cache"`.

### Товары

Товары добавлены для проверки Redis-кэша на маршрутах `/api/products` и `/api/products/:id`. Основные поля хранятся в PostgreSQL, расширенный документ — в MongoDB.

| Метод | Адрес | Описание |
|---|---|---|
| POST | `/api/products` | Создание товара |
| GET | `/api/products` | Получение списка товаров, Redis TTL 600 секунд |
| GET | `/api/products/:id` | Получение товара по ID, Redis TTL 600 секунд |
| PATCH | `/api/products/:id` | Обновление товара и/или MongoDB-документа |
| DELETE | `/api/products/:id` | Удаление товара и MongoDB-документа |

Пример создания товара:

```bash
curl -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Монитор",
    "price": 18500,
    "description": "27-дюймовый монитор",
    "document": {
      "tags": ["office", "display"],
      "stock": 15,
      "attributes": { "diagonal": "27", "panel": "IPS" }
    }
  }'
```

## Автоматическая проверка

После запуска стека можно выполнить:

```bash
./scripts/test.sh
```

Скрипт проверяет:

1. Round-robin через Nginx.
2. Round-robin через HAProxy.
3. `/api/status`.
4. Создание пользователя с данными в PostgreSQL и MongoDB.
5. Redis-кэширование `/api/users`.
6. Создание товара с данными в PostgreSQL и MongoDB.
7. Redis-кэширование `/api/products`.

## Логи и отладка

Все логи:

```bash
docker compose logs -f
```

Логи одного backend-сервиса:

```bash
docker compose logs -f backend1
```

Зайти внутрь backend-контейнера:

```bash
docker compose exec backend1 sh
```

Проверить Redis вручную:

```bash
docker compose exec redis redis-cli keys '*'
```

## Подготовка репозитория для сдачи

```bash
git init
git add .
git commit -m "Unified fullstack practices 19-24"
```

Затем создайте открытый репозиторий на GitHub/GitLab и отправьте проект:

```bash
git branch -M main
git remote add origin <URL_ВАШЕГО_РЕПОЗИТОРИЯ>
git push -u origin main
```