import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { generateCsrfToken } from "../middleware/csrf.js";

const router = Router();

// GET /api/auth/csrf
// Returns a CSRF token derived from the caller's access token.
// The token is stateless: HMAC(accessToken, CSRF_SECRET), so it auto-expires
// with the access token and never needs to be stored server-side.
router.get("/csrf", requireAuth, (req: Request, res: Response) => {
  const accessToken = req.headers.authorization!.match(/^Bearer (.+)$/)![1];
  res.json({ csrfToken: generateCsrfToken(accessToken) });
});

export default router;
