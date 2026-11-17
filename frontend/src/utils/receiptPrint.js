import api from '../api/api';
import { PAYMENT_LABEL } from './payments';

const ORDER_TYPE = {
  dine_in: 'Dine in',
  takeaway: 'Takeaway',
  room_service: 'Room service',
};

const STATUS_LABEL = {
  reserved: 'Reserved',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  paid: 'Paid',
  pending: 'Pending payment',
  open: 'Open',
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function metaRows(rows) {
  return rows
    .filter(Boolean)
    .map(
      ([label, value]) =>
        `<tr><td class="label">${esc(label)}</td><td class="value">${esc(value)}</td></tr>`
    )
    .join('');
}

function totalsRows(rows) {
  return rows
    .filter(Boolean)
    .map(
      ([label, value, grand]) =>
        `<tr class="${grand ? 'grand' : ''}"><td class="label">${esc(label)}</td><td class="value">${value}</td></tr>`
    )
    .join('');
}

/** Build a self-contained 80mm thermal-receipt HTML document. */
export function buildReceiptHtml(data) {
  const business = data?.business || {};
  const r = data?.receipt || {};
  const symbol = business.currencySymbol || '\u20A6';
  const money = (value) =>
    `${esc(symbol)}${Number(value || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const paymentText = (value) => {
    const splits = value?.paymentSplits || [];
    if (splits.length) {
      return splits
        .map((split) => `${PAYMENT_LABEL[split.method] || split.method} ${money(split.amount)}`)
        .join(' + ');
    }
    return PAYMENT_LABEL[value?.paymentMethod] || value?.paymentMethod || '—';
  };
  const totalDue = Number(r.total ?? r.totalAmount ?? 0);
  const amountPaid = Number(r.amountPaid ?? 0);
  const balance =
    r.balance !== undefined && r.balance !== null
      ? Number(r.balance)
      : Math.max(0, totalDue - amountPaid);
  const paymentComplete =
    String(r.paymentStatus || '').toLowerCase() === 'complete' || balance <= 0.009;
  const paymentStatus = paymentComplete ? 'PAYMENT COMPLETE' : 'PAYMENT INCOMPLETE';

  let title = 'Receipt';
  let meta = [];
  let items = '';
  let totals = [];

  if (data?.kind === 'booking') {
    title = 'Booking Invoice';
    meta = [
      ['Invoice', `#${r.id}`],
      ['Guest', r.guestName],
      ['Guest ID', r.guestIdNumber || '—'],
      ['Phone', r.guestPhone || '—'],
      ['Address', r.guestAddress || '—'],
      ['Payment', paymentText(r)],
      ['Payment status', paymentComplete ? 'Complete' : 'Incomplete'],
      ['Room', `${r.roomNumber} (${r.roomType})`],
      ['Check-in', formatDate(r.checkInDate)],
      ['Check-out', formatDate(r.checkOutDate)],
      ['Nights', String(r.nights)],
      ['Status', STATUS_LABEL[r.status] || r.status],
      ['Issued', formatDateTime(new Date())],
    ];
    items = `<tr>
        <td>Room ${esc(r.roomNumber)}</td>
        <td class="qty">${esc(r.nights)}</td>
        <td class="amt">${money(r.totalAmount)}</td>
      </tr>`;
    totals = [
      ['Total', money(totalDue)],
      ['Paid', money(amountPaid)],
      ['Balance', money(balance), true],
    ];
  } else {
    title = 'Restaurant Receipt';
    meta = [
      ['Receipt', r.receiptNo || `#${r.id}`],
      ['Type', ORDER_TYPE[r.orderType] || r.orderType || '—'],
      [
        'Where',
        r.roomNumber ? `Room ${r.roomNumber}` : r.tableNumber ? `Table ${r.tableNumber}` : '—',
      ],
      ['Date', formatDateTime(r.date)],
      ['Cashier', r.cashierName || '—'],
      ['Status', STATUS_LABEL[r.status] || r.status],
      ['Payment', paymentText(r)],
      ['Payment status', paymentComplete ? 'Complete' : 'Incomplete'],
    ];
    items = (r.items || [])
      .map(
        (it) => `<tr>
          <td>${esc(it.name)}</td>
          <td class="qty">x${esc(it.quantity)}</td>
          <td class="amt">${money(it.lineTotal)}</td>
        </tr>`
      )
      .join('');
    totals = [
      ['Subtotal', money(r.subtotal)],
      r.chargeAmount ? [r.orderType === 'room_service' ? 'Room service charge' : 'Takeaway charge', money(r.chargeAmount)] : null,
      r.discountAmount ? ['Discount', `- ${money(r.discountAmount).replace(symbol, symbol)}`] : null,
      r.taxAmount ? ['Tax', money(r.taxAmount)] : null,
      ['Total', money(r.total)],
      ['Paid', money(amountPaid)],
      ['Balance', money(balance), true],
    ];
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: 72mm 297mm; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; width: 72mm; }
  body {
    padding: 4mm 4mm 6mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12.5px;
    line-height: 1.35;
    color: #000;
    background: #fff;
  }
  h1 {
    font-size: 16px;
    line-height: 1.2;
    margin: 0 0 2px;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .subtitle { text-align: center; font-size: 12px; margin-bottom: 4px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .meta .label { color: #000; }
  .meta .value { text-align: right; padding-left: 6px; }
  .items th { text-align: left; font-size: 11px; border-bottom: 1px solid #000; padding-bottom: 2px; }
  .items td { padding: 2px 0; }
  .items .qty { width: 12mm; text-align: center; white-space: nowrap; }
  .items .amt { width: 22mm; text-align: right; white-space: nowrap; }
  .totals { margin-top: 3px; }
  .totals .label { text-align: left; }
  .totals .value { text-align: right; white-space: nowrap; }
  .totals .grand .label, .totals .grand .value {
    font-weight: bold;
    font-size: 13px;
    border-top: 1px solid #000;
    padding-top: 3px;
  }
  .payment-status {
    margin-top: 3mm;
    padding: 1.5mm 2mm;
    border: 2px solid #000;
    text-align: center;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.6px;
  }
  .payment-status.incomplete { border-style: double; border-width: 4px; }
  .footer { text-align: center; margin-top: 6mm; font-size: 11px; }
</style>
</head>
<body>
  <h1>${esc(business.name || 'Karyo Guest Palace')}</h1>
  <div class="subtitle">${esc(title)}</div>
  <hr />
  <table class="meta"><tbody>${metaRows(meta)}</tbody></table>
  <hr />
  <table class="items">
    <thead>
      <tr><th>Item</th><th class="qty">Qty</th><th class="amt">Amount</th></tr>
    </thead>
    <tbody>${items}</tbody>
  </table>
  <hr />
  <table class="totals"><tbody>${totalsRows(totals)}</tbody></table>
  <div class="payment-status ${paymentComplete ? 'complete' : 'incomplete'}">${paymentStatus}</div>
  <hr />
  <div class="footer">${esc(business.footer || 'Thank you for your business.')}</div>
</body>
</html>`;
}

/** Send an 80mm receipt to the browser print dialog (uses the Windows printer driver). */
export function printReceipt(data) {
  const html = buildReceiptHtml(data);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '72mm';
  iframe.style.height = '1000px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();

  let printed = false;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  const doPrint = () => {
    if (printed) return;
    printed = true;

    // Chrome ignores `@page { size: 80mm auto }`. Measure the rendered
    // receipt and declare an exact 72mm-wide page so the print preview
    // fills the panel instead of showing a tiny receipt on A4/Letter.
    try {
      const body = doc.body;
      const heightPx = Math.max(body.scrollHeight, body.getBoundingClientRect().height);
      const heightMm = Math.max(50, Math.ceil((heightPx * 25.4) / 96) + 3);
      const pageStyle = doc.createElement('style');
      pageStyle.textContent = `@page { size: 72mm ${heightMm}mm; margin: 0; }`;
      doc.head.appendChild(pageStyle);
    } catch {
      // Fall back to the stylesheet's fixed page size.
    }

    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } finally {
        setTimeout(cleanup, 1000);
      }
    }, 80);
  };

  win.onafterprint = cleanup;
  setTimeout(cleanup, 60000);

  const fontsReady = doc.fonts?.ready;
  if (fontsReady?.then) {
    fontsReady.then(() => setTimeout(doPrint, 50)).catch(() => setTimeout(doPrint, 50));
  } else {
    setTimeout(doPrint, 300);
  }
}

/** Fetch structured receipt data by type/id, then print it. */
export async function printReceiptById(kind, id) {
  const res = await api.get(`/receipts/${kind}/${id}`);
  printReceipt(res.data.data);
}
