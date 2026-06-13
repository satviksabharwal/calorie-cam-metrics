# CalorieCam — High-Level System Design

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                             │
├─────────────────────────────────────────────────────────────────┤
│  React 19 App (TanStack Start)                                   │
│  ├─ Session (Supabase Auth) → localStorage                       │
│  ├─ Bearer JWT Token                                             │
│  └─ Signed image URLs (for private storage access)               │
└────────┬──────────────────────────────────────────────────────────┘
         │ HTTPS
         ├─────────────────────────────────────────────────────────┐
         │                                                           │
    ┌────▼──────────────────────┐                    ┌──────────────▼────────────┐
    │   CLOUDFLARE WORKERS       │                    │   RENDER BACKEND (Node)   │
    ├────────────────────────────┤                    ├────────────────────────────┤
    │ Frontend SSR/Client Assets │                    │ Express API Server         │
    │ ├─ /login                  │                    │ ├─ POST /api/meals/analyze │
    │ ├─ /                       │ ◄─────Bearer──────►│ ├─ GET  /api/meals/recent  │
    │ ├─ /history               │      JWT Token     │ ├─ GET  /api/meals/...     │
    │ └─ Static assets           │                    │ ├─ cron: daily cleanup     │
    │                            │                    │ └─ /health (UptimeRobot)   │
    │ TanStack Start (Vite SSR)  │                    │                            │
    └────┬──────────────────────┘                    └───────┬────────┬──────┬────┘
         │                                                    │        │      │
         │                                        ┌──────────┘        │      └─────────┐
         │                                        │                   │                 │
    ┌────▼────────────────────────────┐    ┌─────▼─────┐    ┌───────▼──────┐   ┌─────▼─────────┐
    │   SUPABASE                       │    │  Google   │    │ Supabase     │   │ Supabase      │
    ├──────────────────────────────────┤    │  Gemini   │    │ Postgres DB  │   │ Storage       │
    │ Auth (email/password)            │    │ 2.5 Flash │    │              │   │ (meal images) │
    │ ├─ User signup/login            │    │ (vision)  │    │ ├─ meals     │   │               │
    │ ├─ Session management           │    │           │    │ ├─ users     │   │ ├─ private    │
    │ ├─ JWT token generation         │    │ nutrition │    │ ├─ RLS rules │   │ ├─ 7-day TTL  │
    │ └─ Token validation             │    │ analysis  │    │ └─ indices   │   │ └─ signed URLs│
    │                                  │    │           │    │              │   │                │
    └────────────────────────────────┘    └───────────┘    └──────────────┘   └────────────────┘
```

---

## 2. Frontend Architecture (Cloudflare Workers)

### Page Structure

```
src/routes/
├─ index.tsx           # Analyze page — photo upload, results, greets user by name
├─ login.tsx           # Auth page — sign up (first/last name) / sign in / reset request
├─ reset-password.tsx  # Set a new password from a recovery-link session
└─ history.tsx         # Meal history — last 7 days (detailed), older days (totals only)
```

### Key Components

```
src/components/
├─ RequireAuth.tsx     # Guard: redirects to /login if not authenticated
├─ ResultCard.tsx      # Displays single meal analysis (food items + totals)
└─ MacroBar.tsx        # Visual breakdown of calories/protein/carbs/fat/fibre

src/lib/image.ts        # HEIC→JPEG conversion + canvas downscale (used inline
                        # by the analyze page; a single <input accept="image/*">
                        # gives a file picker on desktop and camera/library on
                        # mobile — no desktop-only "Take photo" capture button)
```

### Authentication Flow (Frontend)

```
1. User enters first/last name (signup) + email/password on /login
2. supabase.auth.signUp() stores name in user_metadata; .signInWithPassword()
   for returning users; .resetPasswordForEmail() emails a recovery link
3. Supabase SDK persists the full session (incl. refresh token) in localStorage
   → user stays signed in ~30 days, token auto-refreshed transparently
4. useAuth() mirrors the access_token into sessionStorage and fetches a CSRF
   token, re-doing both on every Supabase auth state change (refresh/sign-out)
5. RequireAuth component checks useAuth() — if null, redirects to /login
6. /reset-password consumes the recovery-link session (detectSessionInUrl) and
   calls supabase.auth.updateUser({ password })
```

### API Integration (Frontend)

```
api.ts (fetch wrapper)
├─ resolveApiUrl(): picks local vs prod backend from the host the app is served
│   from; VITE_API_URL only overrides when it matches the current env (a stale
│   value can never cause dev→prod / prod→localhost CORS failures)
├─ Attaches Authorization: Bearer <access_token from sessionStorage>
├─ Attaches X-CSRF-Token on every mutation (POST/PUT/DELETE/PATCH)
├─ On 401: refreshSession() once, re-fetch CSRF token, then retry the request
└─ Parses errors, throws for UI error boundaries
```

### Image Processing (Frontend)

```
1. User selects photo (camera capture or file upload)
2. If HEIC format → heic2any converts to JPEG
3. Canvas downscales to max 1568px (long edge) at quality 0.85
4. Base64-encode JPEG → POST /api/meals/analyze
5. Server returns nutrition data + signed URL for display
```

---

## 3. Backend Architecture (Render)

### Express Server Setup

```
server/src/
├─ index.ts            # Express app initialization
├─ app.ts              # Security headers, CORS, JSON limit, route registration
├─ config.ts           # Environment variables (dotenv + Zod validation)
└─ middleware/
   ├─ auth.ts          # requireAuth — verifies Bearer JWT locally via Supabase
   │                   #   JWKS (jose), no per-request call to Supabase
   ├─ csrf.ts          # generateCsrfToken + validateCsrfToken (HMAC, timing-safe)
   └─ error.ts         # Global error handling
```

Every response carries hardening headers set in `app.ts`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` disabling camera/microphone/geolocation. CORS allows only `ALLOWED_ORIGINS` and the `Authorization` + `X-CSRF-Token` headers.

### API Endpoints

#### `POST /api/meals/analyze`

```
Input:  { imageBase64: string, mimeType: string }
Process:
  1. Validate request (Zod schema)
  2. Compute SHA-256 hash of image bytes
  3. Dedupe: same user + same image → return stored result (cached: true).
     Cached hits skip the rate limit and the Gemini call.
  4. Rate limit: ≤10 NEW analyses per user per UTC day → else 429
  5. Call Gemini 2.5 Flash with image → structured JSON
  6. Non-food guard: if Gemini returns an empty food array, return
     { isFood: false, message } — nothing is uploaded or written to the DB,
     and it does not count toward the daily limit
  7. Upload image to Supabase Storage; insert meal row to Postgres
  8. Return slim meal (id, createdAt, imageUrl, nutrition) + signed URL (1h TTL)
Output: { isFood: true, meal: Meal, cached: boolean }
      | { isFood: false, message: string }
```

#### `GET /api/auth/csrf`

```
Auth:   requireAuth (Bearer token)
Logic:  Return a stateless CSRF token = HMAC(accessToken, CSRF_SECRET).
        Tied to the access token, so it auto-expires with it and is never
        stored server-side. The client must re-fetch after every token refresh.
Output: { csrfToken: string }
```

#### `GET /api/meals/recent`

```
Logic:
  1. Fetch last 7 days of meals for logged-in user
  2. For each meal, generate fresh signed URL (1 hour TTL)
  3. Return array of meals with photo URLs + nutrition breakdown
Output: { meals: Meal[] }
```

#### `GET /api/meals/daily-totals?days=90`

```
Logic:
  1. Fetch meals older than 7 days (for this user), via meal_daily_totals view
  2. Aggregate by UTC day: meal_count + sum calories/protein/carbs/fat/fibre
  3. Return per-day totals (no photos, no individual items)
Output: { days: DailyTotal[] }   // each row includes mealCount
```

#### `GET /health`

```
Purpose: UptimeRobot ping target (keeps free dyno warm)
Output: { status: "ok", uptime: "..." }
```

### Services (Business Logic)

#### `meals.service.ts`

```
├─ analyzeMeal()         # Dedupe check + Gemini call + storage + DB insert
├─ getRecentMeals()      # DB query + signed URLs
├─ getDailyTotals()      # DB aggregation
└─ deleteMealImages()    # Removes image_path for meals >7 days old
```

#### `gemini.service.ts`

```
├─ analyzeMealPhoto()    # Sends base64 image to Gemini 2.5 Flash
│                         │ (vision model with structured JSON mode)
│                         └─ Returns: { food: [...], totals: {...} }
└─ Validates Gemini response format (Zod schema)
```

#### `storage.service.ts`

```
├─ uploadMealImage()     # Upload to private bucket, return storage path
├─ signUrl()             # Generate signed URL (1 hour expiry)
├─ deleteImages()        # Batch remove >7 day old images
└─ Uses Supabase Storage SDK (server key = write access)
```

### Jobs (Scheduled Tasks)

#### `cleanup.job.ts` (runs daily at 00:05 UTC)

```
1. Find all meals where created_at < 7 days ago AND image_path is not null
2. Delete from Supabase Storage
3. Set image_path to null in Postgres (nutrition data stays forever)
4. Scheduled with node-cron
```

---

## 4. Authentication Flow (Complete)

### Sign Up

```
Browser          Supabase           Backend
  │                │                   │
  ├─ email/pwd ───►│                   │
  │                ├─ create user      │
  │                ├─ send email       │
  │                ├─ return session ──┤
  │◄─ access_token ┤                   │
  │                │                   │
  (store in localStorage)
```

### API Request with Auth

```
Browser                      Backend                  Supabase
  │                            │                         │
  ├─ GET /api/meals/recent ────┤                         │
  │  Authorization: Bearer JWT  │                         │
  │                             ├─ verify JWT signature   │
  │                             │  against cached JWKS     │  JWKS fetched once,
  │                             │  (no network call)       │  refetched only on
  │                             ├─ user = payload.sub      │  key rotation
  │                             ├─ query user meals        │
  │◄─ { meals: [...] } ────────┤                          │
  │                             │                          │
```

### Token Lifecycle

```
Generated:  Supabase creates JWT on login
Stored:     Full session (incl. refresh token) in localStorage by the Supabase
            SDK; access token also mirrored to sessionStorage for API calls
Sent:       Every API request in Authorization header (+ X-CSRF-Token on writes)
Verified:   Backend verifies the JWT signature locally against Supabase's JWKS
            (jose, cached, auto-refetched on key rotation) — no network round-trip
            to Supabase per request, checking issuer + "authenticated" audience
Expires:    Default 1 hour; auto-refreshed by the SDK and by api.ts on a 401.
            Refresh token keeps the session alive ~30 days
Logout:     supabase.auth.signOut() → clears session + sessionStorage tokens
```

---

## 5. Data Model

### Postgres Schema

#### `users` (managed by Supabase Auth)

```sql
id              uuid (primary key)
email           text (unique)
encrypted_password (hashed)
created_at      timestamptz
```

#### `meals` (custom table)

```sql
id              uuid (primary key) — default: gen_random_uuid()
user_id         uuid (FK → auth.users) — cascade delete
image_hash      text — SHA-256 of image bytes
image_path      text — storage path (set to null after 7 days)
nutrition       jsonb — { status, food: [...], total: {...} }
created_at      timestamptz — default: now()

unique (user_id, image_hash)  — dedupe per user
```

### Data Model (TypeScript)

```typescript
// Client-facing shape. user_id / image_hash / image_path stay server-side and
// are never sent to the browser — the API maps each row down to this.
interface Meal {
  id: string;
  createdAt: string;
  imageUrl: string | null; // short-lived signed URL; null once the image expires
  nutrition: {
    status: string; // one-sentence meal description (or reason if not food)
    food: Array<{
      name: string;
      quantity: string; // estimated portion, e.g. "150 g" or "1 cup"
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fibre: number;
    }>;
    total: { calories: number; protein: number; carbs: number; fat: number; fibre: number };
  };
}

interface DailyTotal {
  date: string; // YYYY-MM-DD UTC
  mealCount: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}
```

---

## 6. Gemini Integration

### Vision Analysis

```
Input:  base64 JPEG image (max ~1.5MB after downscaling)
Model:  Google Gemini 2.5 Flash, called with a systemInstruction +
        responseMimeType: "application/json" + a strict responseSchema
        (so the model is forced to return the exact shape, not free text)
Asks per item: name, quantity (portion, e.g. "150 g"), calories, protein,
               carbs, fat, fibre — plus a one-sentence `status`.
Non-food rule (in the system prompt): if the image has no food, return an
               empty food array and put the reason in `status`.

Output:
  {
    "status": "A plate of grilled chicken with brown rice.",
    "food": [
      { "name": "grilled chicken", "quantity": "120 g", "calories": 165, ... },
      { "name": "brown rice",      "quantity": "1 cup",  "calories": 216, ... }
    ]
  }
```

### Error Handling

- Totals are always computed server-side from the items (never trust the model's math, and no `total` field is requested from Gemini)
- Empty `food` array → treated as "not a food photo" by the controller (see analyze flow), not an error
- Gemini failures are mapped to clean HTTP codes: quota/rate → 429, bad image → 400, auth/key problems → 500 ("Server misconfigured"), upstream 5xx → 502; unparseable/empty output → 502

---

## 7. Image Management

### Lifecycle

```
Day 0 (upload):
  ├─ Image hash computed
  ├─ Checked against user's history
  ├─ If new: upload to Supabase Storage /meal-images/<uuid>
  ├─ Store path in Postgres (image_path)
  └─ Return signed URL (TTL 1 hour)

Day 1-6:
  ├─ /api/meals/recent returns signed URLs for display
  └─ Daily cron refreshes URLs every 24h

Day 7+ (after 00:05 UTC):
  ├─ Daily cron identifies meals >7 days old
  ├─ Deletes image from Storage
  ├─ Sets image_path = null in Postgres
  └─ Nutrition data stays forever (no deletion)
```

### Storage Path Structure

```
Bucket:  meal-images (private)
Path:    <user_id>/<meal_id>.jpg
Access:  Via signed URLs only (expires 1 hour)
         No public access
```

---

## 8. Deployment Architecture

### Frontend (Cloudflare Workers)

```
Git push → GitHub
           ↓
        pnpm build              (compiles React + TanStack Start)
           ↓
        pnpm wrangler deploy    (uploads to Cloudflare)
           ↓
    https://app.calorie-cam.workers.dev

Environment:
  ├─ VITE_SUPABASE_URL         (public)
  ├─ VITE_SUPABASE_PUBLISHABLE_KEY (public)
  └─ VITE_API_URL              (backend URL — baked at build time)
```

### Backend (Render)

```
Git push → GitHub
           ↓
     Render detects push (auto-deploy on)
           ↓
     Root Directory: server
     Build:  npm install && npm run build
     Start:  npm start (runs dist/index.js)
           ↓
    https://calorie-cam-metrics.onrender.com

Environment:
  ├─ GEMINI_API_KEY
  ├─ SUPABASE_URL
  ├─ SUPABASE_SERVICE_ROLE_KEY  (secret — never public)
  ├─ SUPABASE_STORAGE_BUCKET
  ├─ CSRF_SECRET                (secret — openssl rand -hex 32)
  ├─ ALLOWED_ORIGINS            (Cloudflare domain)
  └─ PORT                        (3001)

Keep-Alive:
  ├─ UptimeRobot pings /health every 5 minutes
  └─ Prevents free dyno from sleeping
  └─ Keeps daily cleanup cron alive
```

### Database (Supabase Postgres)

```
Managed cloud Postgres
├─ Auth tables (Supabase managed)
├─ meals table (custom, RLS enabled)
├─ Storage bucket (meal-images, private)
└─ Row-level security ensures users only see their meals
```

---

## 9. Security Model

### Authentication

- ✅ Supabase Auth handles password hashing, JWT generation
- ✅ Bearer token sent on every API request
- ✅ Backend verifies the JWT signature + issuer + audience locally against Supabase's JWKS (no per-request round-trip; see §12 for the trade-off vs `getUser`)
- ✅ Tokens expire naturally (~1 hour); refresh keeps sessions alive ~30 days

### Authorization

- ✅ RLS on meals table — users can only query their own rows
- ✅ All inserts go through backend (service role key)
- ✅ Backend attaches user ID from validated token
- ✅ No client-side user ID spoofing possible

### Data Privacy

- ✅ Service role key lives only in Render (never in frontend)
- ✅ Gemini API key in backend env only
- ✅ Images stored in private bucket — signed URLs only, no public access
- ✅ Image cleanup removes storage after 7 days (nutrition retained)

### API Security

- ✅ CORS: only Cloudflare domain in ALLOWED_ORIGINS; allows `Authorization` + `X-CSRF-Token` headers only
- ✅ All routes require valid Bearer token
- ✅ CSRF: state-changing requests must carry a `X-CSRF-Token` = HMAC(accessToken, CSRF_SECRET), compared timing-safely (stateless, tied to the user's token)
- ✅ Hardening headers on every response (nosniff, frame-deny, referrer-policy, permissions-policy)
- ✅ Rate limit: 10 new Gemini analyses per user per day (cached + non-food don't count)
- ✅ Input validation with Zod (image format, size, schema)
- ✅ Error messages don't leak internal details

---

## 10. Performance & Scaling

### Bottlenecks & Mitigations

| Component            | Issue                   | Mitigation                                            |
| -------------------- | ----------------------- | ----------------------------------------------------- |
| **Gemini API**       | ~2-3s per call + cost   | Dedup (instant cache hits) + 10 new analyses/user/day |
| **Auth check**       | Round-trip per request  | Local JWKS verify (jose), cached — no call to Supabase |
| **Storage**          | Upload latency          | Parallel upload after Gemini response                 |
| **Postgres**         | User query scale        | Indexes on (user_id, created_at)                      |
| **Signed URLs**      | TTL refresh             | Minted server-side on every fetch                     |
| **Free Render tier** | Cold starts             | UptimeRobot pings keep dyno warm                      |

### Cost Estimate

- **Gemini**: ~500-1500 tokens per image + ~300 tokens output = <$0.01/photo
- **Supabase**: Generous free tier covers 100+ active users
- **Cloudflare**: Free tier includes Workers + unlimited requests
- **Render**: Free tier ($0) with UptimeRobot keep-alive

---

## 11. Tech Stack Summary

| Layer         | Technology              | Purpose                  |
| ------------- | ----------------------- | ------------------------ |
| **Frontend**  | React 19                | UI framework             |
|               | TanStack Start          | Full-stack SSR           |
|               | TanStack Router         | File-based routing       |
|               | Vite                    | Build tool + dev server  |
|               | Tailwind CSS v4         | Styling                  |
|               | TypeScript              | Type safety              |
| **Backend**   | Node.js                 | Runtime                  |
|               | Express                 | HTTP server              |
|               | TypeScript              | Type safety              |
|               | Zod                     | Schema validation        |
| **AI**        | Google Gemini 2.5 Flash | Vision + structured JSON |
| **Auth**      | Supabase Auth           | Email/password + JWT     |
|               | jose                    | Local JWT/JWKS verify    |
| **Database**  | Supabase Postgres       | Relational data + RLS    |
| **Storage**   | Supabase Storage        | Private image bucket     |
| **Hosting**   | Cloudflare Workers      | Frontend SSR             |
|               | Render                  | Backend API              |
| **Utilities** | node-cron               | Scheduled cleanup        |
|               | cors                    | Cross-origin requests    |

---

## 12. Key Design Decisions

### Why Supabase Auth instead of custom?

- Pre-built email verification, password reset, multi-device sessions
- JWT tokens work seamlessly with bearer pattern
- Offloads security burden to a specialized provider

### Why Gemini 2.5 Flash?

- Vision + structured JSON mode (no hallucination on nutrition data)
- Fast inference (~2-3 seconds)
- Cost-effective (~<$0.01 per meal)

### Why local JWKS verification instead of calling `getUser()`?

- Earlier versions called `supabase.auth.getUser(token)` on every request — a network round-trip to Supabase that adds latency and a hard dependency on Supabase being reachable for *every* API call
- `jose` verifies the JWT signature locally against Supabase's published JWKS, which it fetches once and caches (auto-refetching only on key rotation)
- Trade-off accepted: a token stays valid until it expires (~1 h) even if revoked server-side — fine for this app, and the short lifetime bounds the window

### Why a stateless HMAC CSRF token?

- Bearer-token APIs are mostly CSRF-resistant, but the defence-in-depth `X-CSRF-Token` adds protection cheaply
- HMAC(accessToken, CSRF_SECRET) needs no server-side store and auto-expires with the access token — no session table, no cleanup

### Why reject non-food images instead of storing them?

- Saves a storage write + DB row + a slot against the daily rate limit
- The user gets an immediate, descriptive reason rather than a meaningless 0-calorie "meal" in their history

### Why image deduplication by hash?

- Users often re-upload same meal (avoids redundant Gemini calls)
- Per-user dedupe prevents one user's upload helping another
- SHA-256 collision risk negligible at this scale

### Why 7-day image retention?

- Users can review recent photos in history
- Storage costs minimal for reasonable user volume
- Older meals have aggregate totals — individual photos not needed

---

## 13. Future Enhancements

1. **Social features**: Share meal photos / macro summaries
2. **Goals tracking**: Daily calorie/macro targets with progress visualization
3. **Export**: Download meal history as CSV/PDF
4. **Offline**: Service worker caching for offline access
5. **Mobile app**: Native iOS/Android with expo or React Native
6. **Advanced filters**: Search by date, food type, macro ranges
7. **Batch analysis**: Upload multiple photos in one go
8. **Alternative AI models**: Fallback providers (Claude Vision, etc.)
