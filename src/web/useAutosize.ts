import { useLayoutEffect, useRef } from "react";

export function useAutosize() {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    measure();
    // A textarea mounted hidden has a scrollHeight of 0; the observer measures
    // it again once it gains a layout box and on later resizes.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });
  return ref;
}
