import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/api';

/**
 * Small data hook for paginated list endpoints.
 * Returns rows plus pagination meta and helpers to drive a <Pagination /> control.
 */
export default function usePagedResource(endpoint, options = {}) {
  const { initialLimit = 20, initialFilters = {}, immediate = true } = options;

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: initialLimit, total: 0, pages: 1 });
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState('');

  // Keep a stable string key so effects re-run only when values really change.
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(endpoint, {
        params: { ...JSON.parse(filtersKey), page, limit },
      });
      if (id !== requestId.current) return;
      setRows(res.data.data || []);
      if (res.data.meta) setMeta(res.data.meta);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message || 'Failed to load data');
      setRows([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [endpoint, filtersKey, page, limit]);

  useEffect(() => {
    if (!immediate) return undefined;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (active) load();
    })();
    return () => {
      active = false;
    };
  }, [load, immediate]);

  const setFilter = useCallback((patch) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setPage(1);
    setFilters(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeLimit = useCallback((nextLimit) => {
    setPage(1);
    setLimit(nextLimit);
  }, []);

  return {
    rows,
    meta,
    page,
    limit,
    filters,
    loading,
    error,
    reload: load,
    setPage,
    setLimit: changeLimit,
    setFilter,
    setFilters,
    resetFilters,
  };
}
