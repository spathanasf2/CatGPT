"use client";

/**
 * Pure aesthetic beat, not a real loading state -- nothing async blocks Aineko's first paint,
 * so this shows for a short fixed duration and fades, rather than waiting on real readiness the
 * way qoracle's loader does for its heavier 3D scene. Pre-rendered in the static export's initial
 * HTML (not conditionally mounted), so it's already on screen the instant the native launch
 * screen hands off -- no blank flash in between. `hidden` timing is owned by the parent
 * (`page.tsx`'s `bootDone`) rather than an internal timer, so cold-launch keyboard focus can wait
 * on this actually finishing instead of racing it on its own separate clock.
 */
export function BootScreen({ hidden }: { hidden: boolean }) {
  return (
    <div className={`boot-screen${hidden ? " boot-hidden" : ""}`} aria-hidden={hidden}>
      <div className="boot-mark">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
        <img src="/aineko-mark.png" alt="" />
        <div className="boot-shimmer" />
      </div>
    </div>
  );
}
