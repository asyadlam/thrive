import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  title: string;
  subtitle: string;
  back?: { to: string; label: string };
  children?: ReactNode;
};

export default function PageShell({ title, subtitle, back, children }: Props) {
  return (
    <section className="page">
      {back && (
        <Link to={back.to} className="back-link">
          <span aria-hidden="true">‹</span> {back.label}
        </Link>
      )}
      <h1>{title}</h1>
      <p className="subtitle">{subtitle}</p>
      {children ?? <div className="card placeholder">Nothing here yet.</div>}
    </section>
  );
}
