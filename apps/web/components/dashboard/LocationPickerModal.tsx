'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormError, Modal } from '@paradoxui/ui'
import { type GeocodingResult } from '@/lib/open-meteo'
import { CitySearch } from '@/components/CitySearch'
import { setGardenLocation } from '@/server/garden-actions'

interface LocationPickerModalProps {
  isOpen: boolean
  onClose: () => void
  currentCity: string | null
  currentCountry: string | null
  /** Set when this opens on top of another modal (the settings panel). */
  blurBackdrop?: boolean
}

export function LocationPickerModal({
  isOpen,
  onClose,
  currentCity,
  currentCountry,
  blurBackdrop = false,
}: LocationPickerModalProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<number | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setSelectingId(null)
  }, [isOpen])

  const handleSelect = async (city: GeocodingResult) => {
    setSelectingId(city.id)
    setError(null)
    try {
      await setGardenLocation({
        city: city.name,
        country: city.country,
        lat: city.latitude,
        lon: city.longitude,
      })
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSelectingId(null)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Set your garden's location"
      size="sm"
      blurBackdrop={blurBackdrop}
    >
      <div className="flex flex-col gap-item-gap">
        {currentCity && (
          <div className="flex items-center gap-1.5">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-muted"
            >
              <path
                d="M7 12.833S11.667 8.556 11.667 5.5A4.667 4.667 0 002.333 5.5c0 3.056 4.667 7.333 4.667 7.333z"
                stroke="currentColor"
                strokeWidth="1.16667"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="7"
                cy="5.5"
                r="1.5"
                stroke="currentColor"
                strokeWidth="1.16667"
              />
            </svg>
            <p className="text-body text-primary">
              {currentCity}
              {currentCountry ? `, ${currentCountry}` : ''}
            </p>
          </div>
        )}

        {error && <FormError>{error}</FormError>}

        <CitySearch
          onSelect={handleSelect}
          selectingId={selectingId}
          autoFocus
        />
      </div>
    </Modal>
  )
}

export default LocationPickerModal
