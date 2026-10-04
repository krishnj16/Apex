import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env, isProd } from "../config/env.js";
import { HttpError } from "../lib/http.js";

export const SESSION_COOKIE = "apex_session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function issueSession(res: Response, userId: string): void {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: `${env.JWT_TTL_HOURS}h` });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: env.JWT_TTL_HOURS * 3_600_000,
    path: "/",
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) return next(new HttpError(401, "Sign in to continue"));
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
    if (!payload.sub) throw new Error("no subject");
    req.userId = payload.sub;
    next();
  } catch {
    next(new HttpError(401, "Session expired. Sign in again."));
  }
}

/** The cookie is SameSite=Lax; state-changing requests must also carry this header (CSRF guard). */
export function requireApexHeader(req: Request, _res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("X-Apex-Client") !== "web") return next(new HttpError(403, "Missing client header"));
  next();
}

export const uid = (req: Request): string => {
  if (!req.userId) throw new HttpError(401, "Sign in to continue");
  return req.userId;
};
