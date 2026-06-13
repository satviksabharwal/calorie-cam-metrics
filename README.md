# CalorieCam

**Live app:** https://app.calorie-cam.workers.dev/

Snap a photo of your meal and instantly get a full nutrition breakdown — calories, protein, carbs, fat, and fibre. Meals are saved to your account so you can track what you eat over time.

## What it does

- **Analyze a meal** — upload a photo and get per-item nutrition estimates (with estimated portion size) powered by the Gemini 2.5 Flash vision model
- **Non-food detection** — photos with no food are rejected with a friendly message and never stored or counted
- **Meal history** — last 7 days show the photo alongside the full nutrition breakdown; older entries show daily totals (with meal counts) only
- **Smart deduplication** — uploading the same photo twice returns the stored result instantly with no AI call
- **Multi-user** — email/password auth via Supabase (first/last name on signup, password reset, ~30-day sessions); each user's data is completely isolated
- **Fair-use limit** — up to 10 new analyses per user per day (cached and non-food uploads don't count)
- **Auto image cleanup** — meal photos are deleted from storage after 7 days (nutrition data is kept forever)

## Architecture

```
Browser (TanStack Start on Cloudflare Workers)
  ├─ supabase-js ──► Supabase Auth (login / session / refresh)
  ├─ fetch + Bearer JWT + X-CSRF-Token ──► Express API (Render)
  │     │   (API verifies the JWT locally against Supabase's JWKS — no round-trip)
  │     ├─ GET  /api/auth/csrf        per-token stateless CSRF token
  │     ├─ POST /api/meals/analyze    hash → dedupe → rate-limit → Gemini → Storage → Postgres
  │     │                             (non-food images short-circuit, nothing stored)
  │     ├─ GET  /api/meals/recent     last 7 days with signed image URLs
  │     ├─ GET  /api/meals/daily-totals  per-day aggregates older than 7 days
  │     ├─ node-cron daily 00:05      delete storage images >7 days old
  │     └─ GET  /health               UptimeRobot keep-warm target
  └─ <img src=signed-url> ──► Supabase Storage (private bucket)
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TanStack Start (SSR), Vite, Tailwind CSS v4 |
| Routing | TanStack Router (file-based) |
| Backend | Node.js, Express |
| AI | Google Gemini 2.5 Flash (vision + structured JSON output) |
| Database | Supabase Postgres |
| Auth | Supabase Auth (email/password) + jose (local JWKS JWT verification) |
| Storage | Supabase Storage (private bucket, signed URLs) |
| Frontend hosting | Cloudflare Workers |
| Backend hosting | Render (free tier + UptimeRobot keep-warm) |

## Repo layout

```
/                        # Frontend (TanStack Start + Vite)
├─ src/
│   ├─ routes/
│   │   ├─ index.tsx          # Analyze page
│   │   ├─ history.tsx        # Meal history page
│   │   ├─ login.tsx          # Sign up / sign in / request password reset
│   │   └─ reset-password.tsx # Set a new password from a recovery link
│   ├─ components/
│   │   ├─ ResultCard.tsx
│   │   ├─ MacroBar.tsx
│   │   └─ RequireAuth.tsx
│   ├─ hooks/useAuth.ts       # Mirrors access token to sessionStorage + CSRF
│   └─ lib/
│       ├─ api.ts             # Fetch wrapper: env-aware base URL, Bearer +
│       │                     #   CSRF headers, 401 refresh-and-retry
│       ├─ image.ts           # HEIC→JPEG + canvas downscale
│       ├─ supabase.ts        # Browser Supabase client
│       └─ nutrition.ts       # Shared nutrition types
└─ server/                    # Backend (Express — separate deploy)
    ├─ src/
    │   ├─ services/
    │   │   ├─ gemini.service.ts    # Vision analysis (structured JSON schema)
    │   │   ├─ meals.service.ts     # DB queries (dedupe, insert, history, daily count)
    │   │   └─ storage.service.ts   # Upload, signed URLs, batch remove
    │   ├─ controllers/meals.controller.ts
    │   ├─ routes/auth.routes.ts     # GET /api/auth/csrf
    │   ├─ middleware/auth.ts        # Bearer JWT → local JWKS verify (jose)
    │   ├─ middleware/csrf.ts        # Stateless HMAC CSRF token + validation
    │   ├─ jobs/cleanup.job.ts       # Daily image expiry cron
    │   ├─ schemas/nutrition.ts      # Zod schemas + computeTotals
    │   └─ lib/{supabase,hash}.ts
    └─ supabase/migration.sql        # One-time schema setup
```

## How the analyze flow works

1. **Client** converts HEIC photos to JPEG (via `heic2any`) and downscales to a max 1568px long edge at JPEG quality 0.85, then sends `{ imageBase64, mimeType }` to the API
2. **Server** validates the input and computes a SHA-256 hash of the image bytes
3. **Dedupe check** — if this user has analyzed the same image before, the stored result is returned immediately (`cached: true`) with no Gemini call
4. **Rate limit** — otherwise, if the user has already run 10 new analyses today, the request is rejected with `429`
5. **Gemini** receives the base64 image and returns a structured JSON response listing each food item with an estimated portion size, calories, protein, carbs, fat and fibre
6. **Non-food short-circuit** — if Gemini returns no food items, the server responds `{ isFood: false, message }` and stores nothing (no upload, no DB row, no rate-limit charge)
7. Totals are computed server-side (always equal the sum of items)
8. The image is uploaded to Supabase Storage; then the meal row is inserted to Postgres
9. A signed URL (1 hour TTL) is returned (`{ isFood: true, meal, cached }`) so the browser can display the photo without exposing the storage bucket publicly

## Database schema

```sql
-- meals: one row per analyzed photo
create table public.meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  image_hash  text not null,       -- SHA-256 hex; dedupe key per user
  image_path  text,                -- storage path; set to null after 7 days
  nutrition   jsonb not null,      -- { status, food: [...], total: {...} }
  created_at  timestamptz not null default now(),
  unique (user_id, image_hash)
);

-- meal_daily_totals: view for the "Earlier" section
-- aggregates meal_count + calories/protein/carbs/fat/fibre by UTC day per user
```

RLS is enabled on `meals`. The browser (anon key) can only read its own rows. All writes go through the server using the service role key which bypasses RLS.

## Local development

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- A Supabase project (free tier is fine)
- A Google AI Studio API key (Gemini)

### 1. Supabase setup

1. Create a new Supabase project
2. Go to **SQL Editor** and run the entire contents of `server/supabase/migration.sql`
3. Go to **Storage** → **New bucket** → name it `meal-images`, set **Public = OFF**
4. Go to **Authentication** → **Providers** → enable **Email**

### 2. Frontend env

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...   # anon/public key
VITE_API_URL=http://localhost:3001
```

Find the keys at: Supabase dashboard → **Project Settings** → **API**.

### 3. Server env

Create `server/.env`:

```env
GEMINI_API_KEY=AIza...

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # service_role key — keep secret
SUPABASE_STORAGE_BUCKET=meal-images

CSRF_SECRET=...                        # 32+ char secret — generate: openssl rand -hex 32

ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080
PORT=3001
```

> **Never put the service role key in a `VITE_*` variable or commit it to git.**

### 4. Run

In two terminals:

```bash
# Terminal 1 — frontend
pnpm dev

# Terminal 2 — backend
cd server
npm run dev
```

Frontend: `http://localhost:8080` · API: `http://localhost:3001`

## Deployment

### Backend → Render

1. Push the repo to GitHub
2. Create a new **Web Service** on Render
3. Set **Root Directory** to `server`
4. Build command: `npm install && npm run build`
5. Start command: `npm start`
6. Add all `server/.env` vars in Render's **Environment** settings (never commit them)
7. Set up a free [UptimeRobot](https://uptimerobot.com) monitor hitting `https://your-render-url.onrender.com/health` every 5 minutes — this prevents the free dyno from sleeping and keeps the daily cleanup cron alive

### Frontend → Cloudflare Workers

```bash
pnpm build
npx wrangler deploy
```

Set `VITE_API_URL` to your Render URL and add the Cloudflare Workers domain to `ALLOWED_ORIGINS` in Render's environment settings.

## Security notes

- The service role key, Gemini API key and `CSRF_SECRET` live only in `server/.env` and the Render dashboard — never in the frontend bundle
- Supabase RLS ensures users can only query their own meals even if the anon key is used directly
- All meal routes require a valid Supabase Bearer token; the server verifies the JWT signature locally against Supabase's JWKS (via `jose`) rather than calling Supabase on every request
- State-changing requests also require an `X-CSRF-Token` header — a stateless `HMAC(accessToken, CSRF_SECRET)` checked with a timing-safe comparison
- Every API response sets hardening headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`)
- Storage images are private; the browser only ever gets short-lived signed URLs minted by the server
- Image deduplication is per-user — the same photo uploaded by two different users triggers two separate Gemini calls

## Cost estimate

Gemini 2.5 Flash is billed per token. A typical meal photo analysis uses roughly 500–1500 input tokens (image) + ~300 output tokens. At current pricing this is well under $0.01 per photo. Deduplication makes repeated uploads free. For a small project under 100 users the monthly AI cost is negligible.
