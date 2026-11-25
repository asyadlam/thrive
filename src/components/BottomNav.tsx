import { NavLink, useLocation } from 'react-router-dom';
import { HomeIcon, InfinityIcon, JournalIcon, MyLifeIcon, SproutIcon } from './icons';

const tabs = [
  { to: '/', label: 'Home', end: true, Icon: HomeIcon },
  { to: '/sprout', label: 'Daily Sprout', end: false, Icon: SproutIcon },
  { to: '/journal', label: 'Journal', end: false, Icon: JournalIcon },
  { to: '/growth', label: 'Growth', end: false, Icon: InfinityIcon },
  { to: '/my-life', label: 'My Life', end: false, Icon: MyLifeIcon },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  // Learn lives inside Growth now, so its lesson pages keep the Growth tab lit.
  const inLearn = pathname === '/learn' || pathname.startsWith('/learn/');
  return (
    <nav className="bottom-nav" aria-label="Main">
      {tabs.map(({ to, label, end, Icon }) => (
        <NavLink key={to} to={to} end={end}
          className={({ isActive }) => `nav-item${isActive || (to === '/growth' && inLearn) ? ' active' : ''}`}>
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
