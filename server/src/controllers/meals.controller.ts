import type { Request, Response } from "express";
import { AnalyzeInputSchema } from "../schemas/nutrition.js";
import { sha256Hex } from "../lib/hash.js";
import { analyzeWithGemini } from "../services/gemini.service.js";
import {
  countMealsToday,
  findMealByHash,
  getDailyTotals,
  getRecentMeals,
  insertMeal,
  type MealRow,
} from "../services/meals.service.js";
import { signImageUrl, signImageUrls, uploadMealImage } from "../services/storage.service.js";

async function toMealResponse(row: MealRow) {
  return {
    id: row.id,
    createdAt: row.created_at,
    imageUrl: await signImageUrl(row.image_path),
    nutrition: row.nutrition,
  };
}

export async function analyzeMeal(req: Request, res: Response) {
  const parsed = AnalyzeInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const { imageBase64, mimeType } = parsed.data;
  const userId = req.user!.id;

  const buffer = Buffer.from(imageBase64, "base64");
  const imageHash = sha256Hex(buffer);

  // Dedupe: same user + same image bytes → stored result, no Gemini call.
  // A stored meal is always food (non-food images are never persisted).
  const existing = await findMealByHash(userId, imageHash);
  if (existing) {
    return res.json({ isFood: true, meal: await toMealResponse(existing), cached: true });
  }

  // Rate limit: 10 new Gemini analyses per user per day (cached hits don't count).
  const mealsToday = await countMealsToday(userId);
  if (mealsToday >= 10) {
    return res
      .status(429)
      .json({ error: "Daily limit of 10 meal analyses reached. Try again tomorrow." });
  }

  // Gemini first — a model failure must not leave an orphaned storage object.
  const nutrition = await analyzeWithGemini({ imageBase64, mimeType });

  // Non-food image: the model returns an empty food array with a reason in
  // `status`. Don't persist anything (no storage upload, no DB row) — just
  // tell the client why. This also means it never counts toward the daily limit.
  if (nutrition.food.length === 0) {
    return res.json({
      isFood: false,
      message: nutrition.status || "This doesn't look like a food photo.",
    });
  }

  const imagePath = await uploadMealImage(userId, imageHash, buffer, mimeType);

  const row = await insertMeal({
    user_id: userId,
    image_hash: imageHash,
    image_path: imagePath,
    nutrition,
  });

  return res.json({ isFood: true, meal: await toMealResponse(row), cached: false });
}

export async function recentMeals(req: Request, res: Response) {
  const rows = await getRecentMeals(req.user!.id);
  const urls = await signImageUrls(rows.map((r) => r.image_path));
  const meals = rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    imageUrl: r.image_path ? (urls.get(r.image_path) ?? null) : null,
    nutrition: r.nutrition,
  }));
  return res.json({ meals });
}

export async function dailyTotals(req: Request, res: Response) {
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? "90"), 10) || 90, 1), 365);
  const rows = await getDailyTotals(req.user!.id, days);
  return res.json({
    days: rows.map((r) => ({
      date: r.day,
      mealCount: r.meal_count,
      calories: Number(r.calories),
      protein: Number(r.protein),
      carbs: Number(r.carbs),
      fat: Number(r.fat),
      fibre: Number(r.fibre),
    })),
  });
}
