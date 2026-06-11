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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() || "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...init?.headers,
  };

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
    credentials: "include", // ✅ Send HTTP-only auth + CSRF cookies
    headers,
  });

  if (!res.ok) {
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
