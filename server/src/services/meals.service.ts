import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import type { NutritionResult } from "../schemas/nutrition.js";

export type MealRow = {
  id: string;
  user_id: string;
  image_hash: string;
  image_path: string | null;
  nutrition: NutritionResult;
  created_at: string;
};

export async function findMealByHash(userId: string, imageHash: string): Promise<MealRow | null> {
  const { data, error } = await supabaseAdmin
    .from("meals")
    .select("*")
    .eq("user_id", userId)
    .eq("image_hash", imageHash)
    .maybeSingle();
  if (error) throw new AppError(500, `DB lookup failed: ${error.message}`);
  return data as MealRow | null;
}

export async function insertMeal(meal: {
  user_id: string;
  image_hash: string;
  image_path: string | null;
  nutrition: NutritionResult;
}): Promise<MealRow> {
  const { data, error } = await supabaseAdmin.from("meals").insert(meal).select().single();
  if (error) {
    // Unique violation (double-submit race): return the existing row.
    if (error.code === "23505") {
      const existing = await findMealByHash(meal.user_id, meal.image_hash);
      if (existing) return existing;
    }
    throw new AppError(500, `DB insert failed: ${error.message}`);
  }
  return data as MealRow;
}

export async function getRecentMeals(userId: string): Promise<MealRow[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("meals")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) throw new AppError(500, `DB query failed: ${error.message}`);
  return (data ?? []) as MealRow[];
}

export type DailyTotal = {
  day: string;
  meal_count: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
};

export async function getDailyTotals(userId: string, days: number): Promise<DailyTotal[]> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const oldest = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("meal_daily_totals")
    .select("day, meal_count, calories, protein, carbs, fat, fibre")
    .eq("user_id", userId)
    .lt("day", cutoff)
    .gte("day", oldest)
    .order("day", { ascending: false });
  if (error) throw new AppError(500, `DB query failed: ${error.message}`);
  return (data ?? []) as DailyTotal[];
}

export async function getExpiredImages(
  limit: number,
): Promise<Pick<MealRow, "id" | "image_path">[]> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("meals")
    .select("id, image_path")
    .not("image_path", "is", null)
    .lt("created_at", cutoff)
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Pick<MealRow, "id" | "image_path">[];
}

export async function clearImagePaths(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin.from("meals").update({ image_path: null }).in("id", ids);
  if (error) throw error;
}
