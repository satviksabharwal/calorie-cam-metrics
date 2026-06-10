import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { healthRouter } from "./routes/health.routes.js";
import { mealsRouter } from "./routes/meals.routes.js";
import { errorHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.allowedOrigins,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  // Base64 images: 1568px JPEG ≈ 0.5-1.5MB → base64 ~2MB. 15mb = safe ceiling.
  app.use(express.json({ limit: "15mb" }));

  app.use(healthRouter);
  app.use("/api/meals", mealsRouter);

  app.use(errorHandler);
  return app;
}
