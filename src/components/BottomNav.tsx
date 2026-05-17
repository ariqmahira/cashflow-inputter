import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/add', label: 'Add', icon: '＋' },
  { to: '/recent', label: 'Recent', icon: '⏱' },
  { to: '/overview', label: 'Overview', icon: '▦' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 pb-[env(safe-area-inset-bottom)]">
      <ul className="flex">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                `flex flex-col items-center py-3 text-xs ${
                  isActive ? 'text-brand-accent' : 'text-slate-400'
                }`
              }
            >
              <span className="text-xl leading-none mb-1">{tab.icon}</span>
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
