import React from 'react'

export interface MediaCardProps {
  /** Image element (e.g. a Next.js `Image` with `fill`) — MediaCard owns the
   * wrapping box, height, and corner radius so it never varies per usage. */
  image: React.ReactNode
  imageHeight: number | string
  title: React.ReactNode
  /** Secondary line under the title, e.g. a botanical name or planting caption. */
  subtitle?: React.ReactNode
  /** Rendered inline next to the title, e.g. a status badge. */
  titleAdornment?: React.ReactNode
  body?: React.ReactNode
  /** Extra classes for the body `<p>` — e.g. `line-clamp-3` — layout only,
   * never typography (size/leading/tracking are fixed). */
  bodyClassName?: string
  footer?: React.ReactNode
  border?: 'solid' | 'dashed'
  as?: 'article' | 'button'
  onClick?: () => void
  className?: string
}

export function MediaCard({
  image,
  imageHeight,
  title,
  subtitle,
  titleAdornment,
  body,
  bodyClassName = '',
  footer,
  border = 'solid',
  as = 'article',
  onClick,
  className = '',
}: MediaCardProps) {
  const chrome = [
    'flex flex-col gap-section-gap rounded-card-tile bg-surface-card p-card-padding',
    border === 'dashed'
      ? 'border border-dashed border-card'
      : 'border border-card',
    className,
  ].join(' ')

  const content = (
    <>
      <div
        className="relative w-full shrink-0 overflow-hidden rounded-sm"
        style={{
          height:
            typeof imageHeight === 'number' ? `${imageHeight}px` : imageHeight,
        }}
      >
        {image}
      </div>
      <div className="flex flex-col gap-inline-gap">
        <div className="flex flex-col gap-tight-gap">
          <div className="flex items-start gap-inline-gap">
            <h3 className="text-heading font-semibold text-primary">{title}</h3>
            {titleAdornment}
          </div>
          {subtitle && (
            <p className="text-body-small italic text-muted">{subtitle}</p>
          )}
        </div>
        {body && (
          <p
            className={['text-body-small text-secondary', bodyClassName].join(
              ' '
            )}
          >
            {body}
          </p>
        )}
      </div>
      {footer && <div className="flex items-start gap-item-gap">{footer}</div>}
    </>
  )

  if (as === 'button') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={[
          chrome,
          'text-left transition-colors duration-normal hover:bg-surface-subtle',
        ].join(' ')}
      >
        {content}
      </button>
    )
  }

  return <article className={chrome}>{content}</article>
}

export default MediaCard
