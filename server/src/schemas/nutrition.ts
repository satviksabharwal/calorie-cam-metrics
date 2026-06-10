import { z } from "zod";

// Model-facing output schema: every field required (strict structured outputs
// reject optional/default fields). `total` is computed server-side instead of
// asking the model for it, so totals always equal the sum of items.
export const FoodItemSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fibre: z.number(),
});

export const ClaudeOutputSchema = z.object({
  status: z.string(),
  food: z.array(FoodItemSchema),
});

export type FoodItem = z.infer<typeof FoodItemSchema>;
export type ClaudeOutput = z.infer<typeof ClaudeOutputSchema>;

export type NutritionTotal = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
};

export type NutritionResult = {
  status: string;
  food: FoodItem[];
  total: NutritionTotal;
};

export function computeTotals(food: FoodItem[]): NutritionTotal {
  return food.reduce(
    (acc, f) => ({
      calories: acc.calories + (f.calories || 0),
      protein: acc.protein + (f.protein || 0),
      carbs: acc.carbs + (f.carbs || 0),
      fat: acc.fat + (f.fat || 0),
      fibre: acc.fibre + (f.fibre || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
  );
}

export const AnalyzeInputSchema = z.object({
  imageBase64: z.string().min(100).max(15_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  filename: z.string().min(1).max(200).default("meal.jpg"),
});

export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;
