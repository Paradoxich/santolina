import Image from 'next/image'
import Link from 'next/link'

/**
 * The 404 as an uncatalogued specimen: a botanical plate of a plant that
 * doesn't exist (Pagina perdita, "lost page"), in the empty-state engraving
 * style. The binomial label is hand-drawn inside the artwork; the copy
 * stays dry per the copy rules. Illustration is decorative (empty alt) —
 * the heading carries the meaning.
 *
 * pagina-perdita.png is Ana's 1140x1113 export displayed at exactly half
 * size (570x557), so retina screens sample it 1:1 and standard screens get
 * a clean integer 2:1 downscale — the dither moirés under fractional
 * rescaling, which is also why the image opts out of Next's optimizer.
 * Follow-up (tracked in the backlog): re-export as PNG-8 indexed to cut
 * the 858KB weight; dither palettes compress extremely well.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-section-gap bg-surface-page px-card-padding text-center">
      <Image
        src="/illustrations/pagina-perdita.png"
        alt=""
        width={570}
        height={557}
        priority
        unoptimized
      />
      <div className="flex max-w-[440px] flex-col items-center gap-inline-gap">
        <p className="text-label font-medium uppercase tracking-[0.05em] text-muted">
          Error 404
        </p>
        <h1 className="text-title font-semibold text-primary">
          This one isn&apos;t in the catalog.
        </h1>
      </div>
      <Link
        href="/dashboard"
        className="flex h-8 items-center justify-center rounded-sm bg-surface-inverse px-inline-gap text-body-small text-on-accent transition-colors duration-normal hover:opacity-90"
      >
        Back to dashboard
      </Link>
    </main>
  )
}
