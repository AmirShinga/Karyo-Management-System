import { money } from '../utils/format';
import { PAYMENT_METHODS, emptyPaymentRow, paymentTotal } from '../utils/payments';

export default function PaymentSplitFields({
  value,
  onChange,
  expectedTotal = null,
  disabled = false,
  allowPartial = false,
}) {
  const total = paymentTotal(value);
  const remaining =
    expectedTotal === null ? null : Math.round((Number(expectedTotal) - total) * 100) / 100;
  const remainingIsError =
    remaining !== null && (remaining < 0 || (!allowPartial && remaining > 0));

  const updateRow = (index, changes) => {
    onChange(value.map((row, rowIndex) => (rowIndex === index ? { ...row, ...changes } : row)));
  };

  const removeRow = (index) => {
    onChange(value.filter((_, rowIndex) => rowIndex !== index));
  };

  const addRow = () => {
    onChange([
      ...value,
      emptyPaymentRow(remaining && remaining > 0 ? remaining.toFixed(2) : ''),
    ]);
  };

  const fullPaid =
    expectedTotal !== null && Math.abs(Number(expectedTotal) - total) < 0.005;

  const setFullPayment = (checked) => {
    if (checked) {
      onChange([
        {
          method: value[0]?.method || PAYMENT_METHODS[0].value,
          amount: Number(expectedTotal).toFixed(2),
        },
      ]);
    } else {
      onChange(value.map((row) => ({ ...row, amount: '' })));
    }
  };

  return (
    <div className="payment-fields">
      {expectedTotal !== null && (
        <label className="payment-full">
          <input
            type="checkbox"
            checked={fullPaid}
            onChange={(e) => setFullPayment(e.target.checked)}
            disabled={disabled}
          />
          Full payment ({money(expectedTotal)})
        </label>
      )}
      {value.map((row, index) => (
        <div className="payment-row" key={index}>
          <select
            value={row.method}
            onChange={(e) => updateRow(index, { method: e.target.value })}
            disabled={disabled}
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="Amount"
            value={row.amount}
            onChange={(e) => updateRow(index, { amount: e.target.value })}
            disabled={disabled}
          />
          {value.length > 1 && (
            <button
              type="button"
              className="btn btn-ghost danger"
              onClick={() => removeRow(index)}
              disabled={disabled}
            >
              Remove
            </button>
          )}
        </div>
      ))}

      <div className="payment-controls">
        <button
          type="button"
          className="btn btn-outline"
          onClick={addRow}
          disabled={disabled}
        >
          Add payment method
        </button>
        <div className={`payment-summary ${remainingIsError ? 'payment-summary-error' : ''}`}>
          <span>Allocated: {money(total)}</span>
          {remaining !== null && (
            <span>
              {remaining === 0
                ? 'Fully allocated'
                : remaining > 0
                  ? `Remaining: ${money(remaining)}`
                  : `Over by: ${money(Math.abs(remaining))}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
