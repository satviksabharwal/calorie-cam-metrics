import { supabase } from "@/lib/supabase";
import type { DailyTotal, Meal } from "@/lib/nutrition";

const LOCAL_API_URL = "http://localhost:3001";
const PROD_API_URL = "https://calorie-cam-metrics.onrender.com";

function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

// Resolve the API base URL from where the app is actually served, so localhost
// always talks to the local backend and any deployed host talks to the prod
// backend — without depending on VITE_API_URL being set correctly per env.
// VITE_API_URL still overrides (e.g. staging), but only when it matches the
// current environment, so a stale/wrong value can never cause cross-origin CORS
// failures (dev calling prod, or prod calling localhost).
function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  const servedLocally =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  if (servedLocally) {
    return configured && isLocalUrl(configured) ? configured : LOCAL_API_URL;
  }

  return configured && !isLocalUrl(configured) ? configured : PROD_API_URL;
}

const API_URL = resolveApiUrl();

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
  // Headers normalizes any HeadersInit (object, array, or Headers) the caller
  // passes; default to JSON unless the caller already set a Content-Type.
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  // Attach the CSRF token on all state-changing requests.
  const needsCsrf = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
  if (needsCsrf) {
    const csrfToken = sessionStorage.getItem("csrf_token");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
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

// Non-food images aren't analyzed or stored — the server returns isFood: false
// with a descriptive message instead of a meal.
export type AnalyzeResponse =
  | { isFood: true; meal: Meal; cached: boolean }
  | { isFood: false; message: string };

export function analyzeMeal(input: {
  imageBase64: string;
  mimeType: string;
  filename?: string;
}): Promise<AnalyzeResponse> {
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
