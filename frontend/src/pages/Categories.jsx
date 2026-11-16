import { useState } from 'react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import usePagedResource from '../hooks/usePagedResource';
import Pagination, { SearchInput } from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';

const emptyForm = { name: '', sortOrder: '' };

export default function Categories() {
  const { can } = useAuth();
  const canCreate = can('categories.create');
  const canUpdate = can('categories.update');
  const canDelete = can('categories.delete');
  const canManage = canCreate || canUpdate || canDelete;
  const list = usePagedResource('/menu-categories', { initialLimit: 20 });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const reload = list.reload;

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
      sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
    };
    try {
      if (editingId) {
        await api.put(`/menu-categories/${editingId}`, payload);
        setNotice('Category updated.');
      } else {
        await api.post('/menu-categories', payload);
        setNotice('Category added.');
      }
      resetForm();
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (category) => {
    setEditingId(category.id);
    setForm({ name: category.name, sortOrder: category.sortOrder });
  };

  const remove = async (category) => {
    if (!window.confirm(`Delete "${category.name}"?`)) return;
    try {
      await api.delete(`/menu-categories/${category.id}`);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>Food categories</h1>
      <p className="page-head-sub">
        Register the categories used when adding dishes and to filter the POS.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {((editingId && canUpdate) || (!editingId && canCreate)) && (
        <div className="card">
          <h2>{editingId ? 'Edit category' : 'Add category'}</h2>
          <form className="form-row" onSubmit={onSubmit}>
            <input
              placeholder="Category name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
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
              placeholder="Search categories"
              loading={list.loading}
            />
          </div>
        </div>
        <div className="table-responsive">
          {list.loading && !list.rows.length ? (
            <TableSkeleton rows={6} cols={canManage ? 3 : 2} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Order</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {list.rows.map((category) => (
                  <tr key={category.id}>
                    <td>{category.name}</td>
                    <td>{category.sortOrder}</td>
                    {canManage && (
                      <td className="row-actions">
                        {canUpdate && (
                          <button className="btn btn-ghost" onClick={() => startEdit(category)}>
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button className="btn btn-ghost danger" onClick={() => remove(category)}>
                            Delete
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {!list.rows.length && (
                  <tr>
                    <td colSpan={canManage ? 3 : 2} className="muted">
                      No categories yet.
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
