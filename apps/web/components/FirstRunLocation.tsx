'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardBody } from '@paradoxui/ui'
import { CitySearch } from '@/components/CitySearch'
import { type GeocodingResult } from '@/lib/open-meteo'
import { setGardenLocation } from '@/server/garden-actions'

// NOTE: functional copy + layout, not yet through Ana's voice/design pass.
export function FirstRunLocation() {
  const router = useRouter()
  const [selectingId, setSelectingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSelect(city: GeocodingResult) {
    setSelectingId(city.id)
    setError(null)
    try {
      await setGardenLocation({
        city: city.name,
        country: city.country,
        lat: city.latitude,
        lon: city.longitude,
      })
      // Location set — the app is now reachable; the gate will let us through.
      router.replace('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSelectingId(null)
    }
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading text-primary">Where is your garden?</h1>
          <p className="text-body-small text-secondary">
            We use your location for local weather and seasonal timing. You can
            change it later in settings.
          </p>
        </div>

        {error && (
          <p className="text-body-small text-critical" role="alert">
            {error}
          </p>
        )}

        <CitySearch
          onSelect={handleSelect}
          selectingId={selectingId}
          autoFocus
        />
      </CardBody>
    </Card>
  )
}
