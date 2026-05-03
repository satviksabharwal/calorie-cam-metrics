import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  imageBase64: z.string().min(100).max(15_000_000),
  mimeType: z.string().min(3).max(50),
});

const NutritionSchema = z.object({
  dish: z.string(),
  description: z.string(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
  items: z.array(
    z.object({
      name: z.string(),
      calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    })
  ),
});

export type NutritionResult = z.infer<typeof NutritionSchema>;

export const analyzeMeal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const dataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a precise nutrition analyst. Given a meal photo, identify the dish and estimate its macronutrients. Always respond using the provided tool. Estimate realistic portion sizes from visual cues. If unsure, lower confidence.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this meal and return its nutrition." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_nutrition",
              description: "Report the estimated nutrition for the meal in the image.",
              parameters: {
                type: "object",
                properties: {
                  dish: { type: "string", description: "Name of the dish" },
                  description: { type: "string", description: "One sentence description" },
                  calories: { type: "number" },
                  protein_g: { type: "number" },
                  carbs_g: { type: "number" },
                  fat_g: { type: "number" },
                  confidence: { type: "string", enum: ["low", "medium", "high"] },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        calories: { type: "number" },
                        protein_g: { type: "number" },
                        carbs_g: { type: "number" },
                        fat_g: { type: "number" },
                      },
                      required: ["name", "calories", "protein_g", "carbs_g", "fat_g"],
                      additionalProperties: false,
                    },
                  },
                },
                required: [
                  "dish",
                  "description",
                  "calories",
                  "protein_g",
                  "carbs_g",
                  "fat_g",
                  "confidence",
                  "items",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_nutrition" } },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
      if (res.status === 402)
        throw new Error("AI credits exhausted. Add credits in Lovable Cloud settings.");
      throw new Error(`AI gateway error [${res.status}]: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const args =
      json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return nutrition data.");

    const parsed = NutritionSchema.parse(
      typeof args === "string" ? JSON.parse(args) : args
    );
    return parsed;
  });