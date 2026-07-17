import { CollectionShelf } from '@/components/CollectionShelf'
import { buildCollections } from '@/lib/explore-collections'
import type { CatalogPlant } from '@/types/garden'

interface ExploreCollectionsProps {
  plants: CatalogPlant[]
  /** The garden's resolved WGSRPD Level-2 regions — gates the native shelf. */
  gardenRegions: string[]
  /** Current month 1–12, for the seasonal shelf. */
  month: number
  onOpenPlant: (id: string) => void
}

/**
 * The Plant library's browse view: a stack of collection shelves. Shown when
 * nothing is searched or filtered; searching/filtering swaps to the results.
 */
export function ExploreCollections({
  plants,
  gardenRegions,
  month,
  onOpenPlant,
}: ExploreCollectionsProps) {
  const collections = buildCollections(plants, gardenRegions, month)
  if (collections.length === 0) return null

  return (
    <div>
      {collections.map((collection) => (
        <CollectionShelf
          key={collection.id}
          collection={collection}
          onOpenPlant={onOpenPlant}
        />
      ))}
    </div>
  )
}

export default ExploreCollections
