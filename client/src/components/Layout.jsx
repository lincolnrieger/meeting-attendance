/** Application shell: sidebar navigation + main content area. */
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, CalendarDays, LayoutDashboard, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import { useAuth } from '../App';
import { initials, useAppSettings } from '../lib/settings';

const navItems = (t) => [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/participants', label: t.Participants, icon: Users },
  { to: '/meetings', label: t.Events, icon: CalendarDays },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useAppSettings();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">{initials(t.org)}</span>
          <div className="brand-text">
            <div className="brand-name">{t.org}</div>
            <div className="brand-sub">Attendance register</div>
          </div>
          <button className="icon-btn nav-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="nav">
          {navItems(t).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={17} strokeWidth={1.75} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user">
            <span className="user-name">{user?.display_name}</span>
            <span className="user-sub">{user?.username}</span>
          </div>
          <button className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <div className="topbar">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <span className="topbar-title">{t.org}</span>
        </div>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
