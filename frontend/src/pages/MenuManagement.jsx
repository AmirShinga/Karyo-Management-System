import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/api';
import { money } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import usePagedResource from '../hooks/usePagedResource';
import Pagination, { SearchInput } from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';

const emptyForm = { name: '', category: '', price: '', cost: '', sortOrder: '', available: true };

export default function MenuManagement() {
  const { can } = useAuth();
  const { revision } = useSocket();
  const canCreate = can('menu.create');
  const canUpdate = can('menu.update');
  const canDelete = can('menu.delete');
  const canManage = canCreate || canUpdate || canDelete;
  const list = usePagedResource('/menu', { initialLimit: 20 });
  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const reload = list.reload;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/menu-categories?limit=100');
        if (!cancelled) setCategories(res.data.data);
      } catch {
        // Category list is non-critical for rendering the page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    const payload = {
      name: form.name,
      category: form.category,
      price: Number(form.price),
      cost: form.cost ? Number(form.cost) : 0,
      sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
      available: form.available,
    };
    try {
      if (editingId) {
        await api.put(`/menu/${editingId}`, payload);
        setNotice('Item updated.');
      } else {
        await api.post('/menu', payload);
        setNotice('Item added.');
      }
      resetForm();
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      price: item.price,
      cost: item.cost,
      sortOrder: item.sortOrder,
      available: item.available,
    });
  };

  const toggleAvailable = async (item) => {
    try {
      await api.patch(`/menu/${item.id}/availability`, { available: !item.available });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await api.delete(`/menu/${item.id}`);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>Menu</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {((editingId && canUpdate) || (!editingId && canCreate)) && (
        <div className="card">
          <h2>{editingId ? 'Edit item' : 'Add item'}</h2>
          {!categories.length && (
            <p className="muted">
              No food categories yet — add some on the <Link to="/categories">Categories</Link> page first.
            </p>
          )}
          <form className="form-row" onSubmit={onSubmit}>
            <input
              placeholder="Item name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              required
              aria-label="Category"
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
              {form.category && !categories.some((c) => c.name === form.category) && (
                <option value={form.category}>{form.category} (unregistered)</option>
              )}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Price"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Cost (optional)"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
            />
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Order (POS)"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              aria-label="Display order in POS"
            />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {editingId ? 'Save' : 'Add'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-ghost" onClick={resetForm}>
                Cancel
              </button>
            )}
          </form>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-filters">
            <SearchInput
              value={list.filters.search || ''}
              onChange={(v) => list.setFilter({ search: v })}
              placeholder="Search name or category"
              loading={list.loading}
            />
          </div>
        </div>
        <div className="table-responsive">
        {list.loading && !list.rows.length ? (
          <TableSkeleton rows={6} cols={canManage ? 7 : 6} />
        ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Cost</th>
              <th>Order</th>
              <th>Status</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {list.rows.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.category}</td>
                <td>{money(item.price)}</td>
                <td>{money(item.cost)}</td>
                <td>{item.sortOrder}</td>
                <td>
                  <span className={item.available ? 'badge badge-ok' : 'badge badge-off'}>
                    {item.available ? 'available' : 'unavailable'}
                  </span>
                </td>
                {canManage && (
                  <td className="row-actions">
                    {canUpdate && (
                      <button className="btn btn-ghost" onClick={() => toggleAvailable(item)}>
                        {item.available ? 'Disable' : 'Enable'}
                      </button>
                    )}
                    {canUpdate && (
                      <button className="btn btn-ghost" onClick={() => startEdit(item)}>
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn btn-ghost danger" onClick={() => remove(item)}>
                        Delete
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!list.rows.length && (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="muted">
                  No menu items yet.
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
