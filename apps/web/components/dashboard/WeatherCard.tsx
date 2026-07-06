import Image from 'next/image'
import { Panel } from '@paradoxui/ui'
import type { WeatherDay } from '@/types/dashboard'

interface WeatherCardProps {
  location: string
  days: WeatherDay[]
}

export function WeatherCard({ location, days }: WeatherCardProps) {
  return (
    <Panel
      title="Weather"
      meta={location}
      className="h-full gap-[var(--space-8)]"
    >
      <div className="flex min-h-0 flex-1 items-start gap-[56px]">
        {days.map((day) => (
          <div
            key={day.label}
            className="flex min-w-0 flex-1 flex-col items-center gap-[var(--space-item-gap)]"
          >
            <span className="w-full text-center text-[length:var(--font-size-label)] font-medium uppercase tracking-[0.05em] text-[var(--text-section-label)]">
              {day.label}
            </span>
            <Image
              src={`/icons/weather-${day.icon}.svg`}
              alt=""
              width={102}
              height={48}
              className="h-12 w-auto"
            />
            <div className="flex items-baseline justify-center gap-[var(--space-inline-gap)]">
              <span className="text-[length:var(--font-size-stat-number)] text-[var(--text-temperature-high)]">
                {day.high}°
              </span>
              <span className="text-[length:var(--font-size-stat-number)] text-[var(--text-dimmed-value)]">
                {day.low}°
              </span>
            </div>
            <p className="w-full text-center text-[length:var(--font-size-body-small)] tracking-[-0.01em] text-[var(--text-body-secondary)]">
              {day.description}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export default WeatherCard
