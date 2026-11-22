import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import PetCompanion from './PetCompanion';

type Props = {
  title: string;
  subtitle: string;
  back?: { to: string; label: string };
  /** Show the small companion pet at the top-right, next to the title (main section pages only). */
  pet?: boolean;
  children?: ReactNode;
};

export default function PageShell({ title, subtitle, back, pet, children }: Props) {
  return (
    <section className="page">
      {back && (
        <Link to={back.to} className="back-link">
          <span aria-hidden="true">‹</span> {back.label}
        </Link>
      )}
      {pet ? (
        <div className="page-title-row">
          <div className="page-title-text">
            <h1>{title}</h1>
            <p className="subtitle">{subtitle}</p>
          </div>
          <PetCompanion size="small" />
        </div>
      ) : (
        <>
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>
        </>
      )}
      {children ?? <div className="card placeholder">Nothing here yet.</div>}
    </section>
  );
}
