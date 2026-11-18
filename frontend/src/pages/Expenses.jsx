import { useEffect, useState } from 'react';
import api from '../api/api';
import { money, formatDate } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import usePagedResource from '../hooks/usePagedResource';
import Pagination, { SearchInput } from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';

export default function Expenses() {
  const { can } = useAuth();
  const { revision } = useSocket();
  const canCreate = can('expenses.create');
  const canDelete = can('expenses.delete');
  const list = usePagedResource('/expenses', { initialLimit: 20 });
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({
    category: 'general',
    description: '',
    amount: '',
    expenseDate: '',
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const { from = '', to = '' } = list.filters;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const res = await api.get(`/expenses/summary?${params.toString()}`);
        if (!cancelled) setSummary(res.data.data);
      } catch {
        // Summary is non-critical.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, revision]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await api.post('/expenses', {
        category: form.category,
        description: form.description || null,
        amount: Number(form.amount),
        expenseDate: form.expenseDate || undefined,
      });
      setForm({
        category: 'general',
        description: '',
        amount: '',
        expenseDate: '',
      });
      setNotice('Expense recorded.');
      await list.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await api.delete(`/expenses/${row.id}`);
      await list.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Expenses</h1>
          <p className="page-head-sub">Operational costs by category.</p>
        </div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {summary && (
        <div className="grid">
          <div className="card stat">
            <span className="stat-label">Total (filtered)</span>
            <span className="stat-value">{money(summary.total)}</span>
          </div>
          {summary.byCategory.slice(0, 3).map((c) => (
            <div className="card stat" key={c.category}>
              <span className="stat-label">{c.category}</span>
              <span className="stat-value">{money(c.total)}</span>
            </div>
          ))}
        </div>
      )}

      {canCreate && (
        <div className="card">
          <h2>Record expense</h2>
          <form className="form-row" onSubmit={onSubmit}>
            <input
              placeholder="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <input
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
            <input
              type="date"
              value={form.expenseDate}
              onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
            />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Add'}
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
              placeholder="Search description or category"
              loading={list.loading}
            />
            <input
              placeholder="Filter category"
              value={list.filters.category || ''}
              onChange={(e) => list.setFilter({ category: e.target.value })}
              aria-label="Filter by category"
            />
            <input type="date" value={from} onChange={(e) => list.setFilter({ from: e.target.value })} aria-label="From date" />
            <input type="date" value={to} onChange={(e) => list.setFilter({ to: e.target.value })} aria-label="To date" />
          </div>
        </div>

        <div className="table-responsive">
          {list.loading && !list.rows.length ? (
            <TableSkeleton rows={6} cols={canDelete ? 6 : 5} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Recorded by</th>
                  <th>Amount</th>
                  {canDelete && <th></th>}
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.expenseDate)}</td>
                    <td>{r.category}</td>
                    <td>{r.description || '—'}</td>
                    <td>{r.recorderName || '—'}</td>
                    <td>{money(r.amount)}</td>
                    {canDelete && (
                      <td className="row-actions">
                        <button className="btn btn-ghost danger" onClick={() => remove(r)}>
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!list.rows.length && (
                  <tr>
                    <td colSpan={canDelete ? 6 : 5} className="muted">
                      No expenses recorded.
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
