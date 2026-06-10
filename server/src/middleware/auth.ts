import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

// Verifies the Supabase access token sent by the frontend.
// getUser() round-trips to Supabase (~50-100ms) — negligible next to a Claude
// call. If it ever matters, switch to local JWKS verification with `jose`.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.user = data.user;
  next();
}
