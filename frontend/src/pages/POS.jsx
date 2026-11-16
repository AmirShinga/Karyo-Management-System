import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/api';
import { money } from '../utils/format';
import { printReceiptById } from '../utils/receiptPrint';
import { useAuth } from '../context/AuthContext';
import PaymentSplitFields from '../components/PaymentSplitFields';
import { emptyPaymentRow, toPaymentPayload } from '../utils/payments';

export default function POS() {
  const { can } = useAuth();
  const canOrder = can('orders.create');
  const [menu, setMenu] = useState([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [cart, setCart] = useState([]); // { menuItemId, name, price, quantity }
  const [orderType, setOrderType] = useState('dine_in');
  const [tableNumber, setTableNumber] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [payments, setPayments] = useState([emptyPaymentRow()]);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/menu?limit=100&available=true');
        if (!cancelled) setMenu(res.data.data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (orderType !== 'room_service') return;
      try {
        const res = await api.get('/rooms?limit=100');
        if (!cancelled) setRooms(res.data.data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderType]);

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [cart]
  );

  const categoryTabs = useMemo(() => {
    const seen = [];
    for (const item of menu) {
      if (item.category && !seen.includes(item.category)) seen.push(item.category);
    }
    return seen;
  }, [menu]);

  const visibleMenu = activeCategory
    ? menu.filter((item) => item.category === activeCategory)
    : menu;
  const chargeApplies = orderType === 'takeaway' || orderType === 'room_service';
  const charge = chargeApplies ? Number(chargeAmount) || 0 : 0;
  const discount = Math.max(Number(discountAmount) || 0, 0);
  const orderTotal = Math.max(subtotal + charge - discount, 0);
  const chargeLabel = orderType === 'room_service' ? 'Room service charge' : 'Takeaway charge';
  const previousTotal = useRef(0);

  useEffect(() => {
    setPayments((prev) => {
      const only = prev[0];
      const autoUpdate =
        prev.length === 1 &&
        (!only.amount || Number(only.amount) === previousTotal.current);
      if (autoUpdate) {
        return [{ ...only, amount: orderTotal ? orderTotal.toFixed(2) : '' }];
      }
      return prev;
    });
    previousTotal.current = orderTotal;
  }, [orderTotal]);

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const changeQty = (menuItemId, delta) => {
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setReceipt(null);
    if (!cart.length) return setError('Add at least one item');
    setLoading(true);
    try {
      const paymentRows = toPaymentPayload(payments);
      const res = await api.post('/orders', {
        orderType,
        roomId: orderType === 'room_service' ? Number(roomId) : null,
        tableNumber: orderType === 'dine_in' ? tableNumber || null : null,
        chargeAmount: chargeApplies ? charge : undefined,
        discountAmount: discount > 0 ? discount : undefined,
        items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
        payments: paymentRows.length ? paymentRows : undefined,
      });
      setReceipt(res.data.data);
      setCart([]);
      setPayments([emptyPaymentRow()]);
      previousTotal.current = 0;
      setTableNumber('');
      setRoomId('');
      setChargeAmount('');
      setDiscountAmount('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Restaurant / POS</h1>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {receipt && (
        <div className="alert alert-success" role="status">
          Order recorded — receipt <strong>{receipt.receiptNo}</strong>, total{' '}
          <strong>{money(receipt.total)}</strong>.{' '}
          {receipt.balance > 0
            ? `${money(receipt.balance)} outstanding - payment pending.`
            : 'Fully paid.'}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              printReceiptById('order', receipt.id).catch((err) => setError(err.message))
            }
          >
            Print receipt
          </button>
        </div>
      )}

      <div className="pos-layout">
        <div className="card">
          <h2>Menu</h2>
          {categoryTabs.length > 1 && (
            <div className="tabs pos-categories">
              <button
                type="button"
                className={`tab${activeCategory === '' ? ' is-active' : ''}`}
                onClick={() => setActiveCategory('')}
              >
                All
              </button>
              {categoryTabs.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`tab${activeCategory === cat ? ' is-active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
          <div className="pos-menu">
            {visibleMenu.map((item) => (
              <button
                key={item.id}
                className="pos-menu-item"
                onClick={() => addToCart(item)}
                disabled={!canOrder}
              >
                <span className="pos-item-name">{item.name}</span>
                <span className="pos-item-price">{money(item.price)}</span>
              </button>
            ))}
            {!visibleMenu.length && <p className="muted">No available menu items.</p>}
          </div>
        </div>

        <form className="card pos-cart" onSubmit={submit}>
          <h2>Order</h2>
          <div className="form-row">
            <select
              value={orderType}
              onChange={(e) => {
                setOrderType(e.target.value);
                if (e.target.value === 'dine_in') setChargeAmount('');
              }}
            >
              <option value="dine_in">Dine in</option>
              <option value="takeaway">Takeaway</option>
              <option value="room_service">Room service</option>
            </select>
            {orderType === 'dine_in' && (
              <input
                placeholder="Table no."
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
              />
            )}
            {orderType === 'room_service' && (
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
                <option value="">Select room</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber} — {r.roomType}
                  </option>
                ))}
              </select>
            )}
            {chargeApplies && (
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={chargeLabel}
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.target.value)}
                aria-label={chargeLabel}
              />
            )}
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Line</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.menuItemId}>
                  <td>{line.name}</td>
                  <td className="qty-controls">
                    <button type="button" className="btn btn-ghost" onClick={() => changeQty(line.menuItemId, -1)}>
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button type="button" className="btn btn-ghost" onClick={() => changeQty(line.menuItemId, 1)}>
                      +
                    </button>
                  </td>
                  <td>{money(line.price * line.quantity)}</td>
                </tr>
              ))}
              {!cart.length && (
                <tr>
                  <td colSpan="3" className="muted">
                    Tap menu items to add them.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="pos-total">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>
          {charge > 0 && (
            <div className="pos-total">
              <span>{chargeLabel}</span>
              <strong>{money(charge)}</strong>
            </div>
          )}
          {discount > 0 && (
            <div className="pos-total">
              <span>Discount</span>
              <strong>-{money(discount)}</strong>
            </div>
          )}
          <div className="pos-total">
            <span>Total</span>
            <strong>{money(orderTotal)}</strong>
          </div>
          <div className="payment-block">
            <label>Discount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Discount amount"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              aria-label="Discount amount"
            />
          </div>
          <div className="payment-block">
            <label>Payment</label>
            <PaymentSplitFields
              value={payments}
              onChange={setPayments}
              expectedTotal={orderTotal || null}
              disabled={loading}
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading || !canOrder}>
            {loading ? 'Saving…' : 'Save order'}
          </button>
        </form>
      </div>
    </div>
  );
}
