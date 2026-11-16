import { useState } from 'react';
import api from '../api/api';
import { money, formatDate } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import usePagedResource from '../hooks/usePagedResource';
import Pagination, { SearchInput } from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';

const emptyForm = { fullName: '', position: 'staff', phone: '', salary: '', hireDate: '' };

export default function Staff() {
  const { can } = useAuth();
  const canManage = can('staff.manage');
  const list = usePagedResource('/staff', { initialLimit: 20 });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    const payload = {
      fullName: form.fullName,
      position: form.position,
      phone: form.phone || null,
      salary: Number(form.salary) || 0,
      hireDate: form.hireDate || null,
    };
    try {
      if (editingId) {
        await api.put(`/staff/${editingId}`, payload);
        setNotice('Staff updated.');
      } else {
        await api.post('/staff', payload);
        setNotice('Staff added.');
      }
      resetForm();
      await list.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setForm({
      fullName: s.fullName,
      position: s.position,
      phone: s.phone || '',
      salary: s.salary,
      hireDate: s.hireDate ? String(s.hireDate).slice(0, 10) : '',
    });
  };

  const toggleActive = async (s) => {
    try {
      await api.put(`/staff/${s.id}`, { active: !s.active });
      await list.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Remove ${s.fullName}?`)) return;
    try {
      await api.delete(`/staff/${s.id}`);
      await list.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Staff</h1>
          <p className="page-head-sub">Manage hotel employees and their records.</p>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {canManage && (
        <div className="card">
          <h2>{editingId ? 'Edit staff' : 'Add staff'}</h2>
          <form className="form-row" onSubmit={onSubmit}>
            <input
              placeholder="Full name"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
            <input
              placeholder="Position"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Salary (monthly)"
              value={form.salary}
              onChange={(e) => setForm({ ...form, salary: e.target.value })}
            />
            <input
              type="date"
              value={form.hireDate}
              onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
            />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {editingId ? 'Save' : 'Add'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-ghost" onClick={resetForm}>
                Cancel
              </button>
            )}
          </form>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-filters">
            <SearchInput
              value={list.filters.search || ''}
              onChange={(v) => list.setFilter({ search: v })}
              placeholder="Search name, position, phone"
              loading={list.loading}
            />
            <select
              value={list.filters.active || ''}
              onChange={(e) => list.setFilter({ active: e.target.value })}
              aria-label="Filter by status"
            >
              <option value="">All staff</option>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          {list.loading && !list.rows.length ? (
            <TableSkeleton rows={6} cols={6} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Position</th>
                  <th>Phone</th>
                  <th>Salary</th>
                  <th>Hired</th>
                  <th>Status</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {list.rows.map((s) => (
                  <tr key={s.id}>
                    <td>{s.fullName}</td>
                    <td>{s.position}</td>
                    <td>{s.phone || '—'}</td>
                    <td>{money(s.salary)}</td>
                    <td>{formatDate(s.hireDate)}</td>
                    <td>
                      <span className={s.active ? 'badge badge-ok' : 'badge badge-off'}>
                        {s.active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="row-actions">
                        <button className="btn btn-ghost" onClick={() => startEdit(s)}>
                          Edit
                        </button>
                        <button className="btn btn-ghost" onClick={() => toggleActive(s)}>
                          {s.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn-ghost danger" onClick={() => remove(s)}>
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!list.rows.length && (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="muted">
                      No staff records.
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
    </div>
  );
}
