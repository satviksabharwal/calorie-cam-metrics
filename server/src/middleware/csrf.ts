import type { NextFunction, Request, Response } from "express";

// CSRF token validation middleware (Double Submit Cookie pattern)
// Only validates on state-changing requests (POST, PUT, DELETE, PATCH)
// GET/HEAD/OPTIONS are safe and don't need CSRF tokens
export function validateCsrfToken(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();

  // Safe methods don't need CSRF validation
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(method)) {
    return next();
  }

  // Extract CSRF token from request
  const csrfTokenFromHeader =
    req.headers["x-csrf-token"] || req.headers["csrf-token"];
  const csrfTokenFromBody = (req.body as Record<string, unknown>)?.csrfToken;
  const csrfToken = csrfTokenFromHeader || csrfTokenFromBody;

  if (!csrfToken) {
    return res.status(403).json({ error: "Missing CSRF token" });
  }

  // Extract CSRF token from cookie
  const cookies = req.headers.cookie?.split(";") || [];
  let csrfTokenFromCookie: string | undefined;
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "csrf-token") {
      csrfTokenFromCookie = decodeURIComponent(value);
      break;
    }
  }

  if (!csrfTokenFromCookie) {
    return res.status(403).json({ error: "CSRF token not found in cookies" });
  }

  // Verify tokens match (Double Submit Cookie pattern)
  if (csrfToken !== csrfTokenFromCookie) {
    return res.status(403).json({ error: "CSRF token validation failed" });
  }

  next();
}
