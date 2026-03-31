export function SkeletonLine({ className = '' }) {
  return <div className={`skeleton h-4 w-full ${className}`} />;
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`skeleton h-4 ${i === 0 ? 'w-3/4' : i === lines - 1 ? 'w-1/2' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: cols }, (_, colIndex) => (
            <div
              key={colIndex}
              className={`skeleton h-4 flex-1 ${colIndex === 0 ? 'max-w-30' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-slate-100 bg-white p-5 space-y-3">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}
