// Navigation skeleton for /plants: the real chrome (tab rail, heading) in
// real text, pulse bars only where data lands. Every route into this page
// lands on the default Growing tab (sidebar, mobile tab bar, dashboard cards
// all link /plants without a tab param), so the rail shows Growing active.
// The one mismatch is a hard reload on ?tab=planned, which flashes the
// Growing header until the palette arrives — accepted trade for instant real
// text on the common path. Tab styles mirror the kit's Tabs; counts are data,
// so the rail omits them while loading.
export default function PlantsLoading() {
  return (
    <div className="pb-16">
      <header className="border-b border-sage-200 pt-8 md:ml-[calc(-1*var(--sidebar-offset))] md:mr-[-3rem] md:pl-[var(--sidebar-offset)] md:pr-12">
        <div className="flex items-start gap-section-gap">
          <span className='relative inline-flex items-start pb-3 text-body font-semibold text-primary after:absolute after:-bottom-px after:left-0 after:h-px after:w-full after:bg-current after:content-[""]'>
            Growing
          </span>
          <span className="inline-flex items-start pb-3 text-body font-normal text-muted">
            Planned
          </span>
        </div>
      </header>

      <h1 className="mt-8 text-title font-semibold text-primary md:mt-12">
        Growing
      </h1>
      <div
        className="mt-3 h-5 w-64 max-w-full animate-pulse rounded bg-surface-card"
        aria-hidden="true"
      />

      <div
        className="mt-11 flex items-center gap-inline-gap overflow-x-auto pb-1"
        aria-hidden="true"
      >
        {[56, 88, 92, 64, 96].map((w, i) => (
          <div
            key={i}
            style={{ width: `${w}px` }}
            className="h-8 shrink-0 animate-pulse rounded-chip bg-surface-card"
          />
        ))}
      </div>

      <div
        className="mt-6 grid grid-cols-1 gap-item-gap md:grid-cols-2 xl:grid-cols-3"
        aria-hidden="true"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse flex-col gap-section-gap rounded-card-tile border border-card-translucent bg-surface-card p-card-padding"
          >
            <div className="h-44 w-full rounded-sm bg-surface-page" />
            <div className="flex flex-col gap-tight-gap">
              <div className="h-5 w-1/2 rounded bg-surface-page" />
              <div className="h-4 w-3/4 rounded bg-surface-page" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
