// Fallback navigation skeleton for app routes without their own loading.tsx
// (overview, plants, diary, and explore each ship a route-specific one with
// their real header text). The sidebar lives in the layout and stays put; only
// this content area swaps to the skeleton, so a click feels immediate even
// while data loads. Deliberately generic (title + a few blocks) so it reads as
// "loading" on any remaining route without pretending to be a specific layout.
export default function AppLoading() {
  return (
    <div className="max-w-[1128px] pb-16 pt-8 md:pt-12" aria-hidden="true">
      <div className="h-9 w-40 animate-pulse rounded-md bg-surface-card" />
      <div className="mt-3 h-5 w-72 max-w-full animate-pulse rounded bg-surface-card" />

      <div className="mt-8 flex flex-col gap-section-gap">
        <div className="h-[240px] animate-pulse rounded-lg bg-surface-card" />
        <div className="grid grid-cols-1 gap-section-gap lg:grid-cols-2">
          <div className="h-[200px] animate-pulse rounded-lg bg-surface-card" />
          <div className="h-[200px] animate-pulse rounded-lg bg-surface-card" />
        </div>
      </div>
    </div>
  )
}
