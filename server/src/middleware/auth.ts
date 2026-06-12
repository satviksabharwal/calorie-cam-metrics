import { createRemoteJWKSet, jwtVerify } from "jose";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

// JWKS is fetched once and cached by jose. On encountering an unknown `kid`
// (key rotation), jose re-fetches automatically — no manual key management needed.
const JWKS = createRemoteJWKSet(new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];

  if (!token) {
    return res.status(401).json({ error: "Missing authentication token" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${config.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });

    req.user = {
      id: payload.sub!,
      email: payload["email"] as string | undefined,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
