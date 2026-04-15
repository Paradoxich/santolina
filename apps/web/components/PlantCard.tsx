'use client'

import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Avatar,
  Badge,
  Button,
} from '@paradoxui/ui'
import type { Plant } from '@/types/plant'
import { daysSince, formatDate } from '@/lib/utils'

interface PlantCardProps {
  plant: Plant
  onWater?: (id: string) => void
  onViewDetails?: (id: string) => void
}

const statusVariantMap: Record<
  Plant['status'],
  'success' | 'warning' | 'error' | 'default'
> = {
  healthy: 'success',
  'needs-water': 'warning',
  critical: 'error',
  dormant: 'default',
}

const statusLabelMap: Record<Plant['status'], string> = {
  healthy: 'Healthy',
  'needs-water': 'Needs water',
  critical: 'Critical',
  dormant: 'Dormant',
}

export function PlantCard({ plant, onWater, onViewDetails }: PlantCardProps) {
  const initials = plant.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Card>
      <CardHeader>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-3)',
          }}
        >
          <Avatar
            src={plant.imageUrl}
            initials={initials}
            alt={plant.name}
            size="md"
          />
          <div>
            <p
              style={{
                margin: 0,
                fontWeight: 'var(--font-weight-semibold)',
                fontSize: 'var(--font-size-md)',
                color: 'var(--color-neutral-900)',
              }}
            >
              {plant.name}
            </p>
            {plant.species && (
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-neutral-500)',
                  fontStyle: 'italic',
                }}
              >
                {plant.species}
              </p>
            )}
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Badge variant={statusVariantMap[plant.status]}>
              {statusLabelMap[plant.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {plant.lastWatered && (
          <p
            style={{
              margin: 0,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-neutral-600)',
            }}
          >
            Last watered: {formatDate(plant.lastWatered)} (
            {daysSince(plant.lastWatered)}d ago)
          </p>
        )}
        {plant.notes && (
          <p
            style={{
              margin: 'var(--spacing-2) 0 0',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-neutral-600)',
            }}
          >
            {plant.notes}
          </p>
        )}
      </CardBody>
      <CardFooter>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
          {onWater && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onWater(plant.id)}
            >
              Water now
            </Button>
          )}
          {onViewDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewDetails(plant.id)}
            >
              Details
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}

export default PlantCard
