import { Capacitor } from "@capacitor/core";
import { NativePurchases, type Transaction } from "@capgo/native-purchases";

export const MEMBERSHIP_PRODUCT_ID = "com.commandminelabs.aineko.monthly";

// Apple's standard EULA -- used instead of a custom one, so App Store Connect's License Agreement
// stays on the default too. Apple requires this link (and the privacy policy) in-app for
// auto-renewable subscriptions (guideline 3.1.2).
export const TERMS_OF_USE_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
export const PRIVACY_POLICY_URL = "https://aineko.bromsg.com/privacy";

export type MembershipProduct = {
  priceString: string;
  title: string;
};

// StoreKit only exists in the real app -- the tailnet browser build has no purchases to make.
export function nativePurchasesAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

// The active membership's StoreKit 2 signed transaction, sent with every request so the server can
// verify membership itself (server/src/entitlement.ts). Null when not a member.
let membershipJws: string | null = null;

export function currentMembershipJws(): string | null {
  return membershipJws;
}

function isActiveMembership(t: Transaction): boolean {
  return t.productIdentifier === MEMBERSHIP_PRODUCT_ID && t.isActive === true && !t.revocationDate;
}

/** Re-reads entitlements from StoreKit. Call on launch, on returning to the foreground (a renewal
 *  issues a new transaction), and after purchase/restore. Returns whether this is a member. */
export async function refreshMembership(): Promise<boolean> {
  if (!nativePurchasesAvailable()) return false;
  const { purchases } = await NativePurchases.getPurchases();
  const active = purchases.find(isActiveMembership);
  membershipJws = active?.jwsRepresentation ?? null;
  return Boolean(active);
}

export async function fetchMembershipProduct(): Promise<MembershipProduct | null> {
  if (!nativePurchasesAvailable()) return null;
  const { products } = await NativePurchases.getProducts({ productIdentifiers: [MEMBERSHIP_PRODUCT_ID] });
  const product = products[0];
  if (!product) return null;
  return { priceString: product.priceString, title: product.title };
}

export async function purchaseMembership(): Promise<void> {
  const transaction = await NativePurchases.purchaseProduct({ productIdentifier: MEMBERSHIP_PRODUCT_ID, quantity: 1 });
  // Prefer StoreKit's current entitlement; fall back to the purchase's own signed transaction if it
  // hasn't shown up in the entitlements list yet.
  const listed = await refreshMembership().catch(() => false);
  if (!listed && transaction.jwsRepresentation) membershipJws = transaction.jwsRepresentation;
}

export async function restoreMembership(): Promise<boolean> {
  await NativePurchases.restorePurchases();
  return refreshMembership();
}

// Apple's own manage/cancel sheet -- the in-app route to cancelling that reviewers look for.
export async function manageMembership(): Promise<void> {
  await NativePurchases.manageSubscriptions();
}
