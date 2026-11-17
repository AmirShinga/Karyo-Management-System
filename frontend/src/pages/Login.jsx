import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'owner@example.com', password: 'Owner@1234' },
  { label: 'Owner', email: 'owner2@example.com', password: 'Owner@1234' },
  { label: 'Front desk', email: 'desk@example.com', password: 'Desk@1234' },
  { label: 'Restaurant staff', email: 'staff@example.com', password: 'staff@1234' },
];

const FEATURES = [
  { icon: Building2, label: 'Rooms & reservations' },
  { icon: UtensilsCrossed, label: 'Restaurant & orders' },
  { icon: BarChart3, label: 'Finance & reports' },
  { icon: ShieldCheck, label: 'Role-based access' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (credentials) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', credentials);
      const data = res.data.data;
      if (data.mfaRequired) {
        setMfaChallenge(data.challenge);
        setMfaCode('');
        return;
      }
      login(data.token, data.user, data.permissions);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyMfa = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/mfa/verify', { challenge: mfaChallenge, code: mfaCode.trim() });
      const data = res.data.data;
      login(data.token, data.user, data.permissions);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    submit({ email, password });
  };

  const quickLogin = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    submit({ email: account.email, password: account.password });
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-hero">
          <span className="auth-hero-glow auth-hero-glow-1" aria-hidden="true" />
          <span className="auth-hero-glow auth-hero-glow-2" aria-hidden="true" />
          <div className="auth-hero-content">
            <span className="auth-badge">
              <Sparkles size={14} aria-hidden="true" />
              Karyo Guest Palace
            </span>
            <h2>
              Run your hotel <span>beautifully.</span>
            </h2>
            <p>One calm workspace for rooms, bookings, dining, and finance.</p>
            <ul className="auth-features">
              {FEATURES.map((feature) => (
                <li key={feature.label}>
                  <span className="auth-feature-icon">
                    <feature.icon size={16} aria-hidden="true" />
                  </span>
                  {feature.label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <div className="auth-card-head">
              <div className={`auth-logo${mfaChallenge ? '' : ' auth-logo-brand'}`} aria-hidden="true">
                {mfaChallenge ? '🔐' : <img src="/logo.png" alt="" className="auth-logo-img" />}
              </div>
              <h1>{mfaChallenge ? 'Two-step verification' : 'Welcome back'}</h1>
              <p className="text-muted text-sm">
                {mfaChallenge
                  ? 'Enter the 6-digit code from your authenticator app'
                  : 'Sign in to continue to your dashboard'}
              </p>
            </div>

            {error && (
              <div className="alert alert-error auth-alert" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {mfaChallenge ? (
              <form className="auth-form" onSubmit={verifyMfa}>
                <label htmlFor="mfaCode">Authentication code</label>
                <div className="auth-input">
                  <KeyRound size={18} aria-hidden="true" />
                  <input
                    id="mfaCode"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    required
                    autoFocus
                  />
                </div>

                <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
                  {loading ? (
                    <span className="auth-spinner" aria-hidden="true" />
                  ) : (
                    <ShieldCheck size={18} aria-hidden="true" />
                  )}
                  <span>{loading ? 'Verifying…' : 'Verify'}</span>
                </button>

                <button
                  type="button"
                  className="auth-link auth-link-block"
                  onClick={() => {
                    setMfaChallenge(null);
                    setMfaCode('');
                    setError('');
                  }}
                >
                  Back to sign in
                </button>
              </form>
            ) : (
              <>
                <form className="auth-form" onSubmit={onSubmit}>
                  <label htmlFor="email">Email</label>
                  <div className="auth-input">
                    <Mail size={18} aria-hidden="true" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@hotel.com"
                      autoComplete="username"
                      required
                      autoFocus
                    />
                  </div>

                  <label htmlFor="password">Password</label>
                  <div className="auth-input">
                    <Lock size={18} aria-hidden="true" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="auth-eye"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? (
                        <EyeOff size={18} aria-hidden="true" />
                      ) : (
                        <Eye size={18} aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  <div className="auth-row">
                    <Link to="/forgot-password" className="auth-link">
                      Forgot password?
                    </Link>
                  </div>

                  <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
                    {loading ? (
                      <span className="auth-spinner" aria-hidden="true" />
                    ) : (
                      <LogIn size={18} aria-hidden="true" />
                    )}
                    <span>{loading ? 'Signing in…' : 'Sign in'}</span>
                    {!loading && <ArrowRight size={18} className="auth-submit-arrow" aria-hidden="true" />}
                  </button>
                </form>

                {import.meta.env.DEV && (
                  <div className="demo-accounts">
                    <div className="demo-title">Quick sign-in</div>
                    {DEMO_ACCOUNTS.map((account) => (
                      <button
                        key={account.email}
                        type="button"
                        className="demo-chip"
                        onClick={() => quickLogin(account)}
                        disabled={loading}
                      >
                        <span className="demo-role">{account.label}</span>
                        <span className="demo-email">{account.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
