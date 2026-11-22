import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import { GearIcon, HelpIcon } from './icons';

/** e.g. "/journal/talk/talk-123" → "/journal/talk" */
const pageKey = (path: string) => '/' + path.split('/').filter(Boolean).slice(0, 2).join('/');

export default function Layout() {
  const { pathname } = useLocation();

  // Start each new screen at the top instead of keeping the last screen's scroll position.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">Thrive</Link>
        <div className="header-actions">
          <NavLink to="/help" className="help-button">
            <HelpIcon />
            <span>Get Help</span>
          </NavLink>
          <NavLink to="/settings" className="icon-button" aria-label="Settings" title="Settings">
            <GearIcon />
          </NavLink>
        </div>
      </header>
      <main className="app-main">
        {/* keyed by page so the soft fade-in plays each time you switch pages. Only the first two
            parts of the address count, so e.g. /journal/talk → /journal/talk/<id> after saving a
            new page is treated as the same page (it keeps its state and doesn't fade again). */}
        <div key={pageKey(pathname)} className="page-fade">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
