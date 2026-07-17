import { ExplorePlantTile } from '@/components/ExplorePlantTile'
import type { Collection } from '@/lib/explore-collections'

interface CollectionShelfProps {
  collection: Collection
  onOpenPlant: (id: string) => void
}

/**
 * One browse collection: a title (+ optional subtitle) above a horizontally
 * scrolling row of plant tiles.
 */
export function CollectionShelf({
  collection,
  onOpenPlant,
}: CollectionShelfProps) {
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

      <div className="mt-4 flex gap-item-gap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {collection.plants.map((plant) => (
          <div key={plant.id} className="w-[240px] shrink-0">
            <ExplorePlantTile
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
