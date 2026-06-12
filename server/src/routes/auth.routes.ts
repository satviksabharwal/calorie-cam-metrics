import { Router } from "express";
import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "../lib/supabase.js";

const router = Router();

// POST /api/auth/set-session
// Frontend calls this after successful Supabase login to set HTTP-only cookies + CSRF token
router.post("/set-session", (req: Request, res: Response) => {
  const { token, refreshToken } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  // Generate CSRF token (32 bytes = 256 bits of entropy)
  const csrfToken = randomBytes(32).toString("hex");

  const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

  // Set HTTP-only authentication cookie (access token)
  res.cookie("supabase-auth", token, {
    httpOnly: true, // ✅ Blocks JavaScript access (XSS protection)
    secure: isProduction, // ✅ HTTPS only in production
    sameSite: "lax", // ✅ CSRF protection via SameSite
    maxAge: 60 * 60 * 1000, // 1 hour (match Supabase token TTL)
    path: "/",
  });

  // Set HTTP-only refresh token cookie (long-lived, ~30 days)
  if (refreshToken) {
    res.cookie("supabase-refresh", refreshToken, {
      httpOnly: true, // ✅ Secure: JS cannot access
      secure: isProduction,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/",
    });
  }

  // Set CSRF token cookie (NOT HttpOnly — frontend needs to read it)
  res.cookie("csrf-token", csrfToken, {
    httpOnly: false, // ❌ JS can read (required for CSRF double-submit pattern)
    secure: isProduction,
    sameSite: "lax",
    maxAge: 60 * 60 * 1000, // Same TTL as auth token
    path: "/",
  });

  res.json({ success: true, csrfToken });
});

// POST /api/auth/refresh
// Refreshes the access token using the refresh token
router.post("/refresh", async (req: Request, res: Response) => {
  let refreshToken: string | undefined;

  // Extract refresh token from HTTP-only cookie
  const cookies = req.headers.cookie?.split(";") || [];
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "supabase-refresh") {
      refreshToken = decodeURIComponent(value);
      break;
    }
  }

  if (!refreshToken) {
    return res.status(401).json({ error: "Missing refresh token" });
  }

  try {
    // Use Supabase admin client to refresh the session
    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      return res.status(401).json({ error: "Failed to refresh token" });
    }

    const newAccessToken = data.session.access_token;
    const newRefreshToken = data.session.refresh_token;
    const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

    // Update the access token cookie
    res.cookie("supabase-auth", newAccessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 60 * 60 * 1000, // 1 hour
      path: "/",
    });

    // Update the refresh token cookie if it changed
    if (newRefreshToken) {
      res.cookie("supabase-refresh", newRefreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: "/",
      });
    }

    // Return new access token in response body for frontend to store
    res.json({ success: true, accessToken: newAccessToken });
  } catch (err) {
    return res.status(401).json({ error: "Token refresh failed" });
  }
});

// POST /api/auth/clear-session
// Frontend calls this on sign-out to clear both auth + CSRF cookies
router.post("/clear-session", (req: Request, res: Response) => {
  const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

  res.clearCookie("supabase-auth", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  });

  res.clearCookie("supabase-refresh", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  });

  res.clearCookie("csrf-token", {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  });

  res.json({ success: true });
});

export default router;
