import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

// Verifies the Supabase access token from either:
// 1. HTTP-only cookie (supabase-auth) — preferred, XSS-safe
// 2. Authorization: Bearer header — fallback for API clients
// getUser() round-trips to Supabase (~50-100ms) — negligible next to a Claude call.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  let token: string | undefined;

  // Try HTTP-only cookie first (more secure)
  const cookies = req.headers.cookie?.split(";") || [];
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "supabase-auth") {
      token = decodeURIComponent(value);
      break;
    }
  }

  // Fallback to Authorization header (for API clients, non-browser)
  if (!token) {
    token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  }

  if (!token) {
    return res.status(401).json({ error: "Missing authentication token" });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = data.user;
  next();
}
