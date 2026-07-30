export function WorkspaceSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="page-stack" aria-label="Loading workspace" aria-busy="true">
      <section className="glass-card page-header-card skeleton-card">
        <div className="skeleton skeleton-kicker" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-copy" />
      </section>
      <section className="glass-card content-card skeleton-card">
        <div className="skeleton skeleton-section-title" />
        <div className="skeleton-list">
          {Array.from({ length: rows }, (_, index) => (
            <div className="skeleton-row" key={index}>
              <div>
                <div className="skeleton skeleton-line-wide" />
                <div className="skeleton skeleton-line-medium" />
              </div>
              <div className="skeleton skeleton-pill" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
