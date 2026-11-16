import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import { money, formatDate } from '../utils/format';
import usePagedResource from '../hooks/usePagedResource';
import useFocusTrap from '../hooks/useFocusTrap';
import Pagination, { SearchInput } from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';

const TX_TYPES = ['purchase', 'usage', 'wastage', 'adjustment', 'return'];
const emptyItem = { name: '', unit: 'unit', quantity: '', reorderLevel: '', unitCost: '', active: true };
const emptyTx = { type: 'purchase', quantity: '', unitCost: '', reason: '', reference: '' };

export default function Inventory() {
  const { can } = useAuth();
  const canManage = can('inventory.manage');
  const [tab, setTab] = useState('items');
  const items = usePagedResource('/inventory', { initialLimit: 20 });
  const txns = usePagedResource('/inventory/transactions', { initialLimit: 20, immediate: false });

  const [itemDrawer, setItemDrawer] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [txDrawer, setTxDrawer] = useState(null);
  const [txForm, setTxForm] = useState(emptyTx);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const itemRef = useRef(null);
  const txRef = useRef(null);

  useFocusTrap(itemDrawer, itemRef, () => setItemDrawer(false));
  useFocusTrap(!!txDrawer, txRef, () => setTxDrawer(null));

  const openCreate = () => {
    setEditingId(null);
    setItemForm(emptyItem);
    setError('');
    setItemDrawer(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setItemForm({
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      reorderLevel: item.reorderLevel,
      unitCost: item.unitCost,
      active: item.active,
    });
    setError('');
    setItemDrawer(true);
  };

  const submitItem = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (editingId) {
        await api.put(`/inventory/${editingId}`, {
          name: itemForm.name,
          unit: itemForm.unit,
          reorderLevel: Number(itemForm.reorderLevel) || 0,
          unitCost: Number(itemForm.unitCost) || 0,
          active: itemForm.active,
        });
      } else {
        await api.post('/inventory', {
          name: itemForm.name,
          unit: itemForm.unit,
          quantity: Number(itemForm.quantity) || 0,
          reorderLevel: Number(itemForm.reorderLevel) || 0,
          unitCost: Number(itemForm.unitCost) || 0,
          active: itemForm.active,
        });
      }
      setItemDrawer(false);
      await items.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitTx = async (e) => {
    e.preventDefault();
    if (busy || !txDrawer) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/inventory/${txDrawer.id}/transactions`, {
        type: txForm.type,
        quantity: Number(txForm.quantity),
        unitCost: txForm.unitCost === '' ? undefined : Number(txForm.unitCost),
        reason: txForm.reason || null,
        reference: txForm.reference || null,
      });
      setTxDrawer(null);
      setTxForm(emptyTx);
      await items.reload();
      if (tab === 'transactions') await txns.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      await api.delete(`/inventory/${item.id}`);
      await items.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const lowStockCount = items.rows.filter((i) => i.lowStock).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <p className="page-head-sub">Track supplies, stock levels and wastage.</p>
        </div>
        {canManage && tab === 'items' && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} aria-hidden="true" />
            New item
          </button>
        )}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="stat-grid">
        <div className="stat-card"><span className="stat-label">Items</span><div className="stat-value">{items.meta.total}</div></div>
        <div className={`stat-card${lowStockCount ? ' is-danger' : ''}`}><span className="stat-label">Low stock (this page)</span><div className="stat-value">{lowStockCount}</div></div>
      </div>

      <div className="tabs">
        <button className={`tab${tab === 'items' ? ' is-active' : ''}`} onClick={() => setTab('items')}>Items</button>
        <button className={`tab${tab === 'transactions' ? ' is-active' : ''}`} onClick={() => { setTab('transactions'); txns.reload(); }}>Transactions</button>
      </div>

      {tab === 'items' && (
        <div className="card">
          <div className="toolbar">
            <div className="toolbar-filters">
              <SearchInput value={items.filters.search || ''} onChange={(v) => items.setFilter({ search: v })} placeholder="Search items" loading={items.loading} />
              <label className="checkbox-inline">
                <input type="checkbox" checked={items.filters.lowStock === 'true'} onChange={(e) => items.setFilter({ lowStock: e.target.checked ? 'true' : '' })} />
                Low stock only
              </label>
            </div>
          </div>
          <div className="table-responsive">
            {items.loading && !items.rows.length ? (
              <TableSkeleton rows={6} cols={5} />
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Item</th><th>Quantity</th><th>Reorder at</th><th>Unit cost</th><th>Value</th>{canManage && <th></th>}</tr>
                </thead>
                <tbody>
                  {items.rows.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}<div className="text-muted text-sm">{i.unit}{i.active ? '' : ' · inactive'}</div></td>
                      <td className={i.lowStock ? 'priority-high mono' : 'mono'}>{i.quantity}</td>
                      <td className="mono">{i.reorderLevel}</td>
                      <td>{money(i.unitCost)}</td>
                      <td>{money(i.value)}</td>
                      {canManage && (
                        <td className="row-actions">
                          <button className="btn btn-ghost" onClick={() => { setTxDrawer(i); setTxForm({ ...emptyTx, unitCost: i.unitCost }); setError(''); }}>Stock</button>
                          <button className="btn btn-ghost" onClick={() => openEdit(i)}>Edit</button>
                          <button className="btn btn-ghost danger" onClick={() => remove(i)}>Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!items.rows.length && <tr><td colSpan={canManage ? 6 : 5} className="muted">No inventory items.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
          <Pagination page={items.page} pages={items.meta.pages} total={items.meta.total} limit={items.limit} onPage={items.setPage} onLimitChange={items.setLimit} loading={items.loading} />
        </div>
      )}

      {tab === 'transactions' && (
        <div className="card">
          <div className="toolbar">
            <div className="toolbar-filters">
              <select value={txns.filters.type || ''} onChange={(e) => txns.setFilter({ type: e.target.value })} aria-label="Filter by type">
                <option value="">All types</option>
                {TX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="table-responsive">
            {txns.loading && !txns.rows.length ? (
              <TableSkeleton rows={6} cols={5} />
            ) : (
              <table className="table">
                <thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Quantity</th><th>Reason</th><th>By</th></tr></thead>
                <tbody>
                  {txns.rows.map((t) => (
                    <tr key={t.id}>
                      <td>{formatDate(t.createdAt)}</td>
                      <td>{t.itemName || '—'}</td>
                      <td><span className="badge badge-neutral">{t.type}</span></td>
                      <td className="mono">{t.quantity}</td>
                      <td>{t.reason || '—'}</td>
                      <td>{t.recorderName || '—'}</td>
                    </tr>
                  ))}
                  {!txns.rows.length && <tr><td colSpan={6} className="muted">No stock movements.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
          <Pagination page={txns.page} pages={txns.meta.pages} total={txns.meta.total} limit={txns.limit} onPage={txns.setPage} onLimitChange={txns.setLimit} loading={txns.loading} />
        </div>
      )}

      {itemDrawer && (
        <div className="drawer-overlay" onClick={() => setItemDrawer(false)}>
          <div className="drawer" ref={itemRef} role="dialog" aria-modal="true" aria-label={editingId ? 'Edit item' : 'New item'} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2>{editingId ? 'Edit item' : 'New item'}</h2>
              <button type="button" className="icon-btn" onClick={() => setItemDrawer(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <form className="drawer-body" onSubmit={submitItem}>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="inv-name">Name</label>
                  <input id="inv-name" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label htmlFor="inv-unit">Unit</label>
                  <input id="inv-unit" value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} />
                </div>
                {!editingId && (
                  <div className="form-group">
                    <label htmlFor="inv-qty">Opening quantity</label>
                    <input id="inv-qty" type="number" step="0.01" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} />
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="inv-reorder">Reorder level</label>
                  <input id="inv-reorder" type="number" step="0.01" value={itemForm.reorderLevel} onChange={(e) => setItemForm({ ...itemForm, reorderLevel: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="inv-cost">Unit cost</label>
                  <input id="inv-cost" type="number" min="0" step="0.01" value={itemForm.unitCost} onChange={(e) => setItemForm({ ...itemForm, unitCost: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="checkbox-inline">
                    <input type="checkbox" checked={itemForm.active} onChange={(e) => setItemForm({ ...itemForm, active: e.target.checked })} />
                    Active
                  </label>
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setItemDrawer(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {txDrawer && (
        <div className="drawer-overlay" onClick={() => setTxDrawer(null)}>
          <div className="drawer" ref={txRef} role="dialog" aria-modal="true" aria-label="Record stock movement" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2>Record movement · {txDrawer.name}</h2>
              <button type="button" className="icon-btn" onClick={() => setTxDrawer(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <form className="drawer-body" onSubmit={submitTx}>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="tx-type">Type</label>
                  <select id="tx-type" value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}>
                    {TX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="tx-qty">Quantity</label>
                  <input id="tx-qty" type="number" step="0.01" value={txForm.quantity} onChange={(e) => setTxForm({ ...txForm, quantity: e.target.value })} required />
                  <span className="text-muted text-sm">Use a negative value for adjustments that reduce stock.</span>
                </div>
                <div className="form-group">
                  <label htmlFor="tx-cost">Unit cost</label>
                  <input id="tx-cost" type="number" min="0" step="0.01" value={txForm.unitCost} onChange={(e) => setTxForm({ ...txForm, unitCost: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="tx-ref">Reference</label>
                  <input id="tx-ref" value={txForm.reference} onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })} placeholder="Optional" />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="tx-reason">Reason</label>
                  <input id="tx-reason" value={txForm.reason} onChange={(e) => setTxForm({ ...txForm, reason: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setTxDrawer(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Recording…' : 'Record'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
