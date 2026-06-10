-- CalorieCam v2 schema. Run in Supabase SQL editor of the NEW project.
-- Also create a PRIVATE storage bucket named "meal-images" (Storage → New bucket,
-- public = OFF) and enable the Email auth provider (Authentication → Providers).
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_hash text not null,
  -- sha256 hex of original image bytes
  image_path text,
  -- storage object path; nulled by cleanup job
  nutrition jsonb not null,
  -- { status, food: [...], total: {...} }
  created_at timestamptz not null default now(),
  unique (user_id, image_hash) -- dedupe guarantee + double-submit race safety
);
create index meals_user_created_idx on public.meals (user_id, created_at desc);
-- cleanup-job scan
create index meals_image_expiry_idx on public.meals (created_at)
where image_path is not null;
-- Express uses the service-role key (bypasses RLS); enable + lock down anyway
-- so the publishable key can never read/write meals directly.
alter table public.meals enable row level security;
create policy "users read own meals" on public.meals for
select using (
    (
      select auth.uid()
    ) = user_id
  );
-- no insert/update/delete policies: writes happen only via service role.
-- Daily aggregates: a view is enough — rows are kept forever, aggregation is
-- cheap at this scale. Days bucketed in UTC.
create view public.meal_daily_totals with (security_invoker = on) as
select user_id,
  (created_at at time zone 'utc')::date as day,
  count(*)::int as meal_count,
  sum((nutrition->'total'->>'calories')::numeric) as calories,
  sum((nutrition->'total'->>'protein')::numeric) as protein,
  sum((nutrition->'total'->>'carbs')::numeric) as carbs,
  sum((nutrition->'total'->>'fat')::numeric) as fat,
  coalesce(sum((nutrition->'total'->>'fibre')::numeric), 0) as fibre
from public.meals
group by 1,
  2;