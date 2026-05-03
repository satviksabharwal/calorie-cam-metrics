import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const WEBHOOK_URL = "https://satviksabharwal.app.n8n.cloud/webhook-test/meal-ai";

const InputSchema = z.object({
  imageBase64: z.string().min(100).max(15_000_000),
  mimeType: z.string().min(3).max(50),
  filename: z.string().min(1).max(200).default("meal.jpg"),
});

const FoodItemSchema = z.object({
  name: z.string(),
  quantity: z.string().optional().default(""),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

const TotalSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const NutritionResultSchema = z.object({
  status: z.string().optional(),
  food: z.array(FoodItemSchema),
  total: TotalSchema,
});

export type NutritionResult = z.infer<typeof NutritionResultSchema>;

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function computeTotals(food: z.infer<typeof FoodItemSchema>[]) {
  return food.reduce(
    (acc, f) => ({
      calories: acc.calories + (f.calories || 0),
      protein: acc.protein + (f.protein || 0),
      carbs: acc.carbs + (f.carbs || 0),
      fat: acc.fat + (f.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export const analyzeMeal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const bytes = base64ToUint8Array(data.imageBase64);
    const blob = new Blob([bytes], { type: data.mimeType });

    const form = new FormData();
    form.append("data", blob, data.filename);

    const res = await fetch(WEBHOOK_URL, { method: "POST", body: form });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Webhook error [${res.status}]: ${text.slice(0, 300)}`);
    }

    const raw = await res.json();

    // Webhook returns: [{ output: { status, food, total } }]
    // Be tolerant of shape variations.
    let payload: unknown = raw;
    if (Array.isArray(payload)) payload = payload[0];
    if (payload && typeof payload === "object" && "output" in payload) {
      payload = (payload as { output: unknown }).output;
    }

    const parsed = NutritionResultSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(
        `Unexpected webhook response: ${JSON.stringify(raw).slice(0, 300)}`
      );
    }

    // Recompute totals if missing/zero to be safe.
    const total =
      parsed.data.total.calories > 0
        ? parsed.data.total
        : computeTotals(parsed.data.food);

    return { ...parsed.data, total };
  });