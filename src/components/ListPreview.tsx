/*
  Shared bits for list sections that show a short preview on their section page
  (Growth, My Life) and the whole list on their own "See more" page.
*/
import { useEffect, type RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

/** How many items a section page shows before "See more". */
export const PREVIEW_COUNT = 3;

/** The items to show: all of them on the full page, otherwise just the first few. */
export const previewOf = <T,>(items: T[], full: boolean): T[] => (full ? items : items.slice(0, PREVIEW_COUNT));

/** Most recently created first (display order only; nothing is saved). */
export const newestFirst = <T extends { createdAt: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** The "See more" link under a preview; it opens the list's own page. */
export function SeeMore({ to, label = 'See more', a11yLabel }: { to: string; label?: string; a11yLabel?: string }) {
  return (
    <Link to={to} className="see-more" aria-label={a11yLabel}>
      {label} <span aria-hidden="true">›</span>
    </Link>
  );
}

/** Coming back from a full list page (?section=<name>) scrolls the section page to that section. */
export function useSectionAnchor(name: string, ref: RefObject<HTMLElement>) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('section') !== name) return;
    setParams({}, { replace: true });
    scrollToSection(ref);
  }, [name, params, setParams, ref]);
}

/**
 * Scroll a section into view. The sections above it are still loading for a moment (which moves it
 * down), so keep it in place for ~0.7s, unless the user starts scrolling themselves.
 */
export function scrollToSection(ref: RefObject<HTMLElement>) {
  let stopped = false;
  const stop = () => (stopped = true);
  const opts = { once: true, passive: true } as const;
  window.addEventListener('touchstart', stop, opts);
  window.addEventListener('wheel', stop, opts);
  window.addEventListener('keydown', stop, opts);
  const end = performance.now() + 700;
  const tick = () => {
    if (stopped || !ref.current) return;
    ref.current.scrollIntoView({ block: 'start' });
    if (performance.now() < end) requestAnimationFrame(tick);
    else stop();
  };
  requestAnimationFrame(tick);
}
