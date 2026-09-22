import { Capacitor } from "@capacitor/core";
import { NativePurchases } from "@capgo/native-purchases";

export const MEMBERSHIP_PRODUCT_ID = "com.commandminelabs.aineko.monthly";

export type MembershipProduct = {
  priceString: string;
  title: string;
};

// StoreKit only exists in the real app -- the tailnet browser build has no purchases to make.
export function nativePurchasesAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export async function fetchMembershipProduct(): Promise<MembershipProduct | null> {
  if (!nativePurchasesAvailable()) return null;
  const { products } = await NativePurchases.getProducts({ productIdentifiers: [MEMBERSHIP_PRODUCT_ID] });
  const product = products[0];
  if (!product) return null;
  return { priceString: product.priceString, title: product.title };
}

export async function purchaseMembership(): Promise<void> {
  await NativePurchases.purchaseProduct({ productIdentifier: MEMBERSHIP_PRODUCT_ID, quantity: 1 });
}

export async function restoreMembership(): Promise<void> {
  await NativePurchases.restorePurchases();
}

export async function isMember(): Promise<boolean> {
  if (!nativePurchasesAvailable()) return false;
  const { purchases } = await NativePurchases.getPurchases();
  return purchases.some((p) => p.productIdentifier === MEMBERSHIP_PRODUCT_ID && p.isActive && !p.revocationDate);
}
