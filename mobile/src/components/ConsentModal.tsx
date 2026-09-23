"use client";

import { PRIVACY_POLICY_URL } from "@/lib/membership";

type Props = {
  // "ask": first launch (or a send attempted without permission) -- no backdrop dismiss, the person
  // has to choose. "review": Settings > AI & privacy.
  mode: "ask" | "review";
  consentedAt: string | null;
  onAllow: () => void;
  onRevoke: () => void;
  onClose: () => void;
};

export function ConsentModal({ mode, consentedAt, onAllow, onRevoke, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={mode === "review" ? onClose : undefined}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === "ask" ? "\u{1F43E} Before you start" : "AI & privacy"}</h2>
        <p className="modal-text">
          Aineko&apos;s animals are powered by a third-party AI service. What you type, along with the last few
          messages of that chat and the handful of things that animal remembers about you, is sent through our
          server to OpenRouter and an AI model to generate each reply.
        </p>
        <p className="modal-text">
          We don&apos;t store your messages. Your chat history, and what each animal remembers, stay on this device.
        </p>
        <p className="modal-links">
          <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">
            Privacy Policy
          </a>
        </p>

        {mode === "review" && (
          <p className="modal-text consent-status">
            {consentedAt
              ? `Allowed since ${new Date(consentedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. Revoking stops anything new from being sent; your chats stay on this device.`
              : "Not allowed. The animals can't reply until you allow it."}
          </p>
        )}

        {mode === "ask" || !consentedAt ? (
          <button className="subscribe-btn" onMouseDown={(e) => e.preventDefault()} onClick={onAllow}>
            {mode === "ask" ? "Sounds good" : "Allow"}
          </button>
        ) : (
          <button className="danger-btn" onClick={onRevoke}>
            Revoke permission
          </button>
        )}
        <button className="modal-close-btn" onClick={onClose}>
          {mode === "ask" ? "Not now" : "Close"}
        </button>
      </div>
    </div>
  );
}
