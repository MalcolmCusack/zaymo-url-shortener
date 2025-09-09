# Zaymo Email Link Shortener

Shrink links in HTML emails to reduce size and avoid Gmail clipping. Upload or paste HTML, automatically shorten all http(s) anchor hrefs, and download the rewritten HTML. Each short link redirects via `/r/:id` and optionally logs a click event.

Tech stack: React Router v7, TypeScript, Vite, Tailwind, Supabase (Postgres + Auth), Cheerio.

## Features

- Server-rendered React Router app
- Upload or paste HTML, get a rewritten version with short links
- Recent jobs view and a basic links list for logged-in users
- Redirect route `/r/:id` with best‑effort click logging

## Quickstart

### 1) Install

```bash
npm install
```

### 2) Configure environment

Create `.env` (or set env vars in your host):

```bash
# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional: domain used when generating short links. Falls back to request origin.
SHORT_DOMAIN=https://your-short-domain.com

# (Optional, for future TODOs)
# Resend/Mailgun for sending processed emails
# RESEND_API_KEY=...
# MAILGUN_API_KEY=...
# MAILGUN_DOMAIN=...

# Vercel KV or Upstash Redis for edge cache
# VERCEL_KV_REST_API_URL=...
# VERCEL_KV_REST_API_TOKEN=...
# UPSTASH_REDIS_REST_URL=...
# UPSTASH_REDIS_REST_TOKEN=...
```

### 3) Database

Run the SQL in `supabase/migrations/20250909222048_1_init.sql` on your Supabase project (SQL editor) or with `psql`.

Schema highlights:

- `links(id text pk, original text, created_by uuid, ...)`
- `html_jobs(id uuid pk, filename, bytes_in, bytes_out, link_count, created_by, ...)`
- `html_links(job_id uuid, link_id text, original text, ...)` mapping
- `click_events(id bigserial, link_id text, ts, ua, ip_hash, referer)` append‑only

Row Level Security (RLS) is enabled; policies allow owners to read/write their data. `click_events` allows anonymous insert for logging.

### 4) Develop

```bash
npm run dev
```

Open `http://localhost:5173`.

### 5) Build & Run

```bash
npm run build
npm start
```

The server listens on the default port for `@react-router/serve` (use `PORT` to override).

### Docker

```bash
docker build -t zaymo-url-shortener .
docker run -p 3000:3000 --env-file .env zaymo-url-shortener
```

## How it works

- Home (`/`):
  - Parses provided HTML with Cheerio, extracts unique http(s) anchor `href`s.
  - Inserts short links into `links` (retrying IDs up to 3x), maps with `html_links`, and rewrites the DOM.
  - Computes size savings and shows mapping + preview. Download or copy the processed HTML.
  - Uses `SHORT_DOMAIN` if set; otherwise falls back to the request origin to build `/r/:id` URLs.

- Redirect (`/r/:id`):
  - Looks up `original` in `links` and redirects 302.
  - Best‑effort logs a row in `click_events` with limited `ua`, `referer`, and a truncated SHA‑256 hash of IP.

- Links (`/links`):
  - For authenticated users, lists links from recent jobs with simple pagination.

Auth: Supabase Auth; see `app/root.tsx` and `app/utils/supabase.server.ts`.

## Configuration

- `SHORT_DOMAIN`: Prefer a canonical short domain (e.g., `https://s.example.com`). If omitted, the app uses the request origin.
- Supabase keys: All three are required for full functionality. The anon key is used server-side with SSR cookie handling; the service role key is used for admin lookup on redirects and logging.

## Roadmap / TODOs

### Error handling
- Show per‑link errors (if an insert fails) and retry UI.
- Preserve `mailto:`, `tel:`, and templating tokens (`{{…}}`, `{% unsubscribe_link %}`) untouched.

### “Send Email” capability (optional but nice)
- Wire `sendProcessedEmail(html, to)` using Resend (or Mailgun). Add a small form (To, Subject).
- Pre‑fill subject: “Shortened email ready”; body = processed HTML.
- Include your repo link and live demo URL inside that processed HTML, proving the shortener was used.

### Lightweight analytics & admin

#### Mini analytics screen
- Route: `/links/:id` → show last 100 clicks (ts, referrer, UA), and a sparkline (client‑side).
- Aggregate counts: `select link_id, count(*) from click_events group by 1;`
- Add CSV export (simple Content‑Disposition endpoint).

#### Admin guardrails
- Domain allowlist (e.g., only shorten http(s) targets from an allowlist or all except a blocklist).
- Per‑day link creation limits (e.g., 5,000/user/day).

### Edge‑optimize redirects (scale path)

Goal: eliminate DB hop on every `/r/:id` request.
- Add Vercel KV (or Upstash Redis). Key: `link:<id>` → original.
- On link creation, write to KV in addition to Postgres.
- On `/r/:id` loader:
  1. get from KV → if found, redirect.
  2. else fallback to Supabase, then populate KV.
- (Optional) Move to a Remix/React Router edge runtime for the redirect route.

## Scripts

- `npm run dev` – Start dev server
- `npm run build` – Build client and server bundles
- `npm start` – Run the built server
- `npm run typecheck` – Generate types and run TypeScript
- `npm run lint` / `npm run lint:fix` – Lint
- `npm run format` – Prettier write

---

Built with ❤️ using React Router and Supabase.
