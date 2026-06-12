import { supabase } from "@/lib/supabase";
import type { DailyTotal, Meal } from "@/lib/nutrition";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function getCsrfToken(): string | null {
  // Extract CSRF token from cookies
  const name = "csrf-token=";
  const decodedCookie = decodeURIComponent(document.cookie);
  const cookieArray = decodedCookie.split(";");
  for (let cookie of cookieArray) {
    cookie = cookie.trim();
    if (cookie.indexOf(name) === 0) {
      return cookie.substring(name.length);
    }
  }
  return null;
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // Prevent multiple concurrent refresh attempts
  if (isRefreshing) {
    return refreshPromise || Promise.resolve(false);
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include", // Send refresh token cookie
      });

      if (res.ok) {
        const data = (await res.json()) as { accessToken?: string };
        // Store new access token if returned
        if (data.accessToken) {
          sessionStorage.setItem("access_token", data.accessToken);
        }
        return true;
      }
      // If refresh fails, user needs to log in again
      sessionStorage.removeItem("access_token");
      await supabase.auth.signOut();
      return false;
    } catch {
      sessionStorage.removeItem("access_token");
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(path: string, init?: RequestInit, retryCount = 0): Promise<T> {
  const method = init?.method?.toUpperCase() || "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...init?.headers,
  };

  // Add Authorization header with stored access token (for cross-origin requests)
  const accessToken = sessionStorage.getItem("access_token");
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  // Add CSRF token to state-changing requests (POST, PUT, DELETE, PATCH)
  const needsCsrf = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
  if (needsCsrf) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include", // ✅ Send HTTP-only refresh token + CSRF cookies
    headers,
  });

  if (!res.ok) {
    // Token expired — try to refresh and retry once
    if (res.status === 401 && retryCount === 0) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry the original request with the new token
        return request<T>(path, init, retryCount + 1);
      }
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
