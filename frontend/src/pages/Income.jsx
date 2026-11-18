import { useEffect, useState } from 'react';
import api from '../api/api';
import { money, formatDate } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import PaymentSplitFields from '../components/PaymentSplitFields';
import { PAYMENT_LABEL, emptyPaymentRow, toPaymentPayload } from '../utils/payments';
import usePagedResource from '../hooks/usePagedResource';
import Pagination, { SearchInput } from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';

const SOURCE_LABEL = { room: 'Room', restaurant: 'Restaurant', other: 'Other' };

export default function Income() {
  const { can } = useAuth();
  const { revision } = useSocket();
  const canCreate = can('income.create');
  const list = usePagedResource('/income', { initialLimit: 20 });
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({
    source: 'other',
    description: '',
    amount: '',
    incomeDate: '',
    payments: [emptyPaymentRow()],
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
        const res = await api.get(`/income/summary?${params.toString()}`);
        if (!cancelled) setSummary(res.data.data);
      } catch {
        // Summary is non-critical.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, revision]);

  const onAmountChange = (value) => {
    setForm((prev) => {
      const only = prev.payments[0];
      const autoUpdate =
        prev.payments.length === 1 &&
        (!only.amount || Number(only.amount) === Number(prev.amount));
      return {
        ...prev,
        amount: value,
        payments: autoUpdate ? [{ ...only, amount: value }] : prev.payments,
      };
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const payments = toPaymentPayload(form.payments);
      await api.post('/income', {
        source: form.source,
        description: form.description || null,
        amount: Number(form.amount),
        incomeDate: form.incomeDate || undefined,
        payments: payments.length ? payments : undefined,
      });
      setForm({
        source: 'other',
        description: '',
        amount: '',
        incomeDate: '',
        payments: [emptyPaymentRow()],
      });
      setNotice('Income recorded.');
      await list.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Income</h1>
          <p className="page-head-sub">All money received, by source and payment method.</p>
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
          {Object.entries(summary.bySource).map(([src, v]) => (
            <div className="card stat" key={src}>
              <span className="stat-label">{SOURCE_LABEL[src] || src}</span>
              <span className="stat-value">{money(v.total)}</span>
            </div>
          ))}
        </div>
      )}

      {canCreate && (
        <div className="card">
          <h2>Record income</h2>
          <form className="form-row" onSubmit={onSubmit}>
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              <option value="other">Other</option>
              <option value="room">Room</option>
              <option value="restaurant">Restaurant</option>
            </select>
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
              onChange={(e) => onAmountChange(e.target.value)}
              required
            />
            <input
              type="date"
              value={form.incomeDate}
              onChange={(e) => setForm({ ...form, incomeDate: e.target.value })}
            />
            <div className="payment-block">
              <label>Payment</label>
              <PaymentSplitFields
                value={form.payments}
                onChange={(payments) => setForm({ ...form, payments })}
                expectedTotal={form.amount ? Number(form.amount) : null}
                disabled={loading}
              />
            </div>
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
              placeholder="Search description or user"
              loading={list.loading}
            />
            <select value={list.filters.source || ''} onChange={(e) => list.setFilter({ source: e.target.value })} aria-label="Filter by source">
              <option value="">All sources</option>
              <option value="room">Room</option>
              <option value="restaurant">Restaurant</option>
              <option value="other">Other</option>
            </select>
            <input type="date" value={from} onChange={(e) => list.setFilter({ from: e.target.value })} aria-label="From date" />
            <input type="date" value={to} onChange={(e) => list.setFilter({ to: e.target.value })} aria-label="To date" />
          </div>
        </div>

        <div className="table-responsive">
          {list.loading && !list.rows.length ? (
            <TableSkeleton rows={6} cols={6} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Description</th>
                  <th>Recorded by</th>
                  <th>Payment</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.incomeDate)}</td>
                    <td>{SOURCE_LABEL[r.source] || r.source}</td>
                    <td>{r.description || '—'}</td>
                    <td>{r.recorderName || '—'}</td>
                    <td>
                      {PAYMENT_LABEL[r.paymentMethod] || r.paymentMethod || '—'}
                      {(r.paymentSplits || []).length > 1 && (
                        <div className="cell-detail">
                          {r.paymentSplits
                            .map((split) => `${PAYMENT_LABEL[split.method] || split.method} ${money(split.amount)}`)
                            .join(' + ')}
                        </div>
                      )}
                    </td>
                    <td>{money(r.amount)}</td>
                  </tr>
                ))}
                {!list.rows.length && (
                  <tr>
                    <td colSpan="6" className="muted">
                      No income records.
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
