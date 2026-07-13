import Image from 'next/image'
import { MediaCard, Icon } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import type { CatalogPlant } from '@/types/garden'

interface ExplorePlantTileProps {
  plant: CatalogPlant
  onClick?: () => void
}

export function ExplorePlantTile({ plant, onClick }: ExplorePlantTileProps) {
  return (
    <MediaCard
      as="button"
      onClick={onClick}
      image={
        plant.imageUrl ? (
          <Image
            src={plant.imageUrl}
            alt={plant.commonName}
            fill
            sizes="(max-width: 1280px) 50vw, 360px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-subtle">
            <Icon src={icons.leaf} size={32} className="opacity-40" />
          </div>
        )
      }
      imageHeight={162}
      title={plant.commonName}
      subtitle={plant.botanicalName}
      body={plant.description}
      bodyClassName="line-clamp-2"
    />
  )
}

export default ExplorePlantTile
