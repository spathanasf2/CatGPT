import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

/**
 * Minimal fixed-window per-IP limiter. Deliberately content-blind -- it only ever sees request
 * counts, never message text, so it can't contradict the no-logging privacy policy. Good enough
 * to cap a runaway script hammering the paid endpoint; not trying to be more than that.
 */
export function rateLimit(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now > bucket.resetAt) buckets.delete(key);
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: "too many requests, slow down" });
      return;
    }
    bucket.count += 1;
    next();
  };
}
