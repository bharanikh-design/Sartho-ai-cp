"use client";

import { useEffect, type RefObject } from "react";

/*
 * The front door's motion controller for the pointer.
 *
 * It writes two custom properties, --fd-px and --fd-py (each roughly -1..1), on
 * the target element from the pointer's position within it, and every parallax
 * layer reads those variables. Doing it once, on one element, means the ribbon,
 * the card and the headline move together as one scene instead of each wiring up
 * its own listener.
 *
 * Three rules keep it honest: it coalesces to one write per frame via
 * requestAnimationFrame; it eases toward the target rather than snapping, so the
 * scene drifts rather than twitches; and it does nothing at all when the visitor
 * has asked for reduced motion or is on a touch device, where a pointer parallax
 * is either unwanted or meaningless.
 */
export function usePointerParallax<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (reduce || coarse) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;
    let settleFrames = 0;

    const tick = () => {
      // Critically damped-ish ease: close 12% of the remaining gap each frame.
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      element.style.setProperty("--fd-px", currentX.toFixed(4));
      element.style.setProperty("--fd-py", currentY.toFixed(4));

      const settled =
        Math.abs(targetX - currentX) < 0.001 && Math.abs(targetY - currentY) < 0.001;
      // Keep animating a few frames past "settled" so we land exactly on target,
      // then stop the loop until the pointer moves again.
      if (settled && ++settleFrames > 3) {
        frame = 0;
        return;
      }
      if (!settled) settleFrames = 0;
      frame = requestAnimationFrame(tick);
    };

    const ensureRunning = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      targetY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      ensureRunning();
    };

    const onPointerLeave = () => {
      targetX = 0;
      targetY = 0;
      ensureRunning();
    };

    element.addEventListener("pointermove", onPointerMove, { passive: true });
    element.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerleave", onPointerLeave);
      element.style.removeProperty("--fd-px");
      element.style.removeProperty("--fd-py");
    };
  }, [ref]);
}
