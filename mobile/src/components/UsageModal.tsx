"use client";

import { useEffect, useState } from "react";
import { fetchMyUsage, type MyUsage, type WindowUsage } from "@/lib/usage";

type Props = {
  onClose: () => void;
  onOpenMembership: () => void;
};

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Percent, not tokens -- a token count means nothing to someone chatting with a cat.
function Meter({ label, w }: { label: string; w: WindowUsage }) {
  const pct = Math.min(100, (w.used / Math.max(w.limit, 1)) * 100);
  const shown = w.used > 0 && pct < 1 ? "<1" : Math.round(pct).toString();
  return (
    <div className="meter">
      <p className="modal-row-label">{label}</p>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="meter-label">
        {w.resetAt === null ? "Full allowance available" : `${shown}% used · resets ${formatDay(w.resetAt)}`}
      </p>
    </div>
  );
}

export function UsageModal({ onClose, onOpenMembership }: Props) {
  const [usage, setUsage] = useState<MyUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyUsage()
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : "failed to load usage"));
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Usage</h2>
        {error && <p className="modal-text">Couldn&apos;t load usage: {error}</p>}
        {!error && !usage && <p className="modal-text">Loading...</p>}
        {usage && (
          <>
            <p className="modal-text">{usage.tier === "member" ? "Membership" : "Free plan"}</p>
            <Meter label="This week" w={usage.week} />
            <Meter label="This month" w={usage.month} />
            {usage.tier === "free" ? (
              <button className="settings-row-btn" onClick={onOpenMembership}>
                Members get about 10&times; more &rsaquo;
              </button>
            ) : (
              <p className="usage-note">Thanks for being a member.</p>
            )}
          </>
        )}
        <button className="modal-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
