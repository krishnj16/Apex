import type { Request } from "express";
import type { ZodTypeAny, z } from "zod";
import { HttpError } from "../lib/http.js";

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, "Invalid input", r.error.flatten());
  return r.data;
}

export const body = <S extends ZodTypeAny>(req: Request, s: S): z.infer<S> => parse(s, req.body);
export const query = <S extends ZodTypeAny>(req: Request, s: S): z.infer<S> => parse(s, req.query);
