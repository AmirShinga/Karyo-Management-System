import { useState } from 'react';
import api from '../api/api';
import { money } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import usePagedResource from '../hooks/usePagedResource';
import Pagination, { SearchInput } from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';

const emptyForm = {
  roomNumber: '',
  roomType: '',
  ratePerNight: '',
  capacity: 1,
  status: 'available',
  notes: '',
};

const STATUS_CLASS = {
  available: 'badge badge-ok',
  occupied: 'badge badge-warn',
  maintenance: 'badge badge-off',
};

export default function Rooms() {
  const { can } = useAuth();
  const canCreate = can('rooms.create');
  const canEdit = can('rooms.update');
  const canDelete = can('rooms.delete');
  const canChangeStatus = can('rooms.status');
  const list = usePagedResource('/rooms', { initialLimit: 20 });
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
      roomNumber: form.roomNumber,
      roomType: form.roomType,
      ratePerNight: Number(form.ratePerNight),
      capacity: Number(form.capacity),
      status: form.status,
      notes: form.notes || null,
    };
    try {
      if (editingId) {
        await api.put(`/rooms/${editingId}`, payload);
        setNotice('Room updated.');
      } else {
        await api.post('/rooms', payload);
        setNotice('Room created.');
      }
      resetForm();
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (room) => {
    setEditingId(room.id);
    setForm({
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      ratePerNight: room.ratePerNight,
      capacity: room.capacity,
      status: room.status,
      notes: room.notes || '',
    });
  };

  const changeStatus = async (room, status) => {
    try {
      await api.patch(`/rooms/${room.id}/status`, { status });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (room) => {
    if (!window.confirm(`Delete room ${room.roomNumber}?`)) return;
    try {
      await api.delete(`/rooms/${room.id}`);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>Rooms</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {((editingId && canEdit) || (!editingId && canCreate)) && (
        <div className="card">
          <h2>{editingId ? 'Edit room' : 'Add room'}</h2>
          <form className="form-row" onSubmit={onSubmit}>
            <input
              placeholder="Room number"
              value={form.roomNumber}
              onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
              required
            />
            <input
              placeholder="Room type (e.g. Deluxe)"
              value={form.roomType}
              onChange={(e) => setForm({ ...form, roomType: e.target.value })}
              required
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Rate / night"
              value={form.ratePerNight}
              onChange={(e) => setForm({ ...form, ratePerNight: e.target.value })}
              required
            />
            <input
              type="number"
              min="1"
              placeholder="Capacity"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="available">available</option>
              <option value="occupied">occupied</option>
              <option value="maintenance">maintenance</option>
            </select>
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
              placeholder="Search room number or type"
              loading={list.loading}
            />
            <select
              value={list.filters.status || ''}
              onChange={(e) => list.setFilter({ status: e.target.value })}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </div>
        <div className="table-responsive">
        {list.loading && !list.rows.length ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Room</th>
              <th>Type</th>
              <th>Rate/night</th>
              <th>Capacity</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((room) => (
              <tr key={room.id}>
                <td>{room.roomNumber}</td>
                <td>{room.roomType}</td>
                <td>{money(room.ratePerNight)}</td>
                <td>{room.capacity}</td>
                <td>
                  <span className={STATUS_CLASS[room.status]}>{room.status}</span>
                </td>
                <td className="row-actions">
                  {canChangeStatus && room.status !== 'occupied' && (
                    <button className="btn btn-ghost" onClick={() => changeStatus(room, 'available')}>
                      Mark available
                    </button>
                  )}
                  {canChangeStatus && room.status !== 'maintenance' && (
                    <button className="btn btn-ghost" onClick={() => changeStatus(room, 'maintenance')}>
                      Maintenance
                    </button>
                  )}
                  {canEdit && (
                    <button className="btn btn-ghost" onClick={() => startEdit(room)}>
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button className="btn btn-ghost danger" onClick={() => remove(room)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!list.rows.length && (
              <tr>
                <td colSpan="6" className="muted">
                  No rooms yet.
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
