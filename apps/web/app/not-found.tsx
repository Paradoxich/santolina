import Image from 'next/image'
import Link from 'next/link'

/**
 * The 404 as an uncatalogued herbarium specimen (Figma node 641:118):
 * Ana's plate (Genus incognitum, "Pagina perdita" concept) rendered as a
 * taped-in sheet — rotated 5.25deg with two torn washi-tape strips over
 * the corners. The sheet + tape composition is sized in percentages of
 * the rotation bounds (572x561 at full size) so it scales as one piece.
 *
 * The plate art is decorative (empty alt) — the heading carries the
 * meaning. Export notes and pending follow-ups (Tab. CDIV, Specimen No.
 * 404, PNG-8 re-export) live in the Build Backlog.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center overflow-x-clip bg-surface-page px-card-padding pb-12 text-center">
      <div className="relative aspect-[572/561] w-full max-w-[572px]">
        {/* The paper sheet. Ana's export is transparent, so the sheet color
            comes from the comp (#ecf1ed) — part of the illustration, not UI
            chrome; candidate for the decorative token tier. */}
        <div className="absolute left-1/2 top-1/2 w-[92.15%] -translate-x-1/2 -translate-y-1/2 rotate-[5.25deg] bg-[#ecf1ed]">
          <Image
            src="/illustrations/pagina-perdita.png"
            alt=""
            width={527}
            height={515}
            priority
            unoptimized
            className="block w-full"
          />
        </div>
        {/* Tape strips over the sheet corners; centers in % of the rotation
            bounds, from the Figma comp. The SVG declares no intrinsic ratio
            (preserveAspectRatio="none"), so the aspect is pinned here. */}
        <img
          src="/illustrations/tape.svg"
          alt=""
          aria-hidden="true"
          className="absolute left-[95.5%] top-[10.7%] aspect-[141/30] w-[24.8%] -translate-x-1/2 -translate-y-1/2 rotate-45"
        />
        <img
          src="/illustrations/tape.svg"
          alt=""
          aria-hidden="true"
          className="absolute left-[4.6%] top-[88.2%] aspect-[141/30] w-[24.8%] -translate-x-1/2 -translate-y-1/2 rotate-45"
        />
      </div>
      <div className="mt-6 flex max-w-[440px] flex-col items-center gap-item-gap">
        <p className="text-body-small italic text-secondary">404</p>
        <h1 className="text-title font-semibold tracking-[-0.04em] text-primary">
          This one isn&apos;t in the catalog.
        </h1>
      </div>
      <Link
        href="/dashboard"
        className="mt-8 flex h-8 items-center justify-center rounded-sm bg-accent px-inline-gap text-body-small text-on-accent transition-colors duration-normal hover:bg-accent-hover"
      >
        Back to Dashboard
      </Link>
    </main>
  )
}
