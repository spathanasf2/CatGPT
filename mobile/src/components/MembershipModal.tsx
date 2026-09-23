"use client";

import { useEffect, useState } from "react";
import {
  fetchMembershipProduct,
  manageMembership,
  purchaseMembership,
  refreshMembership,
  restoreMembership,
  nativePurchasesAvailable,
  PRIVACY_POLICY_URL,
  TERMS_OF_USE_URL,
  type MembershipProduct,
} from "@/lib/membership";
import { ANIMALS } from "@/lib/animals";
import { Avatar } from "./Avatar";

type Props = {
  onClose: () => void;
  onMembershipChange: (member: boolean) => void;
};

const BONUS = ANIMALS.filter((a) => a.membersOnly);

// "About 10x" mirrors FREE_FRACTION=0.1 in server/src/limits.ts -- change both together.
function Perks() {
  return (
    <ul className="perk-list">
      <li>
        Bonus animals: {BONUS.map((a) => `${a.name} the ${a.species}`).join(", ")}
        <span className="perk-avatars">
          {BONUS.map((a) => (
            <Avatar key={a.id} animal={a} size={30} />
          ))}
        </span>
      </li>
      <li>Make your own animals: pick the species, name, and personality</li>
      <li>About 10&times; the free chat allowance</li>
    </ul>
  );
}

// Apple requires these two links wherever an auto-renewable subscription is offered (3.1.2).
function LegalLinks() {
  return (
    <p className="modal-links">
      <a href={TERMS_OF_USE_URL} target="_blank" rel="noreferrer">
        Terms of Use
      </a>
      {" · "}
      <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">
        Privacy Policy
      </a>
    </p>
  );
}

export function MembershipModal({ onClose, onMembershipChange }: Props) {
  const [available] = useState(() => nativePurchasesAvailable());
  const [product, setProduct] = useState<MembershipProduct | null>(null);
  const [productLoaded, setProductLoaded] = useState(false);
  const [member, setMember] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateMember(next: boolean) {
    setMember(next);
    onMembershipChange(next);
  }

  useEffect(() => {
    if (!available) return;
    fetchMembershipProduct()
      .then(setProduct)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setProductLoaded(true));
    refreshMembership()
      .then(updateMember)
      .catch(() => setMember(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per open; updateMember is stable in effect
  }, [available]);

  async function handleSubscribe() {
    setBusy(true);
    setError(null);
    try {
      await purchaseMembership();
      updateMember(true);
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
      updateMember(await restoreMembership());
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
          <>
            <Perks />
            <p className="modal-text">Purchases are only available in the App Store version of the app.</p>
          </>
        )}

        {available && member === true && (
          <>
            <p className="modal-text">You&apos;re a member. Thanks for keeping the lights on.</p>
            <Perks />
            <button className="settings-row-btn" onClick={() => manageMembership().catch(() => undefined)}>
              Manage subscription
            </button>
          </>
        )}

        {available && member === false && (
          <>
            {/* Apple wants the subscription's title, length and price stated where it's sold. */}
            <p className="modal-text">
              <strong>{product?.title || "Aineko Membership"}</strong>
              {" — "}
              {product ? `${product.priceString} / month` : productLoaded ? "not available right now." : "loading..."}
            </p>
            <Perks />
            {error && <p className="modal-error">{error}</p>}
            <button className="subscribe-btn" onClick={handleSubscribe} disabled={busy || !product}>
              {busy ? "Processing..." : "Subscribe"}
            </button>
            <button className="settings-row-btn" onClick={handleRestore} disabled={busy}>
              Restore purchases
            </button>
            <p className="fine-print">
              Renews automatically every month until canceled. Cancel anytime in your Apple ID&apos;s subscription
              settings, at least 24 hours before the end of the current period.
            </p>
          </>
        )}

        <LegalLinks />
        <button className="modal-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
