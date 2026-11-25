const GAP = 8;

type Box = { left: number; top: number; right: number; bottom: number };

/** Whether a panel `width` wide fits to the right or the left of `target`. */
export function fitsBeside(target: Box, width: number, viewportWidth: number) {
  return target.right + GAP + width <= viewportWidth - GAP || target.left - GAP - width >= GAP;
}

/**
 * Where a panel of `size` goes next to `target`: to its right, else to its
 * left, else under `below` when neither side fits. It stays inside the viewport.
 */
export function placeBeside(
  target: Box,
  below: number,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  let left = target.left;
  let top = below + GAP;
  if (target.right + GAP + size.width <= viewport.width - GAP) {
    left = target.right + GAP;
    top = target.top;
  } else if (target.left - GAP - size.width >= GAP) {
    left = target.left - GAP - size.width;
    top = target.top;
  }
  return {
    left: Math.max(GAP, Math.min(left, viewport.width - size.width - GAP)),
    top: Math.max(GAP, Math.min(top, viewport.height - size.height - GAP)),
  };
}
