import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';

const toSets = (matrix) =>
  Object.fromEntries(Object.entries(matrix).map(([role, codes]) => [role, new Set(codes)]));

export default function Permissions() {
  const { roleLabel, refreshRoles } = useAuth();
  const [permissions, setPermissions] = useState([]);
  const [editableRoles, setEditableRoles] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [dirty, setDirty] = useState(() => new Set());
  const [roleForm, setRoleForm] = useState({ label: '', code: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const applyData = useCallback((data) => {
    setPermissions(data.permissions);
    setEditableRoles(data.editableRoles);
    setMatrix(toSets(data.matrix));
    setDirty(new Set());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.get('/permissions');
      applyData(res.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [applyData]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/permissions')
      .then((res) => {
        if (!cancelled) applyData(res.data.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyData]);

  const modules = useMemo(() => {
    const grouped = new Map();
    for (const permission of permissions) {
      if (!grouped.has(permission.module)) grouped.set(permission.module, []);
      grouped.get(permission.module).push(permission);
    }
    return [...grouped.entries()];
  }, [permissions]);

  const columns = [...editableRoles, 'admin'];

  const toggle = (role, code) => {
    if (!editableRoles.includes(role)) return;
    setMatrix((prev) => {
      const next = new Set(prev[role] || []);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { ...prev, [role]: next };
    });
    setDirty((prev) => new Set(prev).add(role));
    setNotice('');
  };

  const save = async () => {
    if (!dirty.size) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      for (const role of dirty) {
        await api.put(`/permissions/${role}`, { permissions: [...(matrix[role] || [])] });
      }
      setDirty(new Set());
      setNotice('Permissions saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createRole = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setNotice('');
    try {
      const payload = { label: roleForm.label.trim() };
      if (roleForm.code.trim()) payload.code = roleForm.code.trim();
      await api.post('/roles', payload);
      const label = payload.label;
      setRoleForm({ label: '', code: '' });
      await refreshRoles();
      await load();
      setNotice(`Role "${label}" created. Assign its permissions below.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1>Permissions</h1>
      <p className="muted">
        Create roles and choose what each role can access. The admin role always has full access.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card">
        <h2>Create role</h2>
        <form className="form-row" onSubmit={createRole}>
          <input
            placeholder="Role name (e.g. Maintenance)"
            value={roleForm.label}
            onChange={(e) => setRoleForm({ ...roleForm, label: e.target.value })}
            required
          />
          <input
            placeholder="Role key (optional, e.g. maintenance)"
            value={roleForm.code}
            onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })}
          />
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create role'}
          </button>
        </form>
        <p className="muted small">
          Role keys use lowercase letters, numbers and underscores. A key is generated from the
          name when left blank.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Role permissions</h2>
          <div className="row-actions">
            {dirty.size > 0 && <span className="muted small">Unsaved changes</span>}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={load}
              disabled={saving || !dirty.size}
            >
              Discard
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={saving || !dirty.size}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

        <div className="perm-matrix-wrap">
          <table className="table perm-matrix">
            <thead>
              <tr>
                <th>Permission</th>
                {columns.map((role) => (
                  <th key={role} className="perm-cell">
                    {roleLabel(role)}
                    {dirty.has(role) && <span className="perm-dirty"> •</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={columns.length + 1} className="muted">
                    Loading permissions…
                  </td>
                </tr>
              )}
              {!loading &&
                modules.map(([module, items]) => (
                  <Fragment key={module}>
                    <tr className="perm-module-row">
                      <td colSpan={columns.length + 1}>{module}</td>
                    </tr>
                    {items.map((permission) => (
                      <tr key={permission.code}>
                        <td>
                          <span className="perm-label">{permission.label}</span>
                          <span className="perm-code">{permission.code}</span>
                        </td>
                        {columns.map((role) => (
                          <td key={role} className="perm-cell">
                            <input
                              type="checkbox"
                              checked={matrix[role]?.has(permission.code) || false}
                              disabled={role === 'admin' || saving}
                              onChange={() => toggle(role, permission.code)}
                              aria-label={`${roleLabel(role)}: ${permission.label}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              {!loading && !modules.length && (
                <tr>
                  <td colSpan={columns.length + 1} className="muted">
                    No permissions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
