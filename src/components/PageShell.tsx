import type { ReactNode } from 'react';

type Props = { title: string; subtitle: string; children?: ReactNode };

export default function PageShell({ title, subtitle, children }: Props) {
  return (
    <section className="page">
      <h1>{title}</h1>
      <p className="subtitle">{subtitle}</p>
      {children ?? <div className="card placeholder">Nothing here yet.</div>}
    </section>
  );
}
