export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'pos', label: 'POS' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

export const PAYMENT_LABEL = {
  cash: 'Cash',
  pos: 'POS',
  bank_transfer: 'Bank transfer',
  mixed: 'Mixed',
  other: 'Not recorded',
};

export const emptyPaymentRow = (amount = '') => ({ method: 'cash', amount });

export function paymentTotal(rows) {
  return Math.round(
    (rows || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100
  ) / 100;
}

export function toPaymentPayload(rows) {
  return (rows || [])
    .map((row) => ({ method: row.method, amount: Math.round((Number(row.amount) || 0) * 100) / 100 }))
    .filter((row) => row.amount > 0);
}
