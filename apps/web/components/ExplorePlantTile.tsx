import { MediaCard } from '@paradoxui/ui'
import { PlantImage } from '@/components/PlantImage'
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
        <PlantImage
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
