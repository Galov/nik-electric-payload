# Staging Deploy

Staging deploy за `Nik Electric` с:

- `GitHub Actions` за build
- `GHCR` за Docker image
- `Ubuntu VPS` само за runtime

## Как работи

1. push към `main`
2. GitHub Actions build-ва Docker image
3. image-ът се качва в `ghcr.io`
4. workflow-ът се логва по SSH в сървъра
5. на сървъра се изпълнява:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml pull
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
```

Сървърът не build-ва приложението.

## 1. Подгответе сървъра

- Ubuntu на Hetzner
- Docker и Docker Compose plugin
- публичен DNS запис към сървъра:
  - препоръчително `staging.nikelectric.eu`

## 2. Allowlist в MongoDB Atlas

Добавете публичното IP на Hetzner сървъра в Atlas Network Access.

## 3. GitHub Actions workflow

В repo-то има workflow:

`/.github/workflows/docker-deploy.yml`

Той:

- build-ва Docker image на GitHub Actions
- push-ва го в GitHub Container Registry
- tag-ва го като:
  - `ghcr.io/<owner>/<repo>:main`
  - `ghcr.io/<owner>/<repo>:sha-<commit>`
- после задейства deploy по SSH към staging сървъра

## 4. GitHub Repository Variables

Добави следните `Repository variables`:

- `NEXT_PUBLIC_SERVER_URL`
- `PAYLOAD_PUBLIC_SERVER_URL`
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `DEPLOY_PORT` (по желание, default `22`)

## 5. GitHub Repository Secrets

Добави следния `Repository secret`:

- `DEPLOY_SSH_KEY`

Това е private key-ът, с който Actions ще влиза в сървъра.

## 6. Подгответе сървъра

Качете проекта на сървъра, например в:

`/opt/nic-electrik-payload`

Трябват само:

- `docker-compose.staging.yml`
- `.env.staging`

## 7. Направете staging env файл

Копирайте:

`/opt/nic-electrik-payload/.env.staging.example`

към:

`/opt/nic-electrik-payload/.env.staging`

и попълнете:

- `APP_IMAGE`
- `PAYLOAD_SECRET`
- `DATABASE_URL`
- `NEXT_PUBLIC_SERVER_URL`
- `PAYLOAD_PUBLIC_SERVER_URL`
- `PREVIEW_SECRET`
- `MICROINVEST_WEBHOOK_SECRET`

Пример:

`APP_IMAGE=ghcr.io/galov/nik-electric-payload:main`

## 8. GHCR login на сървъра

На сървъра трябва да има Docker login към GHCR:

```bash
echo "<github_pat>" | docker login ghcr.io -u <github_username> --password-stdin
```

PAT-ът трябва да има достъп за четене на packages.

## 9. Първоначален setup на VPS

Примерно:

```bash
sudo mkdir -p /opt/nic-electrik-payload
sudo chown -R $USER:$USER /opt/nic-electrik-payload
cd /opt/nic-electrik-payload
```

После качи:

- `docker-compose.staging.yml`
- `.env.staging`

## 10. Публичен или частен GHCR пакет

Ако repo-то е `public`, image-ът в `GHCR` може да е публичен и сървърът да pull-ва без допълнителен login.

След първия publish провери в GitHub:

- `Packages`
- `nic-electrik-payload`
- visibility да е `public`, ако искаш VPS-ът да pull-ва без token

Ако repo-то е `private`, ще трябва:

- или пакетът да остане public
- или да има `docker login ghcr.io` на сървъра с token

## 11. Smoke test

Проверете:

- начална страница
- `/shop`
- `/admin`
- login в admin
- някой product page
- legacy изображения

## 12. Webhook test

Endpoint:

`POST https://staging.nikelectric.eu/api/integrations/microinvest/webhook`

Headers:

- `Content-Type: application/json`
- `x-microinvest-secret: <MICROINVEST_WEBHOOK_SECRET>`

## 13. Reverse proxy / SSL

За истински публичен staging е нужен reverse proxy със сертификат:

- Caddy
- Nginx
- Traefik

Ако искаме, следващата стъпка е да добавим и примерен Caddyfile.

## Полезни команди

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml logs -f
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
docker compose --env-file .env.staging -f docker-compose.staging.yml down
docker compose --env-file .env.staging -f docker-compose.staging.yml pull
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
```
