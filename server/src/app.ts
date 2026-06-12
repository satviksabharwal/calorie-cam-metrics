import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { healthRouter } from "./routes/health.routes.js";
import { mealsRouter } from "./routes/meals.routes.js";
import authRouter from "./routes/auth.routes.js";
import { errorHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();

  // Security headers on every response
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  app.use(
    cors({
      origin: config.allowedOrigins,
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    }),
  );
  // Base64 images: 1568px JPEG ≈ 0.5-1.5MB → base64 ~2MB. 15mb = safe ceiling.
  app.use(express.json({ limit: "15mb" }));

  app.use(healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/meals", mealsRouter);

  app.use(errorHandler);
  return app;
}
