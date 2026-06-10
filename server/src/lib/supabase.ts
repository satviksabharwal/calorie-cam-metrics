import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

// Service-role client: bypasses RLS. Server-side only — never expose this key.
export const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
