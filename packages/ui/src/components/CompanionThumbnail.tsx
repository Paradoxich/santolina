import React from 'react'
import { cn } from '../utils/cn'

export interface CompanionThumbnailProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Image URL */
  src: string
  /** Label shown over the image; also used as the image alt text */
  label: string
  /** Override alt text if the label alone isn't descriptive enough */
  alt?: string
  ref?: React.Ref<HTMLDivElement>
}

/**
 * A small image tile with a dark gradient overlay and a label pinned
 * to the bottom-left corner. Sized by its parent (give the container
 * a height; tiles flex to fill the row).
 */
export function CompanionThumbnail({
  src,
  label,
  alt,
  className,
  ref,
  ...props
}: CompanionThumbnailProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative flex h-full min-w-0 flex-1 flex-col items-start justify-end',
        'overflow-hidden rounded-xs',
        'pb-inline-gap pl-item-gap pr-inline-gap',
        className
      )}
      {...props}
    >
      <img
        src={src}
        alt={alt ?? label}
        className="absolute inset-0 size-full object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[image:var(--thumbnail-scrim)]"
      />
      <span className="relative whitespace-nowrap text-label text-inverse">
        {label}
      </span>
    </div>
  )
}

export default CompanionThumbnail
