import { useEffect, useRef, useState, type ComponentType, type RefObject } from "react";

export interface Loader<P> {
  promise: Promise<ComponentType<P>>;
}

/** Starts the dynamic import immediately (when the wrapper module loads) and caches it. */
export function createLoader<P>(importer: () => Promise<{ default: ComponentType<P> }>): Loader<P> {
  return { promise: importer().then((m) => m.default) };
}

const inViewport = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
};

/**
 * Returns the animated component only if its chunk resolved before the element first became visible.
 * Once the element has been seen with the static value, it stays static: a visible final value is
 * never swapped for an animation that restarts from its initial state.
 */
export function useEarlyAnimation<P, E extends HTMLElement>(loader: Loader<P>):
  [RefObject<E | null>, ComponentType<P> | null] {
  const ref = useRef<E | null>(null);
  const [Comp, setComp] = useState<ComponentType<P> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let settled = false;
    let seen = inViewport(el);
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) seen = true; })
      : null;
    observer?.observe(el);
    void loader.promise.then((C) => {
      if (settled) return;
      settled = true;
      if (!seen && !inViewport(el)) setComp(() => C);
    });
    return () => { settled = true; observer?.disconnect(); };
  }, [loader]);

  return [ref, Comp];
}
