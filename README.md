## Что реализовано

| Практика | Требование | Где реализовано |
|---|---|---|
| 19. PostgreSQL | CRUD API для пользователей с полями `id`, `first_name`, `last_name`, `age`, `created_at`, `updated_at` | `/api/users`, таблица `users` в PostgreSQL |
| 20. MongoDB | NoSQL-хранение пользовательских данных | MongoDB-коллекция `user_profiles`, поле `profile` в ответах `/api/users` |
| 21. Redis | Кэширование `/api/users`, `/api/users/:id`, `/api/products`, `/api/products/:id` | middleware `backend/src/middleware/cache.js`, TTL 60 сек. для users и 600 сек. для products |
| 22. Балансировка | Несколько backend-серверов, Nginx, `max_fails`, `fail_timeout` | `backend1`, `backend2`, `backend3`, `nginx/nginx.conf` |
| 23. Docker | Контейнеризация и Docker Compose | `Dockerfile`, `docker-compose.yml`, общая Docker-сеть и volumes |



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

Остановить стек без удаления данных:

```bash
docker compose down
```

Полностью очистить контейнеры и данные PostgreSQL/MongoDB/Redis:

```bash
./scripts/reset.sh
```


## API

### Служебные маршруты

| Метод | Адрес | Описание |
|---|---|---|
| GET | `/` | Ответ backend с идентификатором контейнера. Удобно для проверки балансировки |
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
