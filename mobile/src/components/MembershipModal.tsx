"use client";

import { useEffect, useState } from "react";
import {
  fetchMembershipProduct,
  purchaseMembership,
  restoreMembership,
  isMember,
  nativePurchasesAvailable,
  type MembershipProduct,
} from "@/lib/membership";

type Props = {
  onClose: () => void;
};

export function MembershipModal({ onClose }: Props) {
  const [available] = useState(() => nativePurchasesAvailable());
  const [product, setProduct] = useState<MembershipProduct | null>(null);
  const [productLoaded, setProductLoaded] = useState(false);
  const [member, setMember] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!available) return;
    fetchMembershipProduct()
      .then(setProduct)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setProductLoaded(true));
    isMember()
      .then(setMember)
      .catch(() => setMember(false));
  }, [available]);

  async function handleSubscribe() {
    setBusy(true);
    setError(null);
    try {
      await purchaseMembership();
      setMember(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "purchase failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setError(null);
    try {
      await restoreMembership();
      setMember(await isMember());
    } catch (err) {
      setError(err instanceof Error ? err.message : "restore failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Membership</h2>

        {!available && (
          <p className="modal-row-value">Purchases are only available in the App Store version of the app.</p>
        )}

        {available && member === true && (
          <p className="modal-row-value">You&apos;re a member. Thanks for keeping the lights on.</p>
        )}

        {available && member === false && (
          <>
            <p className="modal-row-label">Unlimited chats</p>
            <p className="modal-row-value">{product ? `${product.priceString} / month` : productLoaded ? "Not available right now." : "Loading..."}</p>
            {error && <p className="modal-error">{error}</p>}
            <button className="subscribe-btn" onClick={handleSubscribe} disabled={busy || !product}>
              {busy ? "Processing..." : "Subscribe"}
            </button>
            <button className="settings-row-btn" onClick={handleRestore} disabled={busy}>
              Restore purchases
            </button>
          </>
        )}

        <button className="modal-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
