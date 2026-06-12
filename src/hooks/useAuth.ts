import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { fetchAndStoreCsrfToken } from "@/lib/api";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) {
        sessionStorage.setItem("access_token", data.session.access_token);
        // Fire-and-forget: CSRF token needed before any mutation, non-blocking here.
        void fetchAndStoreCsrfToken();
      }
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s?.access_token) {
        sessionStorage.setItem("access_token", s.access_token);
        // Access token changed (e.g. Supabase auto-refresh) — CSRF token must follow.
        void fetchAndStoreCsrfToken();
      } else {
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("csrf_token");
      }
      setSession(s);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading, user: session?.user ?? null };
}

export async function signOut() {
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("csrf_token");
  await supabase.auth.signOut();
}
