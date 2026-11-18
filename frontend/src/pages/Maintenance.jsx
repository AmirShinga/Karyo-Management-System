import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import api from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { money, formatDate } from '../utils/format';
import usePagedResource from '../hooks/usePagedResource';
import useFocusTrap from '../hooks/useFocusTrap';
import Pagination, { SearchInput } from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };

const emptyForm = { roomId: '', title: '', description: '', category: 'general', priority: 'medium', cost: '', assignedTo: '' };

export default function Maintenance() {
  const { can } = useAuth();
  const { revision } = useSocket();
  const canManage = can('maintenance.manage');
  const list = usePagedResource('/maintenance', { initialLimit: 20 });
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drawerRef = useRef(null);

  useFocusTrap(drawerOpen, drawerRef, () => setDrawerOpen(false));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [roomsRes, usersRes] = await Promise.all([
          api.get('/rooms', { params: { limit: 100 } }),
          api.get('/auth/users', { params: { limit: 100 } }).catch(() => ({ data: { data: [] } })),
        ]);
        if (!cancelled) {
          setRooms(roomsRes.data.data || []);
          setUsers(usersRes.data.data || []);
        }
      } catch {
        // Non-fatal.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setDrawerOpen(true);
  };

  const openEdit = (req) => {
    setEditingId(req.id);
    setForm({
      roomId: req.roomId || '',
      title: req.title,
      description: req.description || '',
      category: req.category,
      priority: req.priority,
      cost: req.cost,
      assignedTo: req.assignedTo || '',
    });
    setError('');
    setDrawerOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const payload = {
      roomId: form.roomId ? Number(form.roomId) : null,
      title: form.title,
      description: form.description || null,
      category: form.category,
      priority: form.priority,
      cost: Number(form.cost) || 0,
      assignedTo: form.assignedTo ? Number(form.assignedTo) : null,
    };
    try {
      if (editingId) await api.put(`/maintenance/${editingId}`, payload);
      else await api.post('/maintenance', payload);
      setDrawerOpen(false);
      await list.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (req, status) => {
    try {
      await api.patch(`/maintenance/${req.id}/status`, { status });
      await list.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (req) => {
    if (!window.confirm('Delete this maintenance request?')) return;
    try {
      await api.delete(`/maintenance/${req.id}`);
      await list.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const priorityClass = (p) => (p === 'urgent' ? 'priority-urgent' : p === 'high' ? 'priority-high' : '');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Maintenance</h1>
          <p className="page-head-sub">Log repairs, assign technicians and track costs.</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} aria-hidden="true" />
            New request
          </button>
        )}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="toolbar">
        <div className="toolbar-filters">
          <SearchInput value={list.filters.search || ''} onChange={(v) => list.setFilter({ search: v })} placeholder="Search title, room, description" loading={list.loading} />
          <select value={list.filters.status || ''} onChange={(e) => list.setFilter({ status: e.target.value })} aria-label="Filter by status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select value={list.filters.priority || ''} onChange={(e) => list.setFilter({ priority: e.target.value })} aria-label="Filter by priority">
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          {list.loading && !list.rows.length ? (
            <TableSkeleton rows={6} cols={6} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th><th>Room</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Cost</th><th>Reported</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {list.rows.map((m) => (
                  <tr key={m.id}>
                    <td>{m.title}<div className="text-muted text-sm">{m.category}</div></td>
                    <td>{m.roomNumber || '—'}</td>
                    <td className={priorityClass(m.priority)}>{m.priority}</td>
                    <td>
                      {canManage ? (
                        <select value={m.status} onChange={(e) => setStatus(m, e.target.value)} aria-label="Update status">
                          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      ) : (
                        <span className="badge badge-neutral">{STATUS_LABEL[m.status]}</span>
                      )}
                    </td>
                    <td>{m.assigneeName || '—'}</td>
                    <td>{money(m.cost)}</td>
                    <td>{formatDate(m.createdAt)}</td>
                    {canManage && (
                      <td className="row-actions">
                        <button className="btn btn-ghost" onClick={() => openEdit(m)}>Edit</button>
                        <button className="btn btn-ghost danger" onClick={() => remove(m)}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
                {!list.rows.length && (
                  <tr><td colSpan={canManage ? 8 : 7} className="muted">No maintenance requests.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={list.page} pages={list.meta.pages} total={list.meta.total} limit={list.limit} onPage={list.setPage} onLimitChange={list.setLimit} loading={list.loading} />
      </div>

      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label={editingId ? 'Edit request' : 'New request'} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2>{editingId ? 'Edit request' : 'New request'}</h2>
              <button type="button" className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <form className="drawer-body" onSubmit={submit}>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="mt-title">Title</label>
                  <input id="mt-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label htmlFor="mt-room">Room</label>
                  <select id="mt-room" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                    <option value="">— none —</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.roomNumber} · {r.roomType}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="mt-category">Category</label>
                  <input id="mt-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="mt-priority">Priority</label>
                  <select id="mt-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="mt-cost">Estimated cost</label>
                  <input id="mt-cost" type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="mt-assignee">Assignee</label>
                  <select id="mt-assignee" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
                    <option value="">— unassigned —</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="mt-desc">Description</label>
                  <input id="mt-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <div className="drawer-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setDrawerOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
