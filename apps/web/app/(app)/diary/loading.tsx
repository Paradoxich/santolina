// Navigation skeleton for /diary: header and section heading are static
// copy, so they render as real text immediately; only the note rows pulse.
// Copy must stay verbatim with DiaryClient's header.
export default function DiaryLoading() {
  return (
    <div className="max-w-[669px] pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-item-gap">
        <h1 className="text-title font-semibold text-primary">Plant Diary</h1>
        <p className="text-body text-secondary">
          Save notes, photos, and seasonal changes as your plants evolve.
        </p>
      </header>

      <h2 className="mt-8 text-subheading font-semibold text-primary md:mt-12">
        Notes
      </h2>

      <div
        className="mt-row-gap flex flex-col gap-inline-gap"
        aria-hidden="true"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex w-full flex-col gap-tight-gap border-b border-card p-row-gap"
          >
            <div className="h-5 w-40 animate-pulse rounded bg-surface-card" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-surface-card" />
          </div>
        ))}
      </div>
    </div>
  )
}
