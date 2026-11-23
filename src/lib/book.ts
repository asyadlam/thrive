import { useLocation } from 'react-router-dom';
import type { Book } from './journal';

/*
  The Journal tab holds two kinds of writing that work the same way: the regular journal (/journal/...) and
  Dreams & Nightmares (/journal/dreams/...), a section at the bottom of the Journal tab. Pages read which one
  they're in from the address, so the same page code serves both while their entries stay in separate stores.
*/
export const DREAMS_BASE = '/journal/dreams';

export type BookInfo = {
  book: Book;
  /** Where this journal's pages live: "/journal" or "/journal/dreams". */
  base: string;
  /** Where "back" goes from a new page: the Journal tab (scrolled to Dreams & Nightmares for dreams). */
  home: { to: string; label: string };
  /** What a free-writing page is called ("Journal page" / "Dream"). */
  page: string;
  /** The writing page's title. */
  writeTitle: string;
};

const JOURNAL: BookInfo = {
  book: 'journal',
  base: '/journal',
  home: { to: '/journal', label: 'Journal' },
  page: 'Journal page',
  writeTitle: 'Need to talk about it',
};
const DREAMS: BookInfo = {
  book: 'dreams',
  base: DREAMS_BASE,
  home: { to: '/journal?section=dreams', label: 'Journal' },
  page: 'Dream',
  writeTitle: 'Dreams & Nightmares',
};

export const isDreamsPath = (path: string) => path === DREAMS_BASE || path.startsWith(`${DREAMS_BASE}/`);

export function useBook(): BookInfo {
  return isDreamsPath(useLocation().pathname) ? DREAMS : JOURNAL;
}
