// Membership (StoreKit 2 JWS) verification. The positive path can't use a real Apple-signed token
// (none is checked in), so this mints a throwaway chain shaped like Apple's -- root, an intermediate
// with Apple's WWDR marker, a leaf with the receipt-signing marker, and a "developer" leaf without
// it -- and points the verifier at that root. The last case checks that the pinned Apple root
// rejects all of it. Needs the openssl CLI. Run: npm test
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, sign, X509Certificate } from "node:crypto";
import { BUNDLE_ID, MEMBERSHIP_PRODUCT_ID, verifyMembership } from "../src/entitlement.ts";

const cnf = new URL("./test-pki.cnf", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "aineko-pki-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const ssl = (...args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
for (const k of ["root", "otherroot", "int", "leaf", "devleaf"]) {
  ssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", `${k}.key`);
}
for (const r of ["root", "otherroot"]) {
  ssl("req", "-x509", "-new", "-key", `${r}.key`, "-subj", "/CN=Test Root", "-days", "30",
    "-extensions", "ca_ext", "-config", cnf, "-out", `${r}.pem`);
}
const issue = (name: string, cn: string, ca: string, ext: string) => {
  ssl("req", "-new", "-key", `${name}.key`, "-subj", `/CN=${cn}`, "-config", cnf, "-out", `${name}.csr`);
  ssl("x509", "-req", "-in", `${name}.csr`, "-CA", `${ca}.pem`, "-CAkey", `${ca}.key`, "-CAcreateserial",
    "-days", "30", "-extfile", cnf, "-extensions", ext, "-out", `${name}.pem`);
};
issue("int", "Test WWDR", "root", "int_ext");
issue("leaf", "Test Receipt Signing", "int", "leaf_ext");
issue("devleaf", "Some Developer", "int", "devleaf_ext");

const cert = (n: string) => new X509Certificate(readFileSync(join(dir, `${n}.pem`)));
const root = cert("root");
// The certs were minted moments ago; sign "now" so signedDate falls inside their validity.
const now = Date.now() + 5_000;
const good = {
  bundleId: BUNDLE_ID,
  productId: MEMBERSHIP_PRODUCT_ID,
  originalTransactionId: "2000000123456789",
  expiresDate: now + 30 * 86_400_000,
  environment: "Sandbox",
  signedDate: now,
};

function jws(payload: object, { leaf = "leaf", alg = "ES256" } = {}): string {
  const x5c = [leaf, "int", "root"].map((n) => cert(n).raw.toString("base64"));
  const h = Buffer.from(JSON.stringify({ alg, x5c })).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = createPrivateKey(readFileSync(join(dir, `${leaf}.key`)));
  const s = sign("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${h}.${p}.${s}`;
}

test("accepts a valid Sandbox or Production membership", () => {
  assert.equal(verifyMembership(jws(good), now, root)?.originalTransactionId, "2000000123456789");
  assert.equal(verifyMembership(jws({ ...good, environment: "Production" }), now, root)?.environment, "Production");
});

test("rejects a token signed by a developer cert from the same intermediate", () => {
  assert.equal(verifyMembership(jws(good, { leaf: "devleaf" }), now, root), null);
});

test("rejects expired, revoked, wrong app, wrong product, and Xcode-environment tokens", () => {
  for (const bad of [
    { expiresDate: now - 1 },
    { revocationDate: now - 1 },
    { bundleId: "com.someone.else" },
    { productId: `${MEMBERSHIP_PRODUCT_ID}.other` },
    { environment: "Xcode" },
    { signedDate: now - 365 * 86_400_000 },
  ]) {
    assert.equal(verifyMembership(jws({ ...good, ...bad }), now, root), null, JSON.stringify(bad));
  }
});

test("rejects tampering, alg swaps, and garbage", () => {
  const [h, , s] = jws(good).split(".");
  const forged = Buffer.from(JSON.stringify({ ...good, originalTransactionId: "999" })).toString("base64url");
  assert.equal(verifyMembership(`${h}.${forged}.${s}`, now, root), null);
  assert.equal(verifyMembership(jws(good, { alg: "none" }), now, root), null);
  assert.equal(verifyMembership("not.a.jws", now, root), null);
});

test("only trusts the pinned root", () => {
  assert.equal(verifyMembership(jws(good), now, cert("otherroot")), null, "look-alike root");
  assert.equal(verifyMembership(jws(good), now), null, "default pinned Apple root");
});
