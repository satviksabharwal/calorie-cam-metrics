import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(10),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("meal-images"),
  // Generate with: openssl rand -hex 32
  CSRF_SECRET: z.string().min(32),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://localhost:8080"),
  PORT: z.coerce.number().int().positive().default(3001),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};
