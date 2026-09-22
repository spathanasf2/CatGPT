"use client";

import { useEffect, useState } from "react";
import { fetchUsage, type Usage } from "@/lib/usage";

type Props = {
  onClose: () => void;
};

export function UsageModal({ onClose }: Props) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsage()
      .then(setUsage)
      .catch((err) => setError(err instanceof Error ? err.message : "failed to load usage"));
  }, []);

  const pct = usage ? Math.min(100, (usage.totalTokens / Math.max(usage.budgetTokens, 1)) * 100) : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Usage</h2>
        {error && <p className="modal-row-value">Couldn&apos;t load usage: {error}</p>}
        {!error && !usage && <p className="modal-row-value">Loading...</p>}
        {usage && (
          <>
            <div className="meter">
              <div className="meter-track">
                <div className="meter-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="meter-label">
                {usage.totalTokens.toLocaleString()} / {usage.budgetTokens.toLocaleString()} tokens (
                {pct.toFixed(1)}%)
              </p>
            </div>
            <p className="modal-row-label">Prompt tokens</p>
            <p className="modal-row-value">{usage.promptTokens.toLocaleString()}</p>
            <p className="modal-row-label">Completion tokens</p>
            <p className="modal-row-value">{usage.completionTokens.toLocaleString()}</p>
            <p className="modal-row-label">Requests</p>
            <p className="modal-row-value">{usage.requests.toLocaleString()}</p>
            <p className="usage-note">
              Budget is a placeholder for now, just to prove the counting is accurate. Real limits come later.
            </p>
          </>
        )}
        <button className="modal-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
