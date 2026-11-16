import { useEffect, useState } from 'react';
import api, { downloadFile } from '../api/api';
import { money, formatDate } from '../utils/format';
import { useAuth } from '../context/AuthContext';

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDay(iso) {
  return iso.slice(5);
}

function RevenueChart({ series }) {
  if (!series.length) return <p className="muted">No data.</p>;
  const max = Math.max(1, ...series.map((d) => Math.max(d.income, d.expense)));
  return (
    <div className="chart">
      {series.map((d) => (
        <div className="chart-col" key={d.date} title={`${formatDate(d.date)}\nIncome ${money(d.income)}\nExpense ${money(d.expense)}`}>
          <div className="chart-bars">
            <div className="chart-bar income" style={{ height: `${(d.income / max) * 100}%` }} />
            <div className="chart-bar expense" style={{ height: `${(d.expense / max) * 100}%` }} />
          </div>
          <span className="chart-label">{formatDay(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const { can } = useAuth();
  const canExport = can('reports.export');
  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(todayIso());
  const [dashboard, setDashboard] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [bySource, setBySource] = useState([]);
  const [occupancy, setOccupancy] = useState(null);
  const [topItems, setTopItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const q = `?from=${from}&to=${to}`;
      const [d, r, s, o, t] = await Promise.all([
        api.get('/reports/dashboard'),
        api.get(`/reports/revenue${q}`),
        api.get(`/reports/revenue-by-source${q}`),
        api.get(`/reports/occupancy${q}`),
        api.get(`/reports/sales${q}`),
      ]);
      setDashboard(d.data.data);
      setRevenue(r.data.data);
      setBySource(s.data.data.bySource);
      setOccupancy(o.data.data);
      setTopItems(t.data.data.topItems);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = `?from=${from}&to=${to}`;
        const [d, r, s, o, t] = await Promise.all([
          api.get('/reports/dashboard'),
          api.get(`/reports/revenue${q}`),
          api.get(`/reports/revenue-by-source${q}`),
          api.get(`/reports/occupancy${q}`),
          api.get(`/reports/sales${q}`),
        ]);
        if (cancelled) return;
        setDashboard(d.data.data);
        setRevenue(r.data.data);
        setBySource(s.data.data.bySource);
        setOccupancy(o.data.data);
        setTopItems(t.data.data.topItems);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const exportFile = async (kind) => {
    try {
      await downloadFile(`/reports/export/${kind}.xlsx?from=${from}&to=${to}`, `${kind}-${from}_${to}.xlsx`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>Reports</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <h2>Period</h2>
          <div className="form-row">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <button className="btn btn-primary" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : 'Apply'}
            </button>
          </div>
        </div>
        {canExport && (
          <div className="form-row">
            <button className="btn btn-ghost" onClick={() => exportFile('income')}>Export income</button>
            <button className="btn btn-ghost" onClick={() => exportFile('expenses')}>Export expenses</button>
            <button className="btn btn-ghost" onClick={() => exportFile('sales')}>Export sales</button>
          </div>
        )}
      </div>

      {dashboard && (
        <div className="grid">
          <div className="card stat">
            <span className="stat-label">Income today</span>
            <span className="stat-value">{money(dashboard.income.today)}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Income (30d)</span>
            <span className="stat-value">{money(dashboard.income.month)}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Expenses (30d)</span>
            <span className="stat-value">{money(dashboard.expenses.month)}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Profit (30d)</span>
            <span className="stat-value">{money(dashboard.profit.month)}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Occupancy</span>
            <span className="stat-value">{dashboard.rooms.occupancy}%</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Active bookings</span>
            <span className="stat-value">{dashboard.activeBookings}</span>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Revenue vs expenses</h2>
          <div className="legend">
            <span className="legend-item"><i className="swatch income" /> Income</span>
            <span className="legend-item"><i className="swatch expense" /> Expense</span>
          </div>
        </div>
        {revenue ? <RevenueChart series={revenue.series} /> : <p className="muted">Loading…</p>}
        {revenue && (
          <p className="muted">
            Totals — income {money(revenue.totals.income)} · expense {money(revenue.totals.expense)} ·
            profit {money(revenue.totals.profit)}
          </p>
        )}
      </div>

      <div className="grid">
        <div className="card">
          <h2>Income by source</h2>
          <table className="table">
            <thead>
              <tr><th>Source</th><th>Count</th><th>Total</th></tr>
            </thead>
            <tbody>
              {bySource.map((s) => (
                <tr key={s.source}>
                  <td>{s.source}</td>
                  <td>{s.count}</td>
                  <td>{money(s.total)}</td>
                </tr>
              ))}
              {!bySource.length && <tr><td colSpan="3" className="muted">No income.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Top selling items</h2>
          <table className="table">
            <thead>
              <tr><th>Item</th><th>Qty</th><th>Revenue</th></tr>
            </thead>
            <tbody>
              {topItems.map((t) => (
                <tr key={t.name}>
                  <td>{t.name}</td>
                  <td>{t.quantity}</td>
                  <td>{money(t.revenue)}</td>
                </tr>
              ))}
              {!topItems.length && <tr><td colSpan="3" className="muted">No sales.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {occupancy && (
        <div className="card">
          <h2>Occupancy (room-nights by check-in date)</h2>
          <p className="muted">{occupancy.totalRooms} rooms total</p>
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Bookings</th><th>Occupancy</th></tr>
            </thead>
            <tbody>
              {occupancy.series.filter((d) => d.bookings > 0).map((d) => (
                <tr key={d.date}>
                  <td>{formatDate(d.date)}</td>
                  <td>{d.bookings}</td>
                  <td>{d.occupancy}%</td>
                </tr>
              ))}
              {!occupancy.series.some((d) => d.bookings > 0) && (
                <tr><td colSpan="3" className="muted">No bookings in period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
