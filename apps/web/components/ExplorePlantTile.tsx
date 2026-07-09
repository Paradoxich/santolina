import Image from 'next/image'
import { MediaCard } from '@paradoxui/ui'
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
        <Image
          src={plant.imageUrl}
          alt={plant.commonName}
          fill
          sizes="(max-width: 1280px) 50vw, 360px"
          className="object-cover"
        />
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
