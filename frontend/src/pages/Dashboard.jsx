import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BedDouble,
  CalendarCheck,
  ClipboardList,
  MessageSquare,
  Receipt,
  ShoppingCart,
  Sparkles,
  Users,
} from 'lucide-react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { money } from '../utils/format';

const QUICK_ACTIONS = [
  {
    to: '/bookings',
    label: 'New booking',
    description: 'Reserve a room and check guests in',
    icon: CalendarCheck,
    perm: 'bookings.view',
  },
  {
    to: '/rooms',
    label: 'Room status',
    description: 'Review availability and maintenance',
    icon: BedDouble,
    perm: 'rooms.view',
  },
  {
    to: '/pos',
    label: 'Take an order',
    description: 'Open the restaurant point of sale',
    icon: ShoppingCart,
    perm: 'orders.create',
  },
  {
    to: '/orders',
    label: 'Recent orders',
    description: 'Track open and paid restaurant orders',
    icon: ClipboardList,
    perm: 'orders.view',
  },
  {
    to: '/expenses',
    label: 'Record expense',
    description: 'Log a new hotel expense',
    icon: Receipt,
    perm: 'expenses.create',
  },
  {
    to: '/complaints',
    label: 'Complaints',
    description: 'Report issues and follow owner responses',
    icon: MessageSquare,
    perm: 'complaints.view',
  },
  {
    to: '/reports',
    label: 'Reports',
    description: 'Revenue, occupancy, and best sellers',
    icon: BarChart3,
    perm: 'reports.view',
  },
  {
    to: '/users',
    label: 'Users',
    description: 'Invite teammates and manage access',
    icon: Users,
    perm: 'users.view',
  },
];

const greetingForHour = (hour) => {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export default function Dashboard() {
  const { user, can, roleLabel } = useAuth();
  const { revision } = useSocket();
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [outstanding, setOutstanding] = useState(null);
  const canSeeOutstanding = can('outstanding.view');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/health')
      .then((res) => {
        if (!cancelled) setHealth(res.data.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canSeeOutstanding) return undefined;
    let cancelled = false;
    const loadOutstanding = async () => {
      try {
        const res = await api.get('/outstanding');
        if (!cancelled) setOutstanding(res.data.meta);
      } catch {
        // Ignore; the health check already surfaces API problems.
      }
    };
    loadOutstanding();
    return () => {
      cancelled = true;
    };
  }, [canSeeOutstanding, revision]);

  const firstName = (user?.name || '').split(' ')[0] || 'there';
  const actions = QUICK_ACTIONS.filter((action) => can(action.perm));
  const apiOnline = health?.status === 'ok';
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div>
      <section className="welcome-banner">
        <span className="welcome-glow welcome-glow-1" aria-hidden="true" />
        <span className="welcome-glow welcome-glow-2" aria-hidden="true" />
        <div className="welcome-content">
          <span className="welcome-badge">
            <Sparkles size={14} aria-hidden="true" />
            {greetingForHour(new Date().getHours())}
          </span>
          <h1>Welcome back, {firstName}</h1>
          <p>
            You are signed in as <strong>{roleLabel(user?.role)}</strong>. Pick up where you left
            off or jump straight to a common task.
          </p>
          <div className="welcome-meta">
            <span className={`welcome-pill${apiOnline ? ' is-online' : ''}`}>
              <Activity size={14} aria-hidden="true" />
              API {health ? (apiOnline ? 'online' : 'degraded') : 'checking…'}
            </span>
            <span className="welcome-pill">
              <CalendarCheck size={14} aria-hidden="true" />
              {today}
            </span>
          </div>
        </div>
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      {canSeeOutstanding && outstanding?.count > 0 && (
        <div className="outstanding-alert" role="alert">
          <span className="outstanding-alert-icon" aria-hidden="true">
            <AlertTriangle size={22} />
          </span>
          <div className="outstanding-alert-body">
            <strong>Outstanding payments need attention</strong>
            <p>
              {outstanding.count} unpaid {outstanding.count === 1 ? 'record' : 'records'} totaling{' '}
              <strong>{money(outstanding.totalOutstanding)}</strong>.
            </p>
            <div className="outstanding-alert-breakdown">
              <span>Bookings: {money(outstanding.bookingOutstanding)}</span>
              <span>Orders: {money(outstanding.orderOutstanding)}</span>
            </div>
            <Link to="/outstanding" className="outstanding-alert-link">
              Review outstanding payments
            </Link>
          </div>
        </div>
      )}

      <div className="grid dashboard-stats">
        <div className="card stat">
          <span className="stat-label">System status</span>
          <span className="stat-value">{health ? (apiOnline ? 'Online' : 'Degraded') : 'Checking…'}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Your role</span>
          <span className="stat-value">{roleLabel(user?.role)}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Available shortcuts</span>
          <span className="stat-value">{actions.length}</span>
        </div>
      </div>

      <section className="dashboard-section">
        <div className="section-heading">
          <h2>Quick actions</h2>
          <p className="muted">Jump straight to the tasks you use most.</p>
        </div>

        <div className="quick-grid">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.to} to={action.to} className="quick-card">
                <span className="quick-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="quick-body">
                  <span className="quick-title">{action.label}</span>
                  <span className="quick-desc">{action.description}</span>
                </span>
                <ArrowRight size={18} className="quick-arrow" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
