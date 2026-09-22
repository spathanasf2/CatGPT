import { createHash, verify, X509Certificate } from "node:crypto";
import { APPLE_ROOT_CA_G3_PEM } from "./apple-root-ca.js";

export const BUNDLE_ID = "com.commandminelabs.aineko";
export const MEMBERSHIP_PRODUCT_ID = "com.commandminelabs.aineko.monthly";

const APPLE_ROOT = new X509Certificate(APPLE_ROOT_CA_G3_PEM);

// DER-encoded marker OIDs Apple puts on its App Store signing chain -- the same checks Apple's own
// app-store-server-library makes. The leaf check is the one that matters: Apple's WWDR intermediate
// also issues every developer's personal signing certificate, so without it anyone with an Apple
// developer account could mint a "valid" transaction.
const LEAF_MARKER = Buffer.from("060a2a864886f76364060b01", "hex"); // 1.2.840.113635.100.6.11.1
const INTERMEDIATE_MARKER = Buffer.from("060a2a864886f76364060201", "hex"); // 1.2.840.113635.100.6.2.1

export type Membership = {
  originalTransactionId: string;
  expiresAt: number;
  environment: "Production" | "Sandbox";
};

type TransactionPayload = {
  bundleId?: unknown;
  productId?: unknown;
  originalTransactionId?: unknown;
  expiresDate?: unknown;
  revocationDate?: unknown;
  environment?: unknown;
  signedDate?: unknown;
};

function decodePart(part: string): unknown {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

function validAt(cert: X509Certificate, when: number): boolean {
  return when >= Date.parse(cert.validFrom) && when <= Date.parse(cert.validTo);
}

/**
 * Verifies a StoreKit 2 signed transaction (`jwsRepresentation`) offline: the x5c chain must lead to
 * the pinned Apple root, both certs must carry Apple's App Store markers, the ES256 signature must
 * check out, and the payload must be an unrevoked, unexpired Aineko membership. Returns null for
 * anything else -- callers treat that as "not a member", never as an error.
 *
 * Sandbox is accepted alongside Production on purpose: TestFlight and App Review both purchase in
 * Sandbox against the production server. "Xcode" (local StoreKit config files) is not.
 *
 * Not covered: a refund issued after the app last fetched its transaction. Such a JWS stays valid
 * here until its expiresDate (at most one billing period); App Store Server Notifications would
 * close that gap if it ever matters.
 */
export function verifyMembership(jws: string, now = Date.now(), root = APPLE_ROOT): Membership | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  try {
    const header = decodePart(headerPart) as { alg?: unknown; x5c?: unknown };
    if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length < 2) return null;
    const [leafB64, intermediateB64] = header.x5c as unknown[];
    if (typeof leafB64 !== "string" || typeof intermediateB64 !== "string") return null;
    const leaf = new X509Certificate(Buffer.from(leafB64, "base64"));
    const intermediate = new X509Certificate(Buffer.from(intermediateB64, "base64"));

    // Chain to OUR pinned root -- whatever root the token itself carries is ignored.
    if (!intermediate.checkIssued(root) || !intermediate.verify(root.publicKey)) return null;
    if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) return null;
    if (!leaf.raw.includes(LEAF_MARKER) || !intermediate.raw.includes(INTERMEDIATE_MARKER)) return null;

    const signed = verify(
      "sha256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      { key: leaf.publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signaturePart, "base64url"),
    );
    if (!signed) return null;

    const payload = decodePart(payloadPart) as TransactionPayload;
    // Certificates are checked as of when Apple signed the transaction (as Apple's library does), so
    // a routine leaf rotation doesn't invalidate transactions signed before it.
    const signedAt = typeof payload.signedDate === "number" ? payload.signedDate : now;
    if (!validAt(leaf, signedAt) || !validAt(intermediate, signedAt)) return null;

    if (payload.bundleId !== BUNDLE_ID || payload.productId !== MEMBERSHIP_PRODUCT_ID) return null;
    if (payload.environment !== "Production" && payload.environment !== "Sandbox") return null;
    if (payload.revocationDate !== undefined && payload.revocationDate !== null) return null;
    if (typeof payload.expiresDate !== "number" || payload.expiresDate <= now) return null;
    if (typeof payload.originalTransactionId !== "string" || !payload.originalTransactionId) return null;

    return {
      originalTransactionId: payload.originalTransactionId,
      expiresAt: payload.expiresDate,
      environment: payload.environment,
    };
  } catch {
    return null;
  }
}

// The app sends the same JWS on every request until it renews, so verify each distinct token once.
// Bounded by clearing wholesale -- it's a cache, and re-verifying costs a millisecond.
const cache = new Map<string, Membership | null>();
const CACHE_MAX = 5_000;

export function verifyMembershipCached(jws: string): Membership | null {
  const key = createHash("sha256").update(jws).digest("base64url");
  const hit = cache.get(key);
  if (hit !== undefined && (hit === null || hit.expiresAt > Date.now())) return hit;
  const result = verifyMembership(jws);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, result);
  return result;
}
