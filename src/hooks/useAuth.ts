import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Session lives in browser localStorage, so auth state is client-only —
// guard in components (RequireAuth), not in route beforeLoad (SSR).
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading, user: session?.user ?? null };
}

export async function signOut() {
  // Clear stored access token
  sessionStorage.removeItem("access_token");

  // Clear Supabase session
  await supabase.auth.signOut();

  // Clear HTTP-only cookie via backend
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
  try {
    await fetch(`${apiUrl}/api/auth/clear-session`, {
      method: "POST",
      credentials: "include",
    });
  } catch (err) {
    console.error("Failed to clear session cookie:", err);
  }
}
