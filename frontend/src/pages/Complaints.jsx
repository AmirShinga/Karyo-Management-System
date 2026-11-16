import { useState } from 'react';
import { CheckCircle2, Inbox, RotateCcw, Send } from 'lucide-react';
import api from '../api/api';
import { formatDateTime } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import usePagedResource from '../hooks/usePagedResource';
import Pagination, { SearchInput } from '../components/Pagination';
import TableSkeleton from '../components/TableSkeleton';

const EMPTY_FORM = { subject: '', message: '' };

export default function Complaints() {
  const { can, roleLabel } = useAuth();
  const canCreate = can('complaints.create');
  const canManage = can('complaints.manage');
  const list = usePagedResource('/complaints', { initialLimit: 20 });
  const [form, setForm] = useState(EMPTY_FORM);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await api.post('/complaints', form);
      setForm(EMPTY_FORM);
      setNotice('Complaint sent to the owner.');
      await list.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const setNote = (id, value) => setNotes((prev) => ({ ...prev, [id]: value }));

  const changeStatus = async (item, status) => {
    setError('');
    setNotice('');
    setBusyId(item.id);
    try {
      const ownerNote = (notes[item.id] || '').trim();
      await api.patch(`/complaints/${item.id}`, {
        status,
        ...(ownerNote ? { ownerNote } : {}),
      });
      setNotice(status === 'resolved' ? 'Complaint marked resolved.' : 'Complaint reopened.');
      setNotes((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await list.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const items = list.rows;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Complaints</h1>
          <p className="page-head-sub">
            {canManage
              ? 'Review and respond to issues raised by the team.'
              : 'Send an issue to the owner and follow their response here.'}
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {canCreate && (
        <div className="card">
          <h2>New complaint</h2>
          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="complaint-subject">Subject</label>
              <input
                id="complaint-subject"
                placeholder="e.g. Water leak in room 204"
                value={form.subject}
                maxLength={160}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="complaint-message">Details</label>
              <textarea
                id="complaint-message"
                placeholder="Describe what happened and what you need."
                rows={4}
                value={form.message}
                maxLength={4000}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              <Send size={16} aria-hidden="true" />
              {loading ? 'Sending…' : 'Send to owner'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-filters">
            <SearchInput
              value={list.filters.search || ''}
              onChange={(v) => list.setFilter({ search: v })}
              placeholder="Search subject or message"
              loading={list.loading}
            />
            <select
              value={list.filters.status || ''}
              onChange={(e) => list.setFilter({ status: e.target.value })}
              aria-label="Filter complaints"
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>

        {list.loading && !items.length ? (
          <TableSkeleton rows={4} cols={1} />
        ) : !items.length ? (
          <div className="card complaints-empty">
            <Inbox size={28} aria-hidden="true" />
            <p className="muted">No complaints found.</p>
          </div>
        ) : (
          <div className="complaint-list">
            {items.map((item) => (
              <article className="card complaint-card" key={item.id}>
                <div className="complaint-head">
                  <div>
                    <h3>{item.subject}</h3>
                    <p className="muted small">
                      From {item.creatorName}
                      {item.creatorRole ? ` (${roleLabel(item.creatorRole)})` : ''} ·{' '}
                      {formatDateTime(item.createdAt, true)}
                    </p>
                  </div>
                  <span className={`badge ${item.status === 'open' ? 'badge-warn' : 'badge-ok'}`}>
                    {item.status === 'open' ? 'Open' : 'Resolved'}
                  </span>
                </div>

                <p className="complaint-message">{item.message}</p>

                {item.ownerNote && (
                  <p className="complaint-note">
                    <strong>Owner note:</strong> {item.ownerNote}
                  </p>
                )}

                {item.resolvedAt && (
                  <p className="muted small">
                    Resolved by {item.resolverName || 'owner'} · {formatDateTime(item.resolvedAt, true)}
                  </p>
                )}

                {canManage && (
                  <div className="complaint-actions">
                    {item.status === 'open' ? (
                      <>
                        <input
                          placeholder="Optional note back to the team"
                          value={notes[item.id] || ''}
                          onChange={(e) => setNote(item.id, e.target.value)}
                          aria-label="Owner note"
                        />
                        <button
                          className="btn btn-primary"
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => changeStatus(item, 'resolved')}
                        >
                          <CheckCircle2 size={16} aria-hidden="true" />
                          Resolve
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => changeStatus(item, 'open')}
                      >
                        <RotateCcw size={16} aria-hidden="true" />
                        Reopen
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
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
