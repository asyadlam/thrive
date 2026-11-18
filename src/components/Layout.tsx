import { Link, NavLink, Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import { GearIcon, HelpIcon } from './icons';

export default function Layout() {
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
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
