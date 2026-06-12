import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

// Stateless CSRF: HMAC(accessToken, CSRF_SECRET).
// Tie the CSRF token to the user's specific access token so it can't be
// reused across sessions or by a different user.
export function generateCsrfToken(accessToken: string): string {
  return createHmac("sha256", config.CSRF_SECRET).update(accessToken).digest("hex").slice(0, 32);
}

export function validateCsrfToken(req: Request, res: Response, next: NextFunction) {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method.toUpperCase())) return next();

  const csrfHeader = req.headers["x-csrf-token"] as string | undefined;
  const bearerToken = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];

  if (!csrfHeader || !bearerToken) {
    return res.status(403).json({ error: "CSRF validation failed" });
  }

  const expected = generateCsrfToken(bearerToken);

  // Timing-safe comparison prevents oracle attacks on the CSRF token
  if (
    csrfHeader.length !== expected.length ||
    !timingSafeEqual(Buffer.from(csrfHeader, "utf-8"), Buffer.from(expected, "utf-8"))
  ) {
    return res.status(403).json({ error: "CSRF validation failed" });
  }

  next();
}
