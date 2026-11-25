import { useEffect, useState } from 'react';

/*
  A tiny "something changed" signal. Writes that happen outside a page (the voice assistant, the one-time move of
  the old To do list) call notifyDataChanged(); pages that show that data re-read it via useDataVersion().
*/
const EVENT = 'thrive:data-changed';

export function notifyDataChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

/** A number that goes up each time data changes: put it in an effect's dependencies to reload. */
export function useDataVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(EVENT, bump);
    return () => window.removeEventListener(EVENT, bump);
  }, []);
  return version;
}
