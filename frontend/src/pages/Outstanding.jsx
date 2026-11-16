import { useEffect, useState } from 'react';
import api from '../api/api';
import { money, formatDate } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import PaymentSplitFields from '../components/PaymentSplitFields';
import { PAYMENT_LABEL, emptyPaymentRow, paymentTotal, toPaymentPayload } from '../utils/payments';

const TYPE_LABEL = { booking: 'Booking', order: 'Order' };

export default function Outstanding() {
  const { can } = useAuth();
  const canPayBookings = can('bookings.checkout');
  const canPayOrders = can('orders.create');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [type, setType] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [paymentRows, setPaymentRows] = useState([]);

  const load = async () => {
    const res = await api.get('/outstanding');
    setItems(res.data.data);
    setSummary(res.data.meta);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/outstanding');
        if (!cancelled) {
          setItems(res.data.data);
          setSummary(res.data.meta);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSelected(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [selected]);

  const visibleItems = type ? items.filter((item) => item.type === type) : items;

  const openPayment = (item) => {
    setError('');
    setNotice('');
    setSelected(item);
    setPaymentRows([emptyPaymentRow(Number(item.balance).toFixed(2))]);
  };

  const closePayment = () => {
    setSelected(null);
    setPaymentRows([]);
  };

  const canPaySelected = selected
    ? selected.type === 'booking'
      ? canPayBookings
      : canPayOrders
    : false;

  const paymentValid =
    paymentTotal(paymentRows) > 0 &&
    paymentTotal(paymentRows) <= Number(selected?.balance || 0) + 0.009;

  const isPartial = selected
    ? paymentTotal(paymentRows) < Number(selected.balance) - 0.009
    : false;

  const confirmPayment = async () => {
    if (!selected) return;
    const payments = toPaymentPayload(paymentRows);
    const totalPaid = paymentTotal(paymentRows);
    if (totalPaid <= 0) {
      setError('Enter a payment amount');
      return;
    }
    if (totalPaid > Number(selected.balance) + 0.009) {
      setError('Payment cannot exceed the outstanding balance');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const path =
        selected.type === 'booking'
          ? `/bookings/${selected.id}/payments`
          : `/orders/${selected.id}/complete-payment`;
      await api.patch(path, { payments });
      setNotice(
        totalPaid >= Number(selected.balance) - 0.009
          ? `Payment completed for ${selected.reference}.`
          : `Partial payment recorded for ${selected.reference}.`
      );
      closePayment();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Outstanding payments</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {summary && (
        <div className="grid">
          <div className="card stat">
            <span className="stat-label">Pending records</span>
            <span className="stat-value">{summary.count}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Total outstanding</span>
            <span className="stat-value">{money(summary.totalOutstanding)}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Bookings</span>
            <span className="stat-value">{money(summary.bookingOutstanding)}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Orders</span>
            <span className="stat-value">{money(summary.orderOutstanding)}</span>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Awaiting payment</h2>
          <div className="form-row">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              <option value="booking">Bookings</option>
              <option value="order">Orders</option>
            </select>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Reference</th>
              <th>Customer</th>
              <th>Description</th>
              <th>Date</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => {
              const payable =
                item.type === 'booking' ? canPayBookings : canPayOrders;
              return (
                <tr key={`${item.type}-${item.id}`}>
                  <td>{TYPE_LABEL[item.type] || item.type}</td>
                  <td>{item.reference}</td>
                  <td>
                    {item.customer}
                    {item.contact && <div className="muted small">{item.contact}</div>}
                  </td>
                  <td>{item.description}</td>
                  <td className="small">
                    {formatDate(item.date)}
                    {item.dueDate && (
                      <div className="muted small">due {formatDate(item.dueDate)}</div>
                    )}
                  </td>
                  <td>{money(item.total)}</td>
                  <td>
                    {money(item.amountPaid)}
                    {(item.paymentSplits || []).length > 1 && (
                      <div className="muted small">
                        {item.paymentSplits
                          .map(
                            (split) =>
                              `${PAYMENT_LABEL[split.method] || split.method} ${money(split.amount)}`
                          )
                          .join(' + ')}
                      </div>
                    )}
                  </td>
                  <td>
                    <strong>{money(item.balance)}</strong>
                  </td>
                  <td>
                    <span className="badge badge-warn">pending</span>
                    <div className="muted small">{item.sourceStatus?.replace('_', ' ')}</div>
                  </td>
                  <td className="row-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() => openPayment(item)}
                      disabled={!payable}
                    >
                      Complete payment
                    </button>
                  </td>
                </tr>
              );
            })}
            {!visibleItems.length && (
              <tr>
                <td colSpan="10" className="muted">
                  No outstanding payments.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="drawer-overlay" onClick={closePayment}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Complete outstanding payment"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2>Complete payment</h2>
                <p className="muted">
                  {TYPE_LABEL[selected.type]} {selected.reference} · {selected.customer}
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={closePayment}>
                Close
              </button>
            </div>

            <div className="drawer-body">
              {error && <div className="alert alert-error">{error}</div>}
              <section className="detail-section">
                <h3>Outstanding balance</h3>
                <dl className="detail-grid">
                  <div>
                    <dt>Total</dt>
                    <dd>{money(selected.total)}</dd>
                  </div>
                  <div>
                    <dt>Already paid</dt>
                    <dd>{money(selected.amountPaid)}</dd>
                  </div>
                  <div>
                    <dt>Balance due</dt>
                    <dd className="text-danger">
                      <strong>{money(selected.balance)}</strong>
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Payment</h3>
                <PaymentSplitFields
                  value={paymentRows}
                  onChange={setPaymentRows}
                  expectedTotal={Number(selected.balance)}
                  allowPartial
                  disabled={loading}
                />
                {isPartial && (
                  <p className="muted small">
                    Partial payment: this record will stay pending until the balance is fully paid.
                  </p>
                )}
              </section>
            </div>

            <div className="drawer-footer">
              <button type="button" className="btn btn-ghost" onClick={closePayment}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmPayment}
                disabled={loading || !paymentValid || !canPaySelected}
              >
                {loading ? 'Saving…' : 'Save payment'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
