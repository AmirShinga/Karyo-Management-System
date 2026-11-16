import { useEffect, useState } from 'react';
import api from '../api/api';
import { downloadFile } from '../api/api';
import { money, formatDate, formatDateTime } from '../utils/format';
import { printReceiptById } from '../utils/receiptPrint';
import { useAuth } from '../context/AuthContext';
import PaymentSplitFields from '../components/PaymentSplitFields';
import usePagedResource from '../hooks/usePagedResource';
import Pagination, { SearchInput } from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';
import {
  PAYMENT_LABEL,
  emptyPaymentRow,
  paymentTotal,
  toPaymentPayload,
} from '../utils/payments';

const STATUS_CLASS = {
  paid: 'badge badge-ok',
  pending: 'badge badge-warn',
  open: 'badge badge-info',
  cancelled: 'badge badge-danger',
};

const TYPE_LABEL = {
  dine_in: 'Dine in',
  takeaway: 'Takeaway',
  room_service: 'Room service',
};

export default function Orders() {
  const { can } = useAuth();
  const canCancel = can('orders.cancel');
  const canPay = can('orders.create');
  const list = usePagedResource('/orders', { initialLimit: 20 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [preview, setPreview] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [paymentRows, setPaymentRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!preview && !paymentOrder) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setPreview(null);
        setPaymentOrder(null);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [preview, paymentOrder]);

  const loadOrders = list.reload;

  const { from = '', to = '' } = list.filters;

  const cancel = async (order) => {
    if (!window.confirm(`Cancel order ${order.receiptNo}?`)) return;
    setError('');
    setNotice('');
    try {
      await api.patch(`/orders/${order.id}/cancel`);
      setNotice(`Order ${order.receiptNo} cancelled.`);
      await loadOrders();
    } catch (err) {
      setError(err.message);
    }
  };

  const openPayment = (order) => {
    setError('');
    setNotice('');
    setPaymentOrder(order);
    setPaymentRows([emptyPaymentRow(Number(order.balance).toFixed(2))]);
  };

  const closePayment = () => {
    setPaymentOrder(null);
    setPaymentRows([]);
  };

  const completePayment = async () => {
    if (!paymentOrder) return;
    const payments = toPaymentPayload(paymentRows);
    const totalPaid = paymentTotal(paymentRows);
    if (totalPaid <= 0) {
      setError('Enter a payment amount');
      return;
    }
    if (totalPaid > Number(paymentOrder.balance) + 0.009) {
      setError('Payment cannot exceed the outstanding balance');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.patch(`/orders/${paymentOrder.id}/complete-payment`, { payments });
      setNotice(
        res.data.data.status === 'paid'
          ? `Payment completed for ${paymentOrder.receiptNo}.`
          : `Partial payment recorded for ${paymentOrder.receiptNo}.`
      );
      closePayment();
      setPreview(null);
      await loadOrders();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const paymentComplete = paymentOrder
    ? paymentTotal(paymentRows) > 0 &&
      paymentTotal(paymentRows) <= Number(paymentOrder.balance) + 0.009
    : false;

  return (
    <div>
      <h1>Orders</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-filters">
            <SearchInput
              value={list.filters.search || ''}
              onChange={(v) => list.setFilter({ search: v })}
              placeholder="Search receipt, table or room"
              loading={list.loading}
            />
            <input type="date" value={from} onChange={(e) => list.setFilter({ from: e.target.value })} aria-label="From date" />
            <input type="date" value={to} onChange={(e) => list.setFilter({ to: e.target.value })} aria-label="To date" />
          </div>
        </div>
        <div className="table-responsive">
        {list.loading && !list.rows.length ? (
          <TableSkeleton rows={6} cols={9} />
        ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Type</th>
              <th>Where</th>
              <th>Items</th>
              <th>Total</th>
              <th>Cashier</th>
              <th>Date</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((o) => (
              <tr key={o.id}>
                <td>{o.receiptNo}</td>
                <td>{TYPE_LABEL[o.orderType] || o.orderType}</td>
                <td>{o.roomNumber ? `Room ${o.roomNumber}` : o.tableNumber ? `Table ${o.tableNumber}` : '—'}</td>
                <td>
                  {o.items.length}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                  >
                    {expanded === o.id ? 'Hide' : 'View'}
                  </button>
                  {expanded === o.id && (
                    <ul className="order-items">
                      {o.items.map((line) => (
                        <li key={line.id}>
                          {line.quantity} × {line.name} — {money(line.lineTotal)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  {money(o.total)}
                  {o.balance > 0 && (
                    <div className="muted small">
                      paid {money(o.amountPaid)} · balance {money(o.balance)}
                    </div>
                  )}
                </td>
                <td>{o.cashierName || '—'}</td>
                <td className="small">{formatDate(o.createdAt)}</td>
                <td>
                  <span className={STATUS_CLASS[o.status]}>{o.status}</span>
                </td>
                <td className="row-actions">
                  <button className="btn btn-ghost" onClick={() => setPreview(o)}>
                    Preview
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      downloadFile(`/receipts/order/${o.id}.pdf`, `order-${o.id}.pdf`).catch((err) =>
                        setError(err.message)
                      )
                    }
                  >
                    PDF
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      printReceiptById('order', o.id).catch((err) => setError(err.message))
                    }
                  >
                    Print
                  </button>
                  {canPay && o.status === 'pending' && (
                    <button className="btn btn-primary" onClick={() => openPayment(o)}>
                      Complete payment
                    </button>
                  )}
                  {canCancel && o.status !== 'cancelled' && (
                    <button className="btn btn-ghost danger" onClick={() => cancel(o)}>
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!list.rows.length && (
              <tr>
                <td colSpan="9" className="muted">
                  No orders yet.
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

      {preview && (
        <div className="drawer-overlay" onClick={() => setPreview(null)}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-preview-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2 id="order-preview-title">{preview.receiptNo || `Order #${preview.id}`}</h2>
                <span className={STATUS_CLASS[preview.status]}>{preview.status}</span>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>

            <div className="drawer-body">
              <section className="detail-section">
                <h3>Order information</h3>
                <dl className="detail-grid">
                  <div>
                    <dt>Receipt number</dt>
                    <dd>{preview.receiptNo || '—'}</dd>
                  </div>
                  <div>
                    <dt>Order type</dt>
                    <dd>{TYPE_LABEL[preview.orderType] || preview.orderType}</dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd>
                      {preview.roomNumber
                        ? `Room ${preview.roomNumber}`
                        : preview.tableNumber
                          ? `Table ${preview.tableNumber}`
                          : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span className={STATUS_CLASS[preview.status]}>{preview.status}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Cashier</dt>
                    <dd>{preview.cashierName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Ordered on</dt>
                    <dd>{formatDateTime(preview.createdAt, true)}</dd>
                  </div>
                  <div>
                    <dt>Paid on</dt>
                    <dd>{formatDateTime(preview.paidAt, true)}</dd>
                  </div>
                  <div>
                    <dt>Order ID</dt>
                    <dd>#{preview.id}</dd>
                  </div>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Items ({preview.items.length})</h3>
                <ul className="preview-item-list">
                  {preview.items.map((line) => (
                    <li key={line.id} className="preview-item">
                      <div>
                        <strong>
                          {line.quantity} × {line.name}
                        </strong>
                        <span className="muted small">{money(line.priceAtTime)} each</span>
                      </div>
                      <span className="preview-item-amount">{money(line.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="detail-section">
                <h3>Payment information</h3>
                <dl className="detail-grid">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{money(preview.subtotal)}</dd>
                  </div>
                  {preview.chargeAmount > 0 && (
                    <div>
                      <dt>
                        {preview.orderType === 'room_service'
                          ? 'Room service charge'
                          : 'Takeaway charge'}
                      </dt>
                      <dd>{money(preview.chargeAmount)}</dd>
                    </div>
                  )}
                  {preview.discountAmount > 0 && (
                    <div>
                      <dt>Discount</dt>
                      <dd>-{money(preview.discountAmount)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Tax</dt>
                    <dd>{money(preview.taxAmount)}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{money(preview.total)}</dd>
                  </div>
                  <div>
                    <dt>Amount paid</dt>
                    <dd>{money(preview.amountPaid)}</dd>
                  </div>
                  <div>
                    <dt>Balance</dt>
                    <dd>{money(preview.balance)}</dd>
                  </div>
                  <div>
                    <dt>Payment status</dt>
                    <dd className={preview.balance > 0 ? 'text-danger' : 'text-success'}>
                      {preview.balance > 0 ? 'Incomplete' : 'Complete'}
                    </dd>
                  </div>
                  <div>
                    <dt>Payment method</dt>
                    <dd>{PAYMENT_LABEL[preview.paymentMethod] || '—'}</dd>
                  </div>
                  <div className="detail-wide">
                    <dt>Payment breakdown</dt>
                    <dd>
                      {(preview.paymentSplits || []).length
                        ? preview.paymentSplits.map((split) => (
                            <div key={split.method}>
                              {PAYMENT_LABEL[split.method] || split.method}: {money(split.amount)}
                            </div>
                          ))
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            <div className="drawer-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  downloadFile(`/receipts/order/${preview.id}.pdf`, `order-${preview.id}.pdf`).catch(
                    (err) => setError(err.message)
                  )
                }
              >
                Download PDF
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  printReceiptById('order', preview.id).catch((err) => setError(err.message))
                }
              >
                Print receipt
              </button>
              {canPay && preview.status === 'pending' && (
                <button type="button" className="btn btn-primary" onClick={() => openPayment(preview)}>
                  Complete payment
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
          </aside>
        </div>
      )}

      {paymentOrder && (
        <div className="drawer-overlay" onClick={closePayment}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-payment-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2 id="order-payment-title">Complete payment</h2>
                <p className="muted">
                  {paymentOrder.receiptNo || `Order #${paymentOrder.id}`} · balance{' '}
                  {money(paymentOrder.balance)}
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={closePayment}>
                Close
              </button>
            </div>

            <div className="drawer-body">
              {error && <div className="alert alert-error">{error}</div>}
              <section className="detail-section">
                <dl className="detail-grid">
                  <div>
                    <dt>Order total</dt>
                    <dd>{money(paymentOrder.total)}</dd>
                  </div>
                  <div>
                    <dt>Already paid</dt>
                    <dd>{money(paymentOrder.amountPaid)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding balance</dt>
                    <dd>
                      <strong>{money(paymentOrder.balance)}</strong>
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Payment</h3>
                <PaymentSplitFields
                  value={paymentRows}
                  onChange={setPaymentRows}
                  expectedTotal={Number(paymentOrder.balance)}
                  allowPartial
                  disabled={loading}
                />
                {paymentTotal(paymentRows) < Number(paymentOrder.balance) - 0.009 && (
                  <p className="muted small">
                    Partial payment: the order will stay pending until the balance is fully paid.
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
                onClick={completePayment}
                disabled={loading || !paymentComplete}
              >
                {loading ? 'Saving...' : 'Complete payment'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
