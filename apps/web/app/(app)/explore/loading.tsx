// Navigation skeleton for /explore: static header copy renders as real text,
// the search rail keeps its real footprint (h-10 field + filter box), and the
// browse area below the full-bleed rule pulses as tile rows. Copy must stay
// verbatim with ExploreClient's header.
export default function ExploreLoading() {
  return (
    <div className="flex items-start pb-12 pt-8 md:pb-16 md:pt-12">
      <div className="min-w-0 flex-1">
        <header className="flex flex-col gap-item-gap">
          <h1 className="text-title font-semibold tracking-title text-primary">
            Plant library
          </h1>
          <p className="text-body text-secondary">
            Find plants that fit your conditions, style or region.
          </p>
        </header>

        <div className="mt-4 py-4" aria-hidden="true">
          <div className="flex items-center gap-inline-gap">
            <div className="h-10 flex-1 animate-pulse rounded-md border bg-surface-card [border-color:var(--color-sage-100)]" />
            <div className="h-10 w-12 shrink-0 animate-pulse rounded-md border bg-surface-card [border-color:var(--color-sage-100)]" />
          </div>
        </div>

        <div className="mt-8" aria-hidden="true">
          <hr className="-mx-4 border-[var(--sidebar-divider)] md:-mx-content-bleed" />
          <div className="flex flex-col gap-row-gap pt-12">
            <div className="h-6 w-32 animate-pulse rounded bg-surface-card" />
            <div className="grid grid-cols-2 gap-item-gap md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-card-tile bg-surface-card"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
