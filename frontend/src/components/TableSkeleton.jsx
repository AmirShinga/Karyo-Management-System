export default function TableSkeleton({ rows = 6, cols = 4 }) {
  return (
    <div className="table-skeleton" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div className="skeleton-row" key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <span className="skeleton-cell" key={c} />
          ))}
        </div>
      ))}
    </div>
  );
}
