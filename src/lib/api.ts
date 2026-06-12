import { supabase } from "@/lib/supabase";
import type { DailyTotal, Meal } from "@/lib/nutrition";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// Fetch a CSRF token tied to the current access token and cache it.
// Must be called after login and after every token refresh (CSRF token is
// derived from the access token, so it changes when the token changes).
export async function fetchAndStoreCsrfToken(): Promise<void> {
  try {
    const { csrfToken } = await request<{ csrfToken: string }>("/api/auth/csrf");
    sessionStorage.setItem("csrf_token", csrfToken);
  } catch {
    // Non-fatal: next mutation will fail CSRF validation and surface the error then.
  }
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing) return refreshPromise ?? Promise.resolve(false);

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("csrf_token");
        return false;
      }
      sessionStorage.setItem("access_token", data.session.access_token);
      // CSRF token is derived from the access token — must refresh it too.
      await fetchAndStoreCsrfToken();
      return true;
    } catch {
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("csrf_token");
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(path: string, init?: RequestInit, retryCount = 0): Promise<T> {
  const method = init?.method?.toUpperCase() ?? "GET";
  const accessToken = sessionStorage.getItem("access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...init?.headers,
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  // Attach the CSRF token on all state-changing requests.
  const needsCsrf = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
  if (needsCsrf) {
    const csrfToken = sessionStorage.getItem("csrf_token");
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    if (res.status === 401 && retryCount === 0) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return request<T>(path, init, retryCount + 1);
    }

    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body — keep the status message
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export function analyzeMeal(input: {
  imageBase64: string;
  mimeType: string;
  filename?: string;
}): Promise<{ meal: Meal; cached: boolean }> {
  return request("/api/meals/analyze", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRecentMeals(): Promise<{ meals: Meal[] }> {
  return request("/api/meals/recent");
}

export function getDailyTotals(days = 90): Promise<{ days: DailyTotal[] }> {
  return request(`/api/meals/daily-totals?days=${days}`);
}
