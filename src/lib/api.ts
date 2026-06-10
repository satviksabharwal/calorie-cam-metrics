import { supabase } from "@/lib/supabase";
import type { DailyTotal, Meal } from "@/lib/nutrition";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
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
