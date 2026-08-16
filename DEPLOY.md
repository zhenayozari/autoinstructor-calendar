# Деплой на сервер

Короткая инструкция для обновления production-сервера `auto-legenda.ru`.

## Как устроен сервер

- Код проекта лежит в `/var/www/autoinstructor-calendar`.
- Caddy принимает HTTPS-запросы на `auto-legenda.ru`.
- Caddy проксирует сайт на `localhost:3000`.
- Next.js должен быть запущен на порту `3000`.
- PM2 держит Next.js-процесс запущенным после выхода из SSH.

## Обычный деплой

```bash
cd /var/www/autoinstructor-calendar
git status --short
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build
pm2 restart autoinstructor-calendar
```

Проверка:

```bash
pm2 list
ss -ltnp | grep :3000
curl -I http://127.0.0.1:3000
curl -I https://auto-legenda.ru
```

Ожидаемо:

- `pm2 list` показывает `autoinstructor-calendar` со статусом `online`;
- `ss` показывает, что `next-server` слушает `:3000`;
- оба `curl` возвращают HTTP `200`, `307` или `308`, но не `502`.

## Если PM2-процесса нет

Создать процесс заново:

```bash
cd /var/www/autoinstructor-calendar
HOSTNAME=127.0.0.1 PORT=3000 pm2 start pnpm --name autoinstructor-calendar -- start
pm2 save
```

После этого выполнить проверки из раздела выше.

## Если сайт отдаёт 502

`502` обычно значит, что Caddy жив, но Next.js не отвечает на `localhost:3000`.

Проверить:

```bash
pm2 list
pm2 logs autoinstructor-calendar --lines 80
ss -ltnp | grep :3000
```

Если процесс постоянно перезапускается, в `pm2 logs` будет причина падения.

## Важные правила

- Не делать `git reset --hard`, если не ясно, есть ли на сервере локальные изменения.
- Перед `git pull` всегда смотреть `git status --short`.
- Для запуска не передавать `-H` или `--hostname` через `pnpm start`: Next может принять их за путь к проекту.
- Хост и порт задавать через переменные:

```bash
HOSTNAME=127.0.0.1 PORT=3000 pm2 start pnpm --name autoinstructor-calendar -- start
```

## Caddy

Текущий `/etc/caddy/Caddyfile`:

```caddy
www.auto-legenda.ru {
        redir https://auto-legenda.ru{uri} permanent
}

auto-legenda.ru {
        reverse_proxy localhost:3000
}
```

Если Caddy менялся, проверить конфигурацию:

```bash
systemctl status caddy --no-pager
cat /etc/caddy/Caddyfile
```
