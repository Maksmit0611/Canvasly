# Deploying Canvasly on Railway

## Prerequisites

- A [Railway](https://railway.app) account (free Hobby tier works)
- The repo pushed to GitHub
- A Google OAuth client ID/secret (from Google Cloud Console)

---

## 1 — Create the Railway project

1. Go to [railway.app/new](https://railway.app/new) → **Deploy from GitHub repo**
2. Select your `canvasly` repo
3. Railway creates a project. You'll add three services inside it.

---

## 2 — Add PostgreSQL

Inside the project: **+ New** → **Database** → **PostgreSQL**

Railway auto-injects `DATABASE_URL` into every service in the same project.

---

## 3 — API service

**+ New** → **GitHub Repo** → pick `canvasly` again → select service type **Empty service**.

In the service settings:

| Setting | Value |
|---|---|
| **Root Directory** | `/` (repo root) |
| **Build Command** | *(leave blank — Dockerfile handles it)* |
| **Dockerfile Path** | `Dockerfile.api` |

### Variables (Settings → Variables)

```
NODE_ENV=production
PORT=5050
JWT_SECRET=<openssl rand -base64 48>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
CORS_ORIGINS=https://<your-web-service>.up.railway.app
STORAGE_DRIVER=local
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_BYTES=26214400
```

> **DATABASE_URL** is shared automatically from the PostgreSQL plugin — no need to set it manually.

### Domain

Settings → Networking → **Generate Domain** — note the URL (e.g. `https://canvasly-api.up.railway.app`).

---

## 4 — Web service

**+ New** → **GitHub Repo** → pick `canvasly` again → **Empty service**.

| Setting | Value |
|---|---|
| **Root Directory** | `/` |
| **Dockerfile Path** | `Dockerfile.web` |

### Variables

```
VITE_API_URL=https://<api-domain>/api
VITE_WS_URL=wss://<api-domain>/collab
VITE_GOOGLE_CLIENT_ID=<your-google-client-id>
```

> Replace `<api-domain>` with the Railway domain from Step 3.

### Domain

Generate a domain here too. Update `CORS_ORIGINS` in the API service to match.

---

## 5 — Google OAuth callback

In Google Cloud Console → Credentials → your OAuth client:

- **Authorised JavaScript origins**: `https://<web-domain>.up.railway.app`
- **Authorised redirect URIs**: `https://<web-domain>.up.railway.app`

---

## 6 — CI/CD (GitHub Actions)

The workflow at `.github/workflows/ci.yml` runs automatically on every push and PR:

- Type-checks all packages
- Runs API integration tests against a real Postgres container
- Runs web unit tests
- Verifies both Docker images build cleanly (on `main` only)

Railway deploys automatically when a push to `main` passes and the Docker build succeeds.

---

## Local development

```bash
cp .env.example .env   # fill in values
docker compose up -d   # starts Postgres
npm install
npm run dev            # API on :5050, web on :5173
```

## Running tests

```bash
npm test               # all unit + integration tests
npm run test:e2e       # Playwright end-to-end (needs both servers running)
npm run test:coverage  # coverage report
```
