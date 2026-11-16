import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  BarChart3,
  BedDouble,
  Boxes,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  Clock,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Tags,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Operations',
    items: [
      { to: '/rooms', label: 'Rooms', icon: BedDouble, perm: 'rooms.view' },
      { to: '/bookings', label: 'Bookings', icon: CalendarCheck, perm: 'bookings.view' },
      { to: '/maintenance', label: 'Maintenance', icon: Wrench, perm: 'maintenance.view' },
      { to: '/menu', label: 'Menu', icon: UtensilsCrossed, perm: 'menu.view' },
      { to: '/categories', label: 'Categories', icon: Tags, perm: 'categories.view' },
      { to: '/pos', label: 'POS', icon: ShoppingCart, perm: 'orders.create' },
      { to: '/orders', label: 'Orders', icon: ClipboardList, perm: 'orders.view' },
      { to: '/complaints', label: 'Complaints', icon: MessageSquare, perm: 'complaints.view' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Boxes, perm: 'inventory.view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/income', label: 'Income', icon: Wallet, perm: 'income.view' },
      { to: '/expenses', label: 'Expenses', icon: Receipt, perm: 'expenses.view' },
      {
        to: '/outstanding',
        label: 'Outstanding',
        icon: Clock,
        perm: 'outstanding.view',
      },
      { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/staff', label: 'Staff', icon: Users, perm: 'staff.view' },
      { to: '/users', label: 'Users', icon: UserCog, perm: 'users.view' },
      { to: '/security', label: 'Security', icon: Lock },
      { to: '/permissions', label: 'Permissions', icon: ShieldCheck, adminOnly: true },
    ],
  },
];

const PAGE_TITLES = Object.fromEntries(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.to, item.label]))
);

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

export default function Layout() {
  const { user, can, logout, roleLabel } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const title = PAGE_TITLES[location.pathname] || 'Dashboard';

  const hasPerm = (perm) => {
    if (!perm) return true;
    const codes = Array.isArray(perm) ? perm : [perm];
    return codes.some((code) => can(code));
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar${sidebarOpen ? ' is-open' : ''}`} aria-label="Sidebar">
        <button
          type="button"
          className="icon-btn sidebar-close"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>

        <Link to="/" className="sidebar-brand" onClick={() => setSidebarOpen(false)}>
          <span className="brand-icon">🏨</span>
          <span className="sidebar-brand-text">
            <span className="sidebar-brand-title">Grand Stay</span>
            <span className="sidebar-brand-sub">Hotel Management</span>
          </span>
        </Link>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(
              (item) =>
                hasPerm(item.perm) &&
                (!item.adminOnly || user?.role === 'admin')
            );
            if (!items.length) return null;
            return (
              <div className="sidebar-group" key={group.label}>
                <span className="sidebar-section">{group.label}</span>
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}
                    >
                      <span className="side-icon">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="side-label">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-footer-text">Signed in as</span>
          <span className="sidebar-footer-user">{user?.name}</span>
          <span className="sidebar-footer-role">{roleLabel(user?.role)}</span>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
          >
            <Menu size={20} />
          </button>

          <div className="topbar-breadcrumb">
            <span className="crumb-label">Hotel Management</span>
            <ChevronRight size={14} aria-hidden="true" />
            <span className="topbar-title">{title}</span>
          </div>

          <div className="topbar-actions">
            <div className="profile-chip">
              <span className="profile-avatar">{initials(user?.name)}</span>
              <span className="profile-text">
                <span className="profile-name">{user?.name}</span>
                <span className="profile-role">{roleLabel(user?.role)}</span>
              </span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="icon-btn"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="icon-btn icon-btn-danger"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
