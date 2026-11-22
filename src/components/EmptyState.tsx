import type { ReactNode } from 'react';

/** A gentle "nothing here yet" message. */
export default function EmptyState({ children }: { children: ReactNode }) {
  return <div className="card placeholder">{children}</div>;
}
