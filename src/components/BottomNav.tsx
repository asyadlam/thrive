import { NavLink } from 'react-router-dom';
import { GrowthIcon, HomeIcon, JournalIcon, LearnIcon, MyLifeIcon } from './icons';

const tabs = [
  { to: '/', label: 'Home', end: true, Icon: HomeIcon },
  { to: '/journal', label: 'Journal', end: false, Icon: JournalIcon },
  { to: '/growth', label: 'Growth', end: false, Icon: GrowthIcon },
  { to: '/my-life', label: 'My Life', end: false, Icon: MyLifeIcon },
  { to: '/learn', label: 'Learn', end: false, Icon: LearnIcon },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {tabs.map(({ to, label, end, Icon }) => (
        <NavLink key={to} to={to} end={end}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
