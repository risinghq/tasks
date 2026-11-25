/**
 * Marks `el` with `data-closing`, which starts its exit animation in CSS, and
 * runs `done` when that animation ends. With no animation (reduced motion turns
 * them off) `done` runs at once. A second call while closing does nothing.
 */
export function exit(el: HTMLElement | null, done: () => void) {
  if (!el) return done();
  if ("closing" in el.dataset) return;
  el.dataset.closing = "";
  // Not the subtree: a spinner inside runs forever.
  void Promise.allSettled(el.getAnimations().map((animation) => animation.finished)).then(done);
}
