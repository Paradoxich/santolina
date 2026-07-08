'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal, SearchField, Spinner } from '@paradoxui/ui'
import { searchCities, type GeocodingResult } from '@/lib/open-meteo'
import { useDebounce } from '@/hooks/useDebounce'
import { setGardenLocation } from '@/server/garden-actions'

interface LocationPickerModalProps {
  isOpen: boolean
  onClose: () => void
  currentCity: string | null
  currentCountry: string | null
}

export function LocationPickerModal({
  isOpen,
  onClose,
  currentCity,
  currentCountry,
}: LocationPickerModalProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodingResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<number | null>(null)
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setResults([])
    setError(null)
    setSelectingId(null)
  }, [isOpen])

  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (trimmed.length < 2) {
      setResults([])
      return
    }

    let cancelled = false
    setIsSearching(true)
    setError(null)

    searchCities(trimmed)
      .then((cities) => {
        if (!cancelled) setResults(cities)
      })
      .catch(() => {
        if (!cancelled) setError('Could not search for that city. Try again.')
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

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

  const showEmpty =
    !isSearching &&
    !error &&
    debouncedQuery.trim().length >= 2 &&
    results.length === 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Set your garden's location"
      size="sm"
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

        <SearchField
          placeholder="Search for a city..."
          label="Search for a city"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        {isSearching && (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        )}

        {error && <p className="text-body-small text-critical">{error}</p>}

        {!isSearching && results.length > 0 && (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {results.map((city) => (
              <li key={city.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(city)}
                  disabled={selectingId !== null}
                  className={[
                    'w-full rounded-md px-3 py-2 text-left',
                    'text-body-small text-primary',
                    'hover:bg-surface-hover',
                    'focus-visible:outline-none focus-visible:ring-2',
                    'focus-visible:ring-focus',
                    'disabled:opacity-50',
                  ].join(' ')}
                >
                  {city.name}
                  {city.admin1 ? `, ${city.admin1}` : ''}, {city.country}
                </button>
              </li>
            ))}
          </ul>
        )}

        {showEmpty && (
          <p className="text-body-small text-muted">
            No cities found for &ldquo;{debouncedQuery}&rdquo;.
          </p>
        )}
      </div>
    </Modal>
  )
}

export default LocationPickerModal
