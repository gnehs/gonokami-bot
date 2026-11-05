import { useRef, type PointerEvent } from "react";

// Ported from BlingBook's useSwipeBack and useSlideToSelectTab, without the motion dependency:
// the finger drives an inline transform, and letting go hands back to the element's CSS transition.

const SWIPE_SLOP_PX = 10;
const DISMISS_FRACTION = 0.3;
const DISMISS_VELOCITY = 0.5; // px per ms

type SwipeState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  velocity: number;
  active: boolean;
};

/**
 * Swipe right anywhere on a full-screen page to dismiss it, like iOS back.
 * The element needs `touch-action: pan-y` so vertical scrolling stays with the browser.
 */
export function useSwipeBack<T extends HTMLElement>(onDismiss: () => void) {
  const ref = useRef<T>(null);
  const drag = useRef<SwipeState | null>(null);

  const release = (transform: string) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = transform;
    el.style.removeProperty("--swipe-progress");
  };

  const onPointerDown = (event: PointerEvent<T>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest("[data-swipe-ignore]")) return;
    if (event.pointerType === "mouse" && target.closest("input, textarea, select")) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      active: false,
    };
  };

  const onPointerMove = (event: PointerEvent<T>) => {
    const state = drag.current;
    const el = ref.current;
    if (!state || !el || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (!state.active) {
      if (Math.abs(dy) > SWIPE_SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      if (dx < SWIPE_SLOP_PX || dx < Math.abs(dy) * 1.5) return;
      state.active = true;
      // Capturing also keeps the release from clicking whatever is underneath.
      el.setPointerCapture(event.pointerId);
    }

    const elapsed = event.timeStamp - state.lastTime;
    if (elapsed > 0) state.velocity = (event.clientX - state.lastX) / elapsed;
    state.lastX = event.clientX;
    state.lastTime = event.timeStamp;

    const offset = Math.max(0, dx - SWIPE_SLOP_PX);
    el.style.transition = "none";
    el.style.transform = `translateX(${offset}px)`;
    el.style.setProperty("--swipe-progress", String(Math.min(1, offset / window.innerWidth)));
  };

  const onPointerEnd = () => {
    const state = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!state?.active || !el) return;

    const offset = new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
    if (offset > window.innerWidth * DISMISS_FRACTION || state.velocity > DISMISS_VELOCITY) {
      // Slide the rest of the way from where the finger left it, then let React close it.
      release("translateX(100%)");
      onDismiss();
    } else {
      release("");
    }
  };

  return {
    ref,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  };
}

const SLIDE_START_PX = 6;

type SlideState = { pointerId: number; startX: number; startY: number; sliding: boolean; ignored: boolean };

/**
 * A horizontal drag on a tab bar carries its indicator along with the finger and selects the tab
 * under the finger on release. Tabs are the `button`s inside the bar; the indicator is
 * `[data-slide-indicator]`, positioned by `translateX(index * 100%)` and sized to one tab.
 */
export function useSlideToSelectTab<T extends HTMLElement>(activeIndex: number, onCommit: (index: number) => void) {
  const ref = useRef<T>(null);
  const gesture = useRef<SlideState | null>(null);

  const parts = () => {
    const bar = ref.current;
    const indicator = bar?.querySelector<HTMLElement>("[data-slide-indicator]") ?? null;
    const tabs = Array.from(bar?.querySelectorAll<HTMLElement>("button") ?? []);
    return { indicator, tabs };
  };

  const placeIndicator = (index: number, animated: boolean) => {
    const { indicator } = parts();
    if (!indicator) return;
    indicator.style.transition = animated ? "" : "none";
    indicator.style.transform = `translateX(${index * 100}%)`;
  };

  const nearestIndex = (tabs: HTMLElement[], x: number) => {
    let best = -1;
    let bestDistance = Infinity;
    tabs.forEach((tab, index) => {
      const rect = tab.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - x);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  };

  const onPointerDown = (event: PointerEvent<T>) => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      sliding: false,
      ignored: parts().tabs.length < 2,
    };
  };

  const onPointerMove = (event: PointerEvent<T>) => {
    const state = gesture.current;
    if (!state || state.ignored || state.pointerId !== event.pointerId) return;

    if (!state.sliding) {
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (Math.abs(dx) < SLIDE_START_PX && Math.abs(dy) < SLIDE_START_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        state.ignored = true;
        return;
      }
      state.sliding = true;
      ref.current?.setPointerCapture(event.pointerId);
    }

    const { indicator, tabs } = parts();
    const first = tabs[0];
    if (!indicator || !first) return;
    const width = indicator.offsetWidth;
    const fromFirst = event.clientX - first.getBoundingClientRect().left - width / 2;
    const offset = Math.min((tabs.length - 1) * width, Math.max(0, fromFirst));
    indicator.style.transition = "none";
    indicator.style.transform = `translateX(${offset}px)`;
  };

  const onPointerUp = (event: PointerEvent<T>) => {
    const state = gesture.current;
    if (!state || state.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (!state.sliding) return;
    const index = nearestIndex(parts().tabs, event.clientX);
    placeIndicator(index === -1 ? activeIndex : index, true);
    if (index !== -1 && index !== activeIndex) onCommit(index);
  };

  const onPointerCancel = (event: PointerEvent<T>) => {
    const state = gesture.current;
    if (!state || state.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (state.sliding) placeIndicator(activeIndex, true);
  };

  return { ref, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}
