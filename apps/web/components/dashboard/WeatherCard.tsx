import Image from 'next/image'
import { Panel } from '@paradoxui/ui'
import type { WeatherDay } from '@/types/dashboard'

interface WeatherCardProps {
  location: string
  days: WeatherDay[]
}

export function WeatherCard({ location, days }: WeatherCardProps) {
  return (
    <Panel title="Weather" meta={location} className="h-full gap-8">
      <div className="flex min-h-0 flex-1 items-start gap-3 lg:gap-[56px]">
        {days.map((day) => (
          <div
            key={day.label}
            className="flex min-w-0 flex-1 flex-col items-center gap-item-gap"
          >
            <span className="w-full text-center text-label font-medium uppercase tracking-[0.05em] text-muted">
              {day.label}
            </span>
            <Image
              src={`/icons/weather-${day.icon}.svg`}
              alt=""
              width={102}
              height={48}
              className="h-8 w-auto lg:h-12"
            />
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
    </Panel>
  )
}

export default WeatherCard
