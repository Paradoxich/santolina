'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Panel } from '@paradoxui/ui'
import { LocationPickerModal } from '@/components/dashboard/LocationPickerModal'
import type { WeatherDay } from '@/types/dashboard'

interface WeatherCardProps {
  location: string | null
  country: string | null
  days: WeatherDay[] | null
}

export function WeatherCard({ location, country, days }: WeatherCardProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  return (
    <Panel className="h-full gap-8">
      <div className="flex w-full items-baseline justify-between gap-row-gap">
        <h2 className="min-w-0 flex-1 text-section font-medium text-primary">
          Weather
        </h2>
        <button
          type="button"
          onClick={() => setIsPickerOpen(true)}
          className={[
            'shrink-0 whitespace-nowrap text-body text-muted',
            'underline decoration-dotted underline-offset-4',
            'hover:text-primary',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-focus',
          ].join(' ')}
        >
          {location ?? 'Add location'}
        </button>
      </div>

      {/* Day columns are items-start, not items-end: a two-line description
          (e.g. "Thunderstorms expected.") makes its column taller, and
          bottom-alignment would push that day's label/icon/temps up out of
          line with the other days. */}
      {location && days ? (
        <div className="flex min-h-0 flex-1 items-start gap-3 lg:gap-[56px]">
          {days.map((day) => (
            <div
              key={day.label}
              className="flex min-w-0 flex-1 flex-col items-center gap-item-gap"
            >
              <span className="w-full text-center text-label font-medium uppercase tracking-label text-muted">
                {day.label}
              </span>
              <div className="flex h-14 items-center lg:h-16">
                <Image
                  src={`/icons/weather-${day.icon}.svg`}
                  alt=""
                  width={102}
                  height={48}
                  className="h-8 w-auto lg:h-12"
                />
              </div>
              <div className="flex items-baseline justify-center gap-inline-gap">
                <span className="text-stat text-primary">{day.high}°</span>
                <span className="text-stat text-faint">{day.low}°</span>
              </div>
              <p className="w-full text-center text-body-small tracking-compact text-body-secondary">
                {day.description}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="text-body text-secondary">
            {location
              ? 'Weather is unavailable right now.'
              : 'Add a location to see your forecast.'}
          </p>
        </div>
      )}

      <LocationPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        currentCity={location}
        currentCountry={country}
      />
    </Panel>
  )
}

export default WeatherCard
