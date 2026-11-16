import { useRef, useState } from 'react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import usePagedResource from '../hooks/usePagedResource';
import useFocusTrap from '../hooks/useFocusTrap';
import Pagination, { SearchInput } from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';

const emptyForm = { name: '', email: '', phone: '', password: '', role: 'hotel' };

export default function Users() {
  const { can, roles, roleLabel, user: currentUser } = useAuth();
  const canManage = can('users.manage');
  const canChangePassword = can('users.password');
  const showActions = canManage || canChangePassword;
  const list = usePagedResource('/auth/users', { initialLimit: 20 });
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordFor, setPasswordFor] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const pwRef = useRef(null);

  useFocusTrap(!!passwordFor, pwRef, () => {
    setPasswordFor(null);
    setNewPassword('');
    setPwError('');
  });

  const load = list.reload;

  const onCreate = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await api.post('/auth/users', form);
      setForm(emptyForm);
      setNotice('User created.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.patch(`/auth/users/${u.id}`, { active: !u.active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const changeRole = async (u, role) => {
    setError('');
    setNotice('');
    try {
      await api.patch(`/auth/users/${u.id}`, { role });
      setNotice(`${u.name} is now ${roleLabel(role)}.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`Delete ${u.name} (${u.email})? They will no longer be able to sign in.`)) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/auth/users/${u.id}`);
      setNotice(`${u.name} was deleted.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const openPassword = (u) => {
    setPwError('');
    setNewPassword('');
    setPasswordFor(u);
  };

  const closePassword = () => {
    setPasswordFor(null);
    setNewPassword('');
    setPwError('');
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (pwBusy || !passwordFor) return;
    setPwBusy(true);
    setPwError('');
    try {
      await api.patch(`/auth/users/${passwordFor.id}/password`, { password: newPassword });
      setNotice(`Password updated for ${passwordFor.name}. Their sessions were signed out.`);
      closePassword();
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="page-head-sub">Accounts that can sign in to the system.</p>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {canManage && (
        <div className="card">
          <h2>Create user</h2>
          <form className="form-row" onSubmit={onCreate}>
            <input
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <input
              placeholder="Phone (optional)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roles.map((role) => (
                <option key={role.code} value={role.code}>
                  {roleLabel(role.code)}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Create'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-filters">
            <SearchInput
              value={list.filters.search || ''}
              onChange={(v) => list.setFilter({ search: v })}
              placeholder="Search name, email or phone"
              loading={list.loading}
            />
          </div>
        </div>
        <div className="table-responsive">
          {list.loading && !list.rows.length ? (
            <TableSkeleton rows={6} cols={showActions ? 5 : 4} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  {showActions && <th></th>}
                </tr>
              </thead>
              <tbody>
                {list.rows.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      {canManage ? (
                        <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                          {roles.map((role) => (
                            <option key={role.code} value={role.code}>
                              {roleLabel(role.code)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        roleLabel(u.role)
                      )}
                    </td>
                    <td>
                      <span className={u.active ? 'badge badge-ok' : 'badge badge-off'}>
                        {u.active ? 'active' : 'disabled'}
                      </span>
                    </td>
                    {showActions && (
                      <td className="row-actions">
                        {canChangePassword && (
                          <button className="btn btn-ghost" onClick={() => openPassword(u)}>
                            Password
                          </button>
                        )}
                        {canManage && (
                          <button className="btn btn-ghost" onClick={() => toggleActive(u)}>
                            {u.active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                        {canManage && currentUser?.id !== u.id && (
                          <button className="btn btn-ghost" onClick={() => deleteUser(u)}>
                            Delete
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {!list.rows.length && (
                  <tr>
                    <td colSpan={showActions ? 5 : 4} className="muted">
                      No users yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <Pagination
          page={list.page}
          pages={list.meta.pages}
          total={list.meta.total}
          limit={list.limit}
          onPage={list.setPage}
          onLimitChange={list.setLimit}
          loading={list.loading}
        />
      </div>

      {passwordFor && (
        <div className="drawer-overlay" onClick={closePassword}>
          <div
            className="drawer"
            ref={pwRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Change password for ${passwordFor.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <h2>Change password</h2>
              <button className="btn btn-ghost" onClick={closePassword} aria-label="Close">
                Close
              </button>
            </div>
            <form className="drawer-body" onSubmit={submitPassword}>
              <p className="muted">
                Set a new password for <strong>{passwordFor.name}</strong> ({passwordFor.email}). Their
                active sessions will be signed out.
              </p>
              <label>
                New password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 10 characters"
                  autoComplete="new-password"
                  required
                />
              </label>
              <p className="muted">
                Must be 10+ characters with upper, lower, number and symbol.
              </p>
              {pwError && (
                <div className="alert alert-error" role="alert">
                  {pwError}
                </div>
              )}
              <div className="drawer-footer">
                <button type="button" className="btn btn-ghost" onClick={closePassword}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={pwBusy}>
                  {pwBusy ? 'Saving…' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
