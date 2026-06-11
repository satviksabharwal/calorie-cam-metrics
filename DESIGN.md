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
├─ index.tsx           # Analyze page — photo upload/camera, show results
├─ login.tsx           # Auth page — sign up / sign in
└─ history.tsx         # Meal history — last 7 days (detailed), older days (totals only)
```

### Key Components

```
src/components/
├─ RequireAuth.tsx     # Guard: redirects to /login if not authenticated
├─ ResultCard.tsx      # Displays single meal analysis (food items + totals)
├─ MacroBar.tsx        # Visual breakdown of calories/protein/carbs/fat/fibre
└─ PhotoUpload.tsx     # Camera/file picker, HEIC→JPEG conversion, downscaling
```

### Authentication Flow (Frontend)

```
1. User enters email/password on /login
2. Supabase.auth.signUp() or .signIn() → returns session with access_token
3. Session stored in browser localStorage (Supabase SDK handles this)
4. useAuth() hook watches localStorage, sets React state
5. RequireAuth component checks useAuth() — if null, redirects to /login
```

### API Integration (Frontend)

```
api.ts (fetch wrapper)
├─ Gets session from Supabase SDK → access_token
├─ Attaches: Authorization: Bearer <token>
├─ All requests validated on backend via requireAuth middleware
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
├─ app.ts              # Middleware, route registration
├─ config.ts           # Environment variables (dotenv + Zod validation)
└─ middleware/
   ├─ auth.ts          # requireAuth — validates Bearer JWT with Supabase
   └─ error.ts         # Global error handling
```

### API Endpoints

#### `POST /api/meals/analyze`

```
Input:  { imageBase64: string, mimeType: string }
Process:
  1. Validate request (Zod schema)
  2. Compute SHA-256 hash of image bytes
  3. Check if user already analyzed this exact image (dedupe)
     → if yes: return cached result with { cached: true }
     → if no: continue
  4. Call Gemini 2.5 Flash with image → structured JSON
  5. Parse response, compute totals
  6. Upload image to Supabase Storage
  7. Insert meal row to Postgres (+ image_path, image_hash, nutrition JSON)
  8. Return meal + signed URL (1 hour TTL)
Output: { meal: Meal, cached: boolean }
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
  1. Fetch meals older than 7 days (for this user)
  2. Aggregate by UTC day: sum calories/protein/carbs/fat/fibre
  3. Return per-day totals (no photos, no individual items)
Output: { days: DailyTotal[] }
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
Browser                      Backend              Supabase
  │                            │                     │
  ├─ GET /api/meals/recent ────┤                     │
  │  Authorization: Bearer JWT  │                     │
  │                             ├─ extract token    │
  │                             ├─ verify token ────┤
  │                             │◄─ valid: { user } │
  │                             ├─ query user meals │
  │◄─ { meals: [...] } ────────┤                    │
  │                             │                    │
```

### Token Lifecycle

```
Generated:  Supabase creates JWT on login
Stored:     Browser localStorage (Supabase SDK)
Sent:       Every API request in Authorization header
Verified:   Backend calls supabaseAdmin.auth.getUser(token)
Expires:    Default 1 hour (refreshed transparently by Supabase SDK)
Logout:     supabase.auth.signOut() → clears session + localStorage
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
interface Meal {
  id: string;
  userId: string;
  imageHash: string;
  imagePath: string | null;
  nutrition: {
    status: "success" | "error";
    food?: Array<{
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fibre: number;
    }>;
    total: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fibre: number;
    };
  };
  createdAt: string;
  imageUrl?: string; // signed URL (generated on fetch)
}

interface DailyTotal {
  date: string; // YYYY-MM-DD UTC
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
Model:  Google Gemini 2.5 Flash (vision + JSON mode)
Prompt:
  "Analyze this meal photo. List each food item with estimated:
   - name (e.g., 'grilled chicken breast')
   - calories
   - protein (g)
   - carbs (g)
   - fat (g)
   - fibre (g)

   Return ONLY valid JSON: { food: [...], total: {...} }"

Output:
  {
    "food": [
      { "name": "grilled chicken", "calories": 165, "protein": 31, ... },
      { "name": "brown rice", "calories": 216, "protein": 5, ... }
    ],
    "total": { "calories": 381, "protein": 36, ... }
  }
```

### Error Handling

- If image can't be parsed → return `{ status: "error", error: "..." }`
- If Gemini fails → return cached result or error to user
- Totals always computed server-side (validation, never trust client)

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
- ✅ Backend validates token with Supabase (not local JWT parsing)
- ✅ Tokens expire naturally (~1 hour)

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

- ✅ CORS: only Cloudflare domain in ALLOWED_ORIGINS
- ✅ All routes require valid Bearer token
- ✅ Input validation with Zod (image format, size, schema)
- ✅ Error messages don't leak internal details

---

## 10. Performance & Scaling

### Bottlenecks & Mitigations

| Component            | Issue            | Mitigation                                      |
| -------------------- | ---------------- | ----------------------------------------------- |
| **Gemini API**       | ~2-3s per call   | Image deduplication (cache hits return instant) |
| **Storage**          | Upload latency   | Parallel upload after Gemini response           |
| **Postgres**         | User query scale | Indexes on (user_id, created_at)                |
| **Signed URLs**      | TTL refresh      | Minted server-side on every fetch               |
| **Free Render tier** | Cold starts      | UptimeRobot pings keep dyno warm                |

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

### Why server-side token validation instead of local JWT parsing?

- Tokens can be revoked server-side without waiting for expiry
- No need to manage Supabase's JWKS locally
- Simple `getUser()` call validates + retrieves user in one trip

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
