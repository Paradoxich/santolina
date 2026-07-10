'use client'

import { useEffect, useState } from 'react'
import { SearchField, Spinner } from '@paradoxui/ui'
import { searchCities, type GeocodingResult } from '@/lib/open-meteo'
import { useDebounce } from '@/hooks/useDebounce'

interface CitySearchProps {
  onSelect: (city: GeocodingResult) => void
  /** id of the city currently being saved, so its row can show a busy state */
  selectingId?: number | null
  autoFocus?: boolean
}

/**
 * Debounced city search over Open-Meteo geocoding, with a selectable result
 * list. Presentational + local search state only — the caller decides what
 * happens on select. Shared by the dashboard location picker and the first-run
 * location step.
 */
export function CitySearch({
  onSelect,
  selectingId = null,
  autoFocus,
}: CitySearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodingResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debouncedQuery = useDebounce(query, 300)

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

  const showEmpty =
    !isSearching &&
    !error &&
    debouncedQuery.trim().length >= 2 &&
    results.length === 0

  return (
    <div className="flex flex-col gap-item-gap">
      <SearchField
        placeholder="Search for a city..."
        label="Search for a city"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={autoFocus}
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
                onClick={() => onSelect(city)}
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
  )
}

export default CitySearch
