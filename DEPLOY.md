# Canvasly: run and deploy

Canvasly is a complete TypeScript monorepo: a React/Vite canvas web app, an Express/PostgreSQL API, and shared schemas. The complete source is in this repository; it is not a code snippet that needs copying elsewhere.

## What you need

- Node.js 20+ and npm for local development, or Docker for container deployment.
- PostgreSQL for accounts, cloud boards, assets metadata, and collaboration snapshots.
- Google OAuth client credentials for sign-in (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`).
- A durable upload volume or S3-compatible storage if users upload images/PDFs. Local-first boards can be used without signing in and can be exported/imported from the browser.

## Run the complete stack with Docker Compose

Install Docker Engine with the Compose plugin, then from the repository root run:

```sh
docker compose up --build
```

Compose builds the existing `Dockerfile.api` and `Dockerfile.web`, starts PostgreSQL, applies migrations before starting the API, and waits for health checks before starting the web container. Open <http://localhost:5173>. The web container proxies `/api` and `/collab` to the API, so the browser uses one origin. PostgreSQL and upload files persist in named Docker volumes.

Defaults are intended for local development only: PostgreSQL uses `postgres` credentials, JWT signing uses a development-only secret, and Google sign-in is not configured. Compose defaults the API to development mode to avoid forcing HTTPS-only refresh cookies during local HTTP testing. Local boards and import/export work without OAuth. To enable account sign-in, create a root `.env` (you can start from `.env.example`) and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `VITE_GOOGLE_CLIENT_ID` (the last one is baked into the web image, so rebuild after changing it). For a remote host, set a strong `JWT_SECRET`, a private database password, and `CORS_ORIGINS` to the exact web origin before starting. If TLS is terminated by one trusted reverse proxy in front of the API, set `TRUST_PROXY=true`; keep it false when clients can reach the API directly. The Compose stack publishes the web port at 5173 and API port at 5050 by default; change `WEB_PORT` / `API_PORT` in `.env` if these conflict. On a server, set `BIND_ADDRESS=0.0.0.0` (the default) to expose the web port through the host firewall/reverse proxy; for local-only access use `BIND_ADDRESS=127.0.0.1`. PostgreSQL is bound to localhost by default and can be reached by the app containers over Compose's private network.

Stop the services without deleting data with `docker compose down`. `docker compose down -v` also removes the database and uploaded-file volumes.

## Run with Node.js for development

```sh
cp .env.example .env
# Fill in JWT_SECRET (at least 32 chars) and Google OAuth values if you need sign-in.
docker compose up -d db
npm install
npm run migrate
npm run dev
```

Open <http://localhost:5173>. The Vite server proxies `/api` and `/collab` to the API on port 5050. The `.env` database defaults are configured for the included PostgreSQL service.

## Deploy with Docker

The API and web app are separate images so they can run on any Docker-capable host. Build from the repository root (both Dockerfiles need the monorepo files):

```sh
docker build -f Dockerfile.api -t canvasly-api .
docker build -f Dockerfile.web \
  --build-arg VITE_API_URL=https://api.example.com/api \
  --build-arg VITE_WS_URL=wss://api.example.com/collab \
  --build-arg VITE_GOOGLE_CLIENT_ID=your-google-client-id \
  -t canvasly-web .
```

Run the API with the deployment-provided `PORT` and environment variables. The API listens on `0.0.0.0`, serves HTTP and WebSocket collaboration from the same port, and applies database migrations before starting:

```sh
docker run -d --name canvasly-api -p 5050:5050 \
  -e NODE_ENV=production -e PORT=5050 \
  -e DATABASE_URL='postgres://user:password@db-host:5432/canvas' \
  -e JWT_SECRET='replace-with-a-random-secret-of-at-least-32-characters' \
  -e GOOGLE_CLIENT_ID='your-google-client-id' \
  -e GOOGLE_CLIENT_SECRET='your-google-client-secret' \
  -e CORS_ORIGINS='https://canvasly.example.com' \
  -e STORAGE_DRIVER=local -e UPLOAD_DIR=/app/uploads \
  -v canvasly_uploads:/app/uploads \
  canvasly-api
```

Use your host's managed PostgreSQL URL instead of the example. For horizontally scaled or ephemeral containers, configure `STORAGE_DRIVER=s3` and the `S3_*` variables rather than relying on a local upload volume. Ensure PostgreSQL permits the API host to connect and supports the `pgcrypto` and `citext` extensions used by migrations.

Run the web image on the platform's HTTP port (container port 80), and route browser traffic to it. Configure `VITE_API_URL` and `VITE_WS_URL` before building the image; Vite embeds these values in the static site, so changing runtime environment variables after build does not change them. The API host/reverse proxy must allow WebSocket upgrades on `/collab` as well as HTTP requests to `/api`.

Set the Google OAuth client's JavaScript origin to the final web origin. Set `CORS_ORIGINS` to the exact web origin (scheme and hostname, no path). Use HTTPS in production. If web and API are on different registrable domains, verify cookie/browser policies for the refresh-token cookie; serving the API under the web origin via a reverse proxy is the simplest configuration.

### Required API settings

- `DATABASE_URL` **or** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET` (minimum 32 characters)
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `CORS_ORIGINS` for the web origin
- `PORT` if the platform injects a port other than 5050
- `TRUST_PROXY=true` only when the API sits behind one trusted TLS-terminating proxy

For S3-compatible asset storage, set `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and optionally `S3_REGION`. See `.env.example` for all supported settings.

## Source map

- `apps/web/` — React canvas UI, local boards, import/export, and collaboration client.
- `apps/api/` — Express API, PostgreSQL migrations, authentication, uploads, and Yjs WebSocket server.
- `packages/shared/` — shared TypeScript data contracts and validation.
- `Dockerfile.web`, `Dockerfile.api` — production container builds.
- `docker-compose.yml` — complete web, API, and PostgreSQL stack; `apps/web/nginx-compose.conf` configures same-origin API and WebSocket proxying.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

`npm run test:e2e` runs the Playwright browser suite and requires the app servers to be running.
