import { GoogleGenAI, Type } from "@google/genai";
import { computeTotals, type AnalyzeInput, type NutritionResult } from "../schemas/nutrition.js";
import { AppError } from "../middleware/error.js";
import { config } from "../config.js";

const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

const SYSTEM_PROMPT = `You are a nutrition estimation engine for a meal-photo app.
Given one photo of food, identify each distinct food item and estimate, per item:
a realistic portion size (quantity, e.g. "150 g" or "1 cup"), calories (kcal),
and protein, carbs, fat and fibre in grams. Base estimates on visible portion
sizes relative to plates, bowls and utensils. Be realistic, not conservative.
- status: one short sentence describing the meal.
- If the image contains no food, return an empty food array and explain why in status.
- Use 0 (not omission) when a nutrient is negligible.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    status: { type: Type.STRING },
    food: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name:     { type: Type.STRING },
          quantity: { type: Type.STRING },
          calories: { type: Type.NUMBER },
          protein:  { type: Type.NUMBER },
          carbs:    { type: Type.NUMBER },
          fat:      { type: Type.NUMBER },
          fibre:    { type: Type.NUMBER },
        },
        required: ["name", "quantity", "calories", "protein", "carbs", "fat", "fibre"],
      },
    },
  },
  required: ["status", "food"],
};

export async function analyzeWithGemini(
  input: Pick<AnalyzeInput, "imageBase64" | "mimeType">,
): Promise<NutritionResult> {
  let result;
  try {
    result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema,
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.imageBase64,
              },
            },
            { text: "Analyze this meal photo and estimate the nutrition for each visible food item." },
          ],
        },
      ],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate")) {
      throw new AppError(429, "AI is rate-limited, try again shortly");
    }
    if (msg.includes("400")) {
      throw new AppError(400, "Image could not be processed");
    }
    if (msg.includes("403") || msg.toLowerCase().includes("api key")) {
      console.error("Gemini auth failure — check GEMINI_API_KEY");
      throw new AppError(500, "Server misconfigured");
    }
    if (msg.includes("503") || msg.includes("500") || msg.toLowerCase().includes("unavailable")) {
      throw new AppError(502, "AI service unavailable, try again");
    }
    throw err;
  }

  const text = result.text;
  if (!text) {
    throw new AppError(502, "Model returned empty output");
  }

  let parsed: { status: string; food: NutritionResult["food"] };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new AppError(502, "Model returned unparseable output");
  }

  if (!Array.isArray(parsed.food)) {
    throw new AppError(502, "Model returned invalid structure");
  }

  return { status: parsed.status ?? "", food: parsed.food, total: computeTotals(parsed.food) };
}
