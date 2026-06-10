import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { analyzeMeal, dailyTotals, recentMeals } from "../controllers/meals.controller.js";

export const mealsRouter = Router();

mealsRouter.use(requireAuth);

mealsRouter.post("/analyze", analyzeMeal);
mealsRouter.get("/recent", recentMeals);
mealsRouter.get("/daily-totals", dailyTotals);
