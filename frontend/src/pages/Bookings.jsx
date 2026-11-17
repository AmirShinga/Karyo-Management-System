import { useEffect, useState } from 'react';
import api from '../api/api';
import { downloadFile } from '../api/api';
import { money, formatDate, formatDateTime } from '../utils/format';
import { printReceiptById } from '../utils/receiptPrint';
import { printGuestReport } from '../utils/guestReportPrint';
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
  reserved: 'badge badge-info',
  checked_in: 'badge badge-ok',
  checked_out: 'badge badge-off',
  cancelled: 'badge badge-danger',
};

const timeInputValue = (value) => (value ? String(value).slice(0, 5) : '');

const emptyForm = {
  roomId: '',
  guestName: '',
  guestPhone: '',
  guestEmail: '',
  guestAddress: '',
  guestOccupation: '',
  stayPurpose: '',
  guestContactName: '',
  guestContactPhone: '',
  guestIdType: '',
  guestIdDocument: '',
  vehicleNo: '',
  arrivalFrom: '',
  arrivalTime: '',
  destination: '',
  departureDate: '',
  departureTime: '',
  checkInDate: '',
  checkOutDate: '',
  discountAmount: '',
  payments: [emptyPaymentRow()],
};

export default function Bookings() {
  const { can } = useAuth();
  const canBook = can('bookings.create');
  const canCheckIn = can('bookings.checkin');
  const canCheckOut = can('bookings.checkout');
  const canCancel = can('bookings.cancel');
  const list = usePagedResource('/bookings', { initialLimit: 20 });
  const [availableRooms, setAvailableRooms] = useState([]);
  const [rate, setRate] = useState(0);
  const [nights, setNights] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [checkoutPayments, setCheckoutPayments] = useState([]);
  const [paymentFor, setPaymentFor] = useState(null);
  const [paymentRows, setPaymentRows] = useState([]);
  const [editFor, setEditFor] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (!preview && !checkout && !paymentFor && !editFor) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setPreview(null);
        setCheckout(null);
        setPaymentFor(null);
        setEditFor(null);
        setEditForm(null);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [preview, checkout, paymentFor, editFor]);

  const loadBookings = list.reload;

  // When dates are chosen, fetch available rooms and set the rate from the selected room.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!form.checkInDate || !form.checkOutDate) {
        if (!cancelled) {
          setAvailableRooms([]);
          setNights(0);
        }
        return;
      }
      try {
        const res = await api.get(
          `/bookings/availability?checkInDate=${form.checkInDate}&checkOutDate=${form.checkOutDate}`
        );
        if (!cancelled) {
          setAvailableRooms(res.data.data);
          setNights(res.data.meta?.nights || 0);
          const selected = res.data.data.find((r) => String(r.id) === String(form.roomId));
          setRate(selected ? selected.ratePerNight : 0);
        }
      } catch {
        if (!cancelled) setAvailableRooms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.checkInDate, form.checkOutDate, form.roomId]);

  const onRoomChange = (roomId) => {
    const selected = availableRooms.find((r) => String(r.id) === String(roomId));
    setForm({ ...form, roomId });
    setRate(selected ? selected.ratePerNight : 0);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const payments = toPaymentPayload(form.payments);
      const discountAmount = Number(form.discountAmount) || 0;
      await api.post('/bookings', {
        roomId: Number(form.roomId),
        guestName: form.guestName,
        guestPhone: form.guestPhone || null,
        guestEmail: form.guestEmail || null,
        guestAddress: form.guestAddress || null,
        guestOccupation: form.guestOccupation || null,
        stayPurpose: form.stayPurpose || null,
        guestContactName: form.guestContactName || null,
        guestContactPhone: form.guestContactPhone || null,
        guestIdType: form.guestIdType || null,
        guestIdDocument: form.guestIdDocument || null,
        vehicleNo: form.vehicleNo || null,
        arrivalFrom: form.arrivalFrom || null,
        arrivalTime: form.arrivalTime || null,
        destination: form.destination || null,
        departureDate: form.departureDate || null,
        departureTime: form.departureTime || null,
        checkInDate: form.checkInDate,
        checkOutDate: form.checkOutDate,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        payments: payments.length ? payments : undefined,
      });
      setNotice('Booking created.');
      setForm({ ...emptyForm, payments: [emptyPaymentRow()] });
      setRate(0);
      setNights(0);
      await loadBookings();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const action = async (booking, verb) => {
    setError('');
    setNotice('');
    try {
      await api.patch(`/bookings/${booking.id}/${verb}`);
      setNotice(`Booking ${verb.replace('-', ' ')} successful.`);
      await loadBookings();
    } catch (err) {
      setError(err.message);
    }
  };

  const closeEditReport = () => {
    setEditFor(null);
    setEditForm(null);
  };

  const startEditReport = (booking) => {
    setError('');
    setNotice('');
    setEditFor(booking);
    setEditForm({
      guestName: booking.guestName || '',
      guestPhone: booking.guestPhone || '',
      guestEmail: booking.guestEmail || '',
      guestAddress: booking.guestAddress || '',
      guestOccupation: booking.guestOccupation || '',
      stayPurpose: booking.stayPurpose || '',
      guestContactName: booking.guestContactName || '',
      guestContactPhone: booking.guestContactPhone || '',
      guestIdType: booking.guestIdType || '',
      guestIdDocument: booking.guestIdDocument || '',
      vehicleNo: booking.vehicleNo || '',
      arrivalFrom: booking.arrivalFrom || '',
      arrivalTime: timeInputValue(booking.arrivalTime),
      destination: booking.destination || '',
      departureDate: booking.departureDate || '',
      departureTime: timeInputValue(booking.departureTime),
    });
  };

  const saveEditReport = async (e) => {
    e.preventDefault();
    if (!editFor || !editForm) return;
    setError('');
    setNotice('');
    setEditLoading(true);
    try {
      const res = await api.patch(`/bookings/${editFor.id}/report`, editForm);
      setPreview(res.data.data);
      closeEditReport();
      setNotice('Guest report details updated.');
      await loadBookings();
    } catch (err) {
      setError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const startCheckout = (booking) => {
    setError('');
    setNotice('');
    if (Number(booking.balance) > 0) {
      setCheckout(booking);
      setCheckoutPayments([emptyPaymentRow()]);
      return;
    }
    action(booking, 'check-out');
  };

  const confirmCheckout = async () => {
    if (!checkout) return;
    const payments = toPaymentPayload(checkoutPayments);
    if (Math.abs(paymentTotal(checkoutPayments) - Number(checkout.balance)) > 0.009) {
      setError('Payment total must equal the outstanding balance');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.patch(`/bookings/${checkout.id}/check-out`, { payments });
      setNotice('Booking check out successful.');
      setCheckout(null);
      setCheckoutPayments([]);
      await loadBookings();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openPayment = (booking) => {
    setError('');
    setNotice('');
    setPaymentFor(booking);
    setPaymentRows([emptyPaymentRow()]);
  };

  const closePayment = () => {
    setPaymentFor(null);
    setPaymentRows([]);
  };

  const confirmPayment = async () => {
    if (!paymentFor) return;
    const payments = toPaymentPayload(paymentRows);
    const totalPaid = paymentTotal(paymentRows);
    if (totalPaid <= 0) {
      setError('Enter a payment amount');
      return;
    }
    if (totalPaid > Number(paymentFor.balance) + 0.009) {
      setError('Payment cannot exceed the outstanding balance');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.patch(`/bookings/${paymentFor.id}/payments`, { payments });
      setNotice(`Payment recorded for booking #${paymentFor.id}.`);
      closePayment();
      await loadBookings();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const total = rate * nights;
  const discountAmount = Number(form.discountAmount) || 0;
  const discountedTotal = Math.max(total - discountAmount, 0);
  const checkoutComplete = checkout
    ? Math.abs(paymentTotal(checkoutPayments) - Number(checkout.balance)) <= 0.009
    : false;
  const paymentIsPartial = paymentFor
    ? paymentTotal(paymentRows) < Number(paymentFor.balance) - 0.009
    : false;
  const paymentValid =
    paymentTotal(paymentRows) > 0 &&
    paymentTotal(paymentRows) <= Number(paymentFor?.balance || 0) + 0.009;

  return (
    <div>
      <h1>Bookings</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {canBook && (
        <div className="card">
          <h2>New booking</h2>
          <form onSubmit={onSubmit}>
            <div className="form-row">
              <input
                type="date"
                value={form.checkInDate}
                onChange={(e) => setForm({ ...form, checkInDate: e.target.value })}
                required
              />
              <input
                type="date"
                value={form.checkOutDate}
                onChange={(e) => setForm({ ...form, checkOutDate: e.target.value })}
                required
              />
              <select
                value={form.roomId}
                onChange={(e) => onRoomChange(e.target.value)}
                required
                disabled={!availableRooms.length}
              >
                <option value="">
                  {form.checkInDate && form.checkOutDate
                    ? availableRooms.length
                      ? 'Select room'
                      : 'No rooms available'
                    : 'Choose dates first'}
                </option>
                {availableRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber} — {r.roomType} ({money(r.ratePerNight)})
                  </option>
                ))}
              </select>
              <input
                placeholder="Guest name"
                value={form.guestName}
                onChange={(e) => setForm({ ...form, guestName: e.target.value })}
                required
              />
              <input
                placeholder="Guest phone"
                value={form.guestPhone}
                onChange={(e) => setForm({ ...form, guestPhone: e.target.value })}
                required
              />
              <input
                type="email"
                placeholder="Guest email"
                value={form.guestEmail}
                onChange={(e) => setForm({ ...form, guestEmail: e.target.value })}
              />
              <input
                placeholder="Guest address"
                value={form.guestAddress}
                onChange={(e) => setForm({ ...form, guestAddress: e.target.value })}
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Discount"
                value={form.discountAmount}
                onChange={(e) => setForm({ ...form, discountAmount: e.target.value })}
                aria-label="Discount amount"
              />
              <div className="payment-block">
                <label>Advance payment (optional)</label>
                <PaymentSplitFields
                  value={form.payments}
                  onChange={(payments) => setForm({ ...form, payments })}
                  expectedTotal={discountedTotal > 0 ? discountedTotal : null}
                  allowPartial
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading || !form.roomId}>
                {loading ? 'Saving…' : 'Book'}
              </button>
            </div>

            <details className="guest-report-toggle" open>
              <summary>Guest report details</summary>
              <div className="form-row">
                <input
                  placeholder="Occupation"
                  value={form.guestOccupation}
                  onChange={(e) => setForm({ ...form, guestOccupation: e.target.value })}
                  required
                />
                <input
                  placeholder="Purpose of stay"
                  value={form.stayPurpose}
                  onChange={(e) => setForm({ ...form, stayPurpose: e.target.value })}
                  required
                />
                <input
                  placeholder="Emergency contact name"
                  value={form.guestContactName}
                  onChange={(e) => setForm({ ...form, guestContactName: e.target.value })}
                  required
                />
                <input
                  type="tel"
                  placeholder="Emergency contact phone"
                  value={form.guestContactPhone}
                  onChange={(e) => setForm({ ...form, guestContactPhone: e.target.value })}
                  required
                />
                <input
                  placeholder="Means of ID (NIN, voter card, licence)"
                  value={form.guestIdType}
                  onChange={(e) => setForm({ ...form, guestIdType: e.target.value })}
                  required
                />
                <input
                  placeholder="ID document number"
                  value={form.guestIdDocument}
                  onChange={(e) => setForm({ ...form, guestIdDocument: e.target.value })}
                  required
                />
                <input
                  placeholder="Vehicle no."
                  value={form.vehicleNo}
                  onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })}
                  required
                />
                <input
                  placeholder="Arrival from"
                  value={form.arrivalFrom}
                  onChange={(e) => setForm({ ...form, arrivalFrom: e.target.value })}
                  required
                />
                <input
                  type="time"
                  aria-label="Time of arrival"
                  title="Time of arrival"
                  value={form.arrivalTime}
                  onChange={(e) => setForm({ ...form, arrivalTime: e.target.value })}
                  required
                />
                <input
                  placeholder="Destination"
                  value={form.destination}
                  onChange={(e) => setForm({ ...form, destination: e.target.value })}
                />
                <input
                  type="date"
                  aria-label="Date of departure"
                  title="Date of departure"
                  value={form.departureDate}
                  onChange={(e) => setForm({ ...form, departureDate: e.target.value })}
                />
                <input
                  type="time"
                  aria-label="Time of departure"
                  title="Time of departure"
                  value={form.departureTime}
                  onChange={(e) => setForm({ ...form, departureTime: e.target.value })}
                />
              </div>
            </details>
          </form>
          {nights > 0 && (
            <p className="muted">
              {nights} night(s) × {money(rate)} = {money(total)}
              {discountAmount > 0 && (
                <> · Discount {money(discountAmount)} · <strong>{money(discountedTotal)}</strong></>
              )}
              {discountAmount <= 0 && <> = <strong>{money(total)}</strong></>}
            </p>
          )}
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-filters">
            <SearchInput
              value={list.filters.search || ''}
              onChange={(v) => list.setFilter({ search: v })}
              placeholder="Search guest, phone, ID or room"
              loading={list.loading}
            />
            <select
              value={list.filters.status || ''}
              onChange={(e) => list.setFilter({ status: e.target.value })}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="reserved">Reserved</option>
              <option value="checked_in">Checked in</option>
              <option value="checked_out">Checked out</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div className="table-responsive">
        {list.loading && !list.rows.length ? (
          <TableSkeleton rows={6} cols={9} />
        ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Address</th>
              <th>Room</th>
              <th>Dates</th>
              <th>Nights</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((b) => (
              <tr key={b.id}>
                <td>
                  {b.guestName}
                  {b.guestIdNumber ? (
                    <div className="muted small">ID: {b.guestIdNumber}</div>
                  ) : null}
                  {b.guestPhone ? <div className="muted small">{b.guestPhone}</div> : null}
                </td>
                <td className="small">{b.guestAddress || '—'}</td>
                <td>
                  {b.roomNumber}
                  <div className="muted small">{b.roomType}</div>
                </td>
                <td className="small">
                  {formatDate(b.checkInDate)} → {formatDate(b.checkOutDate)}
                </td>
                <td>{b.nights}</td>
                <td>{money(b.totalAmount)}</td>
                <td>
                  {money(b.amountPaid)}
                  <div>
                    <span
                      className={b.balance > 0 ? 'badge badge-warn' : 'badge badge-ok'}
                    >
                      {b.balance > 0 ? 'pending' : 'paid'}
                    </span>
                  </div>
                  {b.balance > 0 && <div className="muted small">bal {money(b.balance)}</div>}
                </td>
                <td>
                  <span className={STATUS_CLASS[b.status]}>{b.status.replace('_', ' ')}</span>
                </td>
                <td className="row-actions">
                  <button className="btn btn-ghost" onClick={() => setPreview(b)}>
                    Preview
                  </button>
                  {b.status === 'reserved' && canCheckIn && (
                    <button className="btn btn-ghost" onClick={() => action(b, 'check-in')}>
                      Check in
                    </button>
                  )}
                  {b.status === 'reserved' && canCancel && (
                    <button className="btn btn-ghost danger" onClick={() => action(b, 'cancel')}>
                      Cancel
                    </button>
                  )}
                  {b.balance > 0 && b.status !== 'cancelled' && canCheckOut && (
                    <button className="btn btn-ghost" onClick={() => openPayment(b)}>
                      Record payment
                    </button>
                  )}
                  {b.status === 'checked_in' && canCheckOut && (
                    <button className="btn btn-ghost" onClick={() => startCheckout(b)}>
                      Check out
                    </button>
                  )}
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      downloadFile(`/receipts/booking/${b.id}.pdf`, `booking-${b.id}.pdf`).catch(
                        (err) => setError(err.message)
                      )
                    }
                  >
                    PDF
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      printGuestReport(b).catch((err) => setError(err.message))
                    }
                  >
                    Print
                  </button>
                </td>
              </tr>
            ))}
            {!list.rows.length && (
              <tr>
                <td colSpan="9" className="muted">
                  No bookings yet.
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
            aria-labelledby="booking-preview-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2 id="booking-preview-title">Booking #{preview.id}</h2>
                <span className={STATUS_CLASS[preview.status]}>
                  {preview.status.replace('_', ' ')}
                </span>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>

            <div className="drawer-body">
              <section className="detail-section">
                <h3>Guest information</h3>
                <dl className="detail-grid">
                  <div>
                    <dt>Guest ID</dt>
                    <dd>{preview.guestIdNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt>Guest name</dt>
                    <dd>{preview.guestName}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{preview.guestPhone || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{preview.guestEmail || '—'}</dd>
                  </div>
                  <div>
                    <dt>Occupation</dt>
                    <dd>{preview.guestOccupation || '—'}</dd>
                  </div>
                  <div>
                    <dt>Purpose of stay</dt>
                    <dd>{preview.stayPurpose || '—'}</dd>
                  </div>
                  <div>
                    <dt>Emergency contact</dt>
                    <dd>{preview.guestContactName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Emergency phone</dt>
                    <dd>{preview.guestContactPhone || '—'}</dd>
                  </div>
                  <div>
                    <dt>Means of ID</dt>
                    <dd>{preview.guestIdType || '—'}</dd>
                  </div>
                  <div>
                    <dt>ID document</dt>
                    <dd>{preview.guestIdDocument || '—'}</dd>
                  </div>
                  <div>
                    <dt>Vehicle no.</dt>
                    <dd>{preview.vehicleNo || '—'}</dd>
                  </div>
                  <div className="detail-wide">
                    <dt>Address</dt>
                    <dd>{preview.guestAddress || '—'}</dd>
                  </div>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Stay information</h3>
                <dl className="detail-grid">
                  <div>
                    <dt>Room</dt>
                    <dd>
                      {preview.roomNumber} ({preview.roomType})
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span className={STATUS_CLASS[preview.status]}>
                        {preview.status.replace('_', ' ')}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Date of arrival</dt>
                    <dd>{formatDate(preview.checkInDate)}</dd>
                  </div>
                  <div>
                    <dt>Check-out date</dt>
                    <dd>{formatDate(preview.checkOutDate)}</dd>
                  </div>
                  <div>
                    <dt>Date of departure</dt>
                    <dd>{preview.departureDate ? formatDate(preview.departureDate) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Arrival from</dt>
                    <dd>{preview.arrivalFrom || '—'}</dd>
                  </div>
                  <div>
                    <dt>Time of arrival</dt>
                    <dd>{preview.arrivalTime ? String(preview.arrivalTime).slice(0, 5) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Destination</dt>
                    <dd>{preview.destination || '—'}</dd>
                  </div>
                  <div>
                    <dt>Time of departure</dt>
                    <dd>{preview.departureTime ? String(preview.departureTime).slice(0, 5) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Nights</dt>
                    <dd>{preview.nights}</dd>
                  </div>
                  <div>
                    <dt>Actual check-in</dt>
                    <dd>{formatDateTime(preview.actualCheckIn, true)}</dd>
                  </div>
                  <div>
                    <dt>Actual check-out</dt>
                    <dd>{formatDateTime(preview.actualCheckOut, true)}</dd>
                  </div>
                  <div>
                    <dt>Booked by</dt>
                    <dd>
                      {preview.createdByName ||
                        (preview.createdBy ? `User #${preview.createdBy}` : '—')}
                    </dd>
                  </div>
                  <div>
                    <dt>Booked on</dt>
                    <dd>{formatDateTime(preview.createdAt, true)}</dd>
                  </div>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Payment information</h3>
                <dl className="detail-grid">
                  <div>
                    <dt>Rate per night</dt>
                    <dd>{money(preview.ratePerNight)}</dd>
                  </div>
                  {preview.discountAmount > 0 && (
                    <div>
                      <dt>Discount</dt>
                      <dd>-{money(preview.discountAmount)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Total amount</dt>
                    <dd>{money(preview.totalAmount)}</dd>
                  </div>
                  <div>
                    <dt>Amount paid</dt>
                    <dd>{money(preview.amountPaid)}</dd>
                  </div>
                  <div>
                    <dt>Balance</dt>
                    <dd className={preview.balance > 0 ? 'text-danger' : 'text-success'}>
                      {money(preview.balance)}
                    </dd>
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
              {canBook && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => startEditReport(preview)}
                >
                  Edit details
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  downloadFile(`/receipts/booking/${preview.id}.pdf`, `booking-${preview.id}.pdf`).catch(
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
                  printGuestReport(preview).catch((err) => setError(err.message))
                }
              >
                Print report
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  printReceiptById('booking', preview.id).catch((err) => setError(err.message))
                }
              >
                Print receipt
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
          </aside>
        </div>
      )}

      {editFor && editForm && (
        <div className="drawer-overlay" onClick={closeEditReport}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2 id="booking-edit-title">Edit guest report details</h2>
                <p className="muted">
                  Booking #{editFor.id} · {editFor.guestName}
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={closeEditReport}>
                Close
              </button>
            </div>

            <form className="drawer-form" onSubmit={saveEditReport}>
              <div className="drawer-body">
                {error && <div className="alert alert-error">{error}</div>}

                <section className="detail-section">
                  <h3>Guest information</h3>
                  <div className="form-row">
                    <input
                      placeholder="Guest name"
                      value={editForm.guestName}
                      onChange={(e) => setEditForm({ ...editForm, guestName: e.target.value })}
                      required
                    />
                    <input
                      placeholder="Guest phone"
                      value={editForm.guestPhone}
                      onChange={(e) => setEditForm({ ...editForm, guestPhone: e.target.value })}
                      required
                    />
                    <input
                      type="email"
                      placeholder="Guest email"
                      value={editForm.guestEmail}
                      onChange={(e) => setEditForm({ ...editForm, guestEmail: e.target.value })}
                    />
                    <input
                      placeholder="Guest address"
                      value={editForm.guestAddress}
                      onChange={(e) => setEditForm({ ...editForm, guestAddress: e.target.value })}
                      required
                    />
                    <input
                      placeholder="Occupation"
                      value={editForm.guestOccupation}
                      onChange={(e) =>
                        setEditForm({ ...editForm, guestOccupation: e.target.value })
                      }
                      required
                    />
                    <input
                      placeholder="Purpose of stay"
                      value={editForm.stayPurpose}
                      onChange={(e) => setEditForm({ ...editForm, stayPurpose: e.target.value })}
                      required
                    />
                    <input
                      placeholder="Emergency contact name"
                      value={editForm.guestContactName}
                      onChange={(e) =>
                        setEditForm({ ...editForm, guestContactName: e.target.value })
                      }
                      required
                    />
                    <input
                      type="tel"
                      placeholder="Emergency contact phone"
                      value={editForm.guestContactPhone}
                      onChange={(e) =>
                        setEditForm({ ...editForm, guestContactPhone: e.target.value })
                      }
                      required
                    />
                    <input
                      placeholder="Means of ID (NIN, voter card, licence)"
                      value={editForm.guestIdType}
                      onChange={(e) => setEditForm({ ...editForm, guestIdType: e.target.value })}
                      required
                    />
                    <input
                      placeholder="ID document number"
                      value={editForm.guestIdDocument}
                      onChange={(e) =>
                        setEditForm({ ...editForm, guestIdDocument: e.target.value })
                      }
                      required
                    />
                    <input
                      placeholder="Vehicle no."
                      value={editForm.vehicleNo}
                      onChange={(e) => setEditForm({ ...editForm, vehicleNo: e.target.value })}
                      required
                    />
                  </div>
                </section>

                <section className="detail-section">
                  <h3>Travel details</h3>
                  <div className="form-row">
                    <input
                      placeholder="Arrival from"
                      value={editForm.arrivalFrom}
                      onChange={(e) => setEditForm({ ...editForm, arrivalFrom: e.target.value })}
                      required
                    />
                    <input
                      type="time"
                      aria-label="Time of arrival"
                      title="Time of arrival"
                      value={editForm.arrivalTime}
                      onChange={(e) => setEditForm({ ...editForm, arrivalTime: e.target.value })}
                      required
                    />
                    <input
                      placeholder="Destination"
                      value={editForm.destination}
                      onChange={(e) => setEditForm({ ...editForm, destination: e.target.value })}
                    />
                    <input
                      type="date"
                      aria-label="Date of departure"
                      title="Date of departure"
                      value={editForm.departureDate}
                      onChange={(e) =>
                        setEditForm({ ...editForm, departureDate: e.target.value })
                      }
                    />
                    <input
                      type="time"
                      aria-label="Time of departure"
                      title="Time of departure"
                      value={editForm.departureTime}
                      onChange={(e) =>
                        setEditForm({ ...editForm, departureTime: e.target.value })
                      }
                    />
                  </div>
                </section>
              </div>

              <div className="drawer-footer">
                <button type="button" className="btn btn-ghost" onClick={closeEditReport}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={editLoading}>
                  {editLoading ? 'Saving…' : 'Save details'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {paymentFor && (
        <div className="drawer-overlay" onClick={closePayment}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Record booking payment"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2>Record payment for booking #{paymentFor.id}</h2>
                <p className="muted">{paymentFor.guestName}</p>
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
                    <dt>Total amount</dt>
                    <dd>{money(paymentFor.totalAmount)}</dd>
                  </div>
                  <div>
                    <dt>Amount paid</dt>
                    <dd>{money(paymentFor.amountPaid)}</dd>
                  </div>
                  <div>
                    <dt>Balance due</dt>
                    <dd className="text-danger">{money(paymentFor.balance)}</dd>
                  </div>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Payment</h3>
                <PaymentSplitFields
                  value={paymentRows}
                  onChange={setPaymentRows}
                  expectedTotal={Number(paymentFor.balance)}
                  allowPartial
                  disabled={loading}
                />
                {paymentIsPartial && (
                  <p className="muted small">
                    Partial payment: the booking will stay pending until the balance is fully paid.
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
                disabled={loading || !paymentValid}
              >
                {loading ? 'Saving…' : 'Save payment'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {checkout && (
        <div
          className="drawer-overlay"
          onClick={() => {
            setCheckout(null);
            setCheckoutPayments([]);
          }}
        >
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Check out booking"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2>Check out booking #{checkout.id}</h2>
                <p className="muted">{checkout.guestName}</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setCheckout(null);
                  setCheckoutPayments([]);
                }}
              >
                Close
              </button>
            </div>

            <div className="drawer-body">
              <section className="detail-section">
                <h3>Outstanding balance</h3>
                <dl className="detail-grid">
                  <div>
                    <dt>Room</dt>
                    <dd>
                      {checkout.roomNumber} ({checkout.roomType})
                    </dd>
                  </div>
                  <div>
                    <dt>Total amount</dt>
                    <dd>{money(checkout.totalAmount)}</dd>
                  </div>
                  <div>
                    <dt>Amount paid</dt>
                    <dd>{money(checkout.amountPaid)}</dd>
                  </div>
                  <div>
                    <dt>Balance due</dt>
                    <dd className="text-danger">{money(checkout.balance)}</dd>
                  </div>
                </dl>
              </section>

              <section className="detail-section">
                <h3>Checkout payment</h3>
                <PaymentSplitFields
                  value={checkoutPayments}
                  onChange={setCheckoutPayments}
                  expectedTotal={Number(checkout.balance)}
                  disabled={loading}
                />
              </section>
            </div>

            <div className="drawer-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setCheckout(null);
                  setCheckoutPayments([]);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmCheckout}
                disabled={loading || !checkoutComplete}
              >
                {loading ? 'Checking out…' : 'Confirm checkout'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
