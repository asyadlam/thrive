import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import NewDevicePrompt from './NewDevicePrompt';
import { GearIcon, HelpIcon } from './icons';

/** Which page this is, for the fade. "/journal/talk/<id>" counts as "/journal/talk" (saving a new page adds the id). */
const pageKey = (path: string) =>
  path.startsWith('/journal/talk')
    ? '/journal/talk'
    : path.startsWith('/journal/dreams/talk')
      ? '/journal/dreams/talk'
      : path;

export default function Layout() {
  const { pathname } = useLocation();

  // Start each new screen at the top instead of keeping the last screen's scroll position.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          <img src="/logo-wordmark.png" alt="Thrive" className="brand-logo" width={77} height={30} />
        </Link>
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
        {/* keyed by page so the soft fade-in plays each time you switch pages. Saving a
            new "Need to talk" page moves /journal/talk → /journal/talk/<id>, which is treated as the
            same page (it keeps its state and doesn't fade again). */}
        <div key={pageKey(pathname)} className="page-fade">
          <Outlet />
        </div>
      </main>
      <NewDevicePrompt />
      <BottomNav />
    </div>
  );
}
