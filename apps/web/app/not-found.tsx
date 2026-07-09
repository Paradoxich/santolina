import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-section-gap bg-surface-page px-card-padding text-center">
      <div className="flex max-w-[440px] flex-col items-center gap-inline-gap">
        <p className="text-label font-medium uppercase tracking-[0.05em] text-muted">
          Error 404
        </p>
        <h1 className="text-title font-semibold text-primary">
          Page not found
        </h1>
        <p className="text-body text-secondary">
          The page you&apos;re looking for isn&apos;t here. It may have moved,
          or the link may be wrong.
        </p>
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
