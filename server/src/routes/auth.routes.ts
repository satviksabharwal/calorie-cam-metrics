import { Router } from "express";
import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";

const router = Router();

// POST /api/auth/set-session
// Frontend calls this after successful Supabase login to set HTTP-only cookie + CSRF token
router.post("/set-session", (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  // Generate CSRF token (32 bytes = 256 bits of entropy)
  const csrfToken = randomBytes(32).toString("hex");

  // Set HTTP-only authentication cookie
  res.cookie("supabase-auth", token, {
    httpOnly: true, // ✅ Blocks JavaScript access (XSS protection)
    secure: process.env.NODE_ENV === "production", // ✅ HTTPS only in production
    sameSite: "lax", // ✅ CSRF protection via SameSite
    maxAge: 60 * 60 * 1000, // 1 hour (match Supabase token TTL)
    path: "/",
  });

  // Set CSRF token cookie (NOT HttpOnly — frontend needs to read it)
  res.cookie("csrf-token", csrfToken, {
    httpOnly: false, // ❌ JS can read (required for CSRF double-submit pattern)
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 1000, // Same TTL as auth token
    path: "/",
  });

  res.json({ success: true, csrfToken });
});

// POST /api/auth/clear-session
// Frontend calls this on sign-out to clear both auth + CSRF cookies
router.post("/clear-session", (req: Request, res: Response) => {
  res.clearCookie("supabase-auth", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  res.clearCookie("csrf-token", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  res.json({ success: true });
});

export default router;
