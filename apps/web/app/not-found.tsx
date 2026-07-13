import Image from 'next/image'
import Link from 'next/link'

/**
 * The 404 as an uncatalogued specimen: a botanical plate of a plant that
 * doesn't exist (Pagina perdita, "lost page"), in the empty-state engraving
 * style. The binomial label is hand-drawn inside the artwork; the copy
 * stays dry per the copy rules. Illustration is decorative (empty alt) —
 * the heading carries the meaning.
 *
 * pagina-perdita.png is currently a placeholder block — swap in Ana's
 * export at its final dimensions (raster at exact 1x/2x, PNG-8; the dither
 * moirés if the browser rescales it).
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-section-gap bg-surface-page px-card-padding text-center">
      <Image
        src="/illustrations/pagina-perdita.png"
        alt=""
        width={280}
        height={340}
        priority
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
