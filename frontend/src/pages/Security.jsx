import { useState } from 'react';
import api from '../api/api';

export default function Security() {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [pwBusy, setPwBusy] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwBusy) return;
    setPwBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post('/auth/change-password', pwForm);
      setPwForm({ currentPassword: '', newPassword: '' });
      setNotice('Password updated. Other sessions were signed out.');
    } catch (err) {
      setError(err.message);
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Security</h1>
          <p className="page-head-sub">Manage your account password.</p>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <div className="card" style={{ maxWidth: '520px' }}>
        <h2>Change password</h2>
        <form className="form-grid" onSubmit={changePassword}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="pw-current">Current password</label>
            <input id="pw-current" type="password" autoComplete="current-password" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} required />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="pw-new">New password</label>
            <input id="pw-new" type="password" autoComplete="new-password" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} required />
            <span className="text-muted text-sm">At least 10 characters with upper, lower, number and symbol.</span>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={pwBusy}>{pwBusy ? 'Updating…' : 'Update password'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
