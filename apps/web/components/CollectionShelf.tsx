'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CollectionCard } from '@/components/CollectionCard'
import type { Collection } from '@/lib/explore-collections'

interface CollectionShelfProps {
  collection: Collection
  onOpenPlant: (id: string) => void
}

// How far the cards dissolve into the background at the (left) scrolled edge.
const FADE = '48px'

/**
 * One browse collection: a title (+ optional subtitle) above a horizontally
 * scrolling row of plant tiles. The row bleeds to the page's right edge so
 * cards scroll into the corner; the left edge fades into the background once
 * scrolled.
 */
export function CollectionShelf({
  collection,
  onOpenPlant,
}: CollectionShelfProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  const update = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const next = el.scrollLeft > 1
    setScrolled((prev) => (prev === next ? prev : next))
  }, [])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update])

  const maskImage = `linear-gradient(to right, ${
    scrolled ? 'transparent' : '#000'
  } 0, #000 ${FADE}, #000 100%)`

  return (
    <section className="mt-12 first:mt-10">
      <h2 className="text-subheading font-semibold text-primary">
        {collection.title}
      </h2>
      {collection.subtitle && (
        <p className="mt-1 text-body-small text-secondary">
          {collection.subtitle}
        </p>
      )}

      <div
        ref={scrollRef}
        onScroll={update}
        style={{ maskImage, WebkitMaskImage: maskImage }}
        className="mt-4 -mr-4 flex gap-item-gap overflow-x-auto pr-4 [scrollbar-width:none] md:-mr-12 md:pr-12 [&::-webkit-scrollbar]:hidden"
      >
        {collection.plants.map((plant) => (
          <div key={plant.id} className="w-[300px] shrink-0">
            <CollectionCard
              plant={plant}
              onClick={() => onOpenPlant(plant.id)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

export default CollectionShelf
