import { useEffect, useRef, useState } from 'react';

const FADE_MS = 150; // fade out, swap, fade in: ~300ms in total

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Cross-fade between values: when `value` changes, the old content fades out, the new
 * content is swapped in, then it fades back in. Returns what to show and whether it's faded.
 * With reduced motion on, the new value just appears.
 */
export function useCrossFade<T>(value: T, sameAs: (a: T, b: T) => boolean = Object.is): { shown: T; faded: boolean } {
  const [shown, setShown] = useState(value);
  const [faded, setFaded] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    if (sameAs(value, shown)) return;
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    setFaded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setShown(value);
      setFaded(false);
    }, FADE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { shown, faded };
}
