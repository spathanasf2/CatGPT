"use client";

import type { AnimalMeta } from "@/lib/animals";
import { avatarBackground, avatarUri } from "@/lib/avatars";

// An animal's portrait on a circle tinted with its accent color. Plain <img> of generated SVG --
// the art is our own markup (lib/avatars.ts), no user text inside it.
export function Avatar({
  animal,
  size = 32,
  className = "",
}: {
  animal: Pick<AnimalMeta, "kind" | "look" | "accent">;
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated SVG data URI, nothing to optimize
    <img
      className={`avatar ${className}`}
      src={avatarUri(animal.kind, animal.look, avatarBackground(animal.accent))}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  );
}
