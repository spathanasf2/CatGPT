import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";

export function bearerAuth(token: string) {
  const expected = Buffer.from(token);
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      res.status(401).json({ error: "missing bearer token" });
      return;
    }
    const got = Buffer.from(match[1]!);
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      res.status(401).json({ error: "invalid token" });
      return;
    }
    next();
  };
}
