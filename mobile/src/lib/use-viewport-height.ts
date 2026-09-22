"use client";

import { useEffect } from "react";

/**
 * iOS Safari doesn't shrink `100dvh` for the on-screen keyboard. Worse, it also pans the
 * *visual* viewport away from the (unscrollable) layout viewport to keep the focused input
 * clear of the keyboard -- so tracking height alone still leaves the top of the page shifted
 * out of view by `visualViewport.offsetTop`. Both numbers get fed into CSS vars, and `.app`
 * is pinned with `top: var(--app-top)` / `height: var(--app-height)` so it always exactly
 * covers whatever region iOS currently considers "visible", cancelling the pan out.
 */
export function useViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      document.documentElement.style.setProperty("--app-height", `${vv.height}px`);
      document.documentElement.style.setProperty("--app-top", `${vv.offsetTop}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, []);
}
