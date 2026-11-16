import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const LIMIT_OPTIONS = [10, 20, 50, 100];

function pageWindow(page, pages) {
  const window = 5;
  let start = Math.max(1, page - Math.floor(window / 2));
  const end = Math.min(pages, start + window - 1);
  start = Math.max(1, end - window + 1);
  const list = [];
  for (let i = start; i <= end; i += 1) list.push(i);
  return list;
}

export default function Pagination({ page, pages = 1, total = 0, limit, onPage, onLimitChange, loading }) {
  const numbers = useMemo(() => pageWindow(page, pages), [page, pages]);
  if (!total && pages <= 1 && !onLimitChange) return null;

  const go = (next) => {
    if (loading) return;
    if (next >= 1 && next <= pages && next !== page) onPage(next);
  };

  return (
    <div className="pagination" role="navigation" aria-label="Pagination">
      <span className="pagination-info">
        {total > 0
          ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}`
          : 'No results'}
      </span>

      <div className="pagination-pages">
        <button
          type="button"
          className="pagination-btn"
          onClick={() => go(page - 1)}
          disabled={page <= 1 || loading}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>

        {numbers[0] > 1 && (
          <>
            <button type="button" className="pagination-btn" onClick={() => go(1)} disabled={loading}>
              1
            </button>
            {numbers[0] > 2 && <span className="pagination-gap">…</span>}
          </>
        )}

        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            className={`pagination-btn${n === page ? ' is-active' : ''}`}
            onClick={() => go(n)}
            disabled={loading}
            aria-current={n === page ? 'page' : undefined}
          >
            {n}
          </button>
        ))}

        {numbers[numbers.length - 1] < pages && (
          <>
            {numbers[numbers.length - 1] < pages - 1 && <span className="pagination-gap">…</span>}
            <button type="button" className="pagination-btn" onClick={() => go(pages)} disabled={loading}>
              {pages}
            </button>
          </>
        )}

        <button
          type="button"
          className="pagination-btn"
          onClick={() => go(page + 1)}
          disabled={page >= pages || loading}
          aria-label="Next page"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      {onLimitChange && (
        <label className="pagination-limit">
          <span className="sr-only">Rows per page</span>
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            disabled={loading}
          >
            {LIMIT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt} / page
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** Debounced text input used for list search fields. */
export function SearchInput({ value, onChange, placeholder = 'Search…', loading }) {
  const [local, setLocal] = useState(value ?? '');
  const timer = useRef(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handle = useCallback(
    (next) => {
      setLocal(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onChange(next), 350);
    },
    [onChange]
  );

  return (
    <div className="search-input">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="search-icon">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20l-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={local}
        onChange={(e) => handle(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {loading && <span className="auth-spinner search-spinner" aria-hidden="true" />}
    </div>
  );
}
