'use client'

/**
 * The hero gallery: one large photo with the rest stacked beside it, every
 * tile opening the lightbox at its own index.
 *
 * Degrades by count rather than padding the grid with blanks — a plant with
 * two photos gets a two-up, one photo gets a single frame. The catalog has
 * plants with a single usable photograph and several with none at all.
 */

import { PlantImage } from '@/components/PlantImage'

interface PlantGalleryProps {
  photos: string[]
  plantName: string
  onPhotoClick: (index: number) => void
}

const FRAME =
  'relative overflow-hidden rounded-md bg-surface-inset transition-opacity duration-normal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

export function PlantGallery({
  photos,
  plantName,
  onPhotoClick,
}: PlantGalleryProps) {
  // No photograph at all: a single empty frame, so the hero keeps its shape
  // instead of collapsing and shifting the text column.
  if (photos.length === 0) {
    return (
      <div className={`${FRAME} aspect-[3/2] w-full`}>
        <PlantImage
          src={null}
          alt={plantName}
          fill
          sizes="520px"
          className="object-cover"
        />
      </div>
    )
  }

  const [lead, ...rest] = photos
  const stack = rest.slice(0, 3)

  const tile = (src: string, index: number, className: string) => (
    <button
      key={index}
      type="button"
      onClick={() => onPhotoClick(index)}
      aria-label={`View ${plantName} photo ${index + 1}`}
      className={`${FRAME} ${className} cursor-pointer`}
    >
      <PlantImage
        src={src}
        alt={`${plantName} photo ${index + 1}`}
        fill
        sizes={index === 0 ? '380px' : '160px'}
        className="object-cover"
      />
    </button>
  )

  if (stack.length === 0) {
    return <div className="w-full">{tile(lead!, 0, 'aspect-[3/2] w-full')}</div>
  }

  return (
    <div className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-tight-gap">
      {tile(lead!, 0, 'h-full min-h-[240px]')}
      {/* The stack divides the lead's height, so two photos give two tall
          tiles and three give three shorter ones — no fixed row heights to
          fall out of step with the lead. */}
      <div className="grid gap-tight-gap" style={{ gridAutoRows: '1fr' }}>
        {stack.map((src, i) => tile(src, i + 1, 'w-full'))}
      </div>
    </div>
  )
}

export default PlantGallery
