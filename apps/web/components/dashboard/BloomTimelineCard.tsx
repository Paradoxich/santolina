import Image from 'next/image'
import { Panel } from '@paradoxui/ui'
import type { BloomSeason, BloomSpan } from '@/types/dashboard'

const emphasisOpacity: Record<BloomSpan['emphasis'], string> = {
  now: 'opacity-100',
  upcoming: 'opacity-50',
  past: 'opacity-30',
}

interface BloomTimelineCardProps {
  season: BloomSeason
  /** False when the garden has no growing plants — shows the empty hint instead of the chart. */
  hasPlants?: boolean
}

export function BloomTimelineCard({
  season,
  hasPlants = true,
}: BloomTimelineCardProps) {
  if (!hasPlants) {
    return (
      <Panel
        title={season.title}
        meta={season.meta}
        className="h-full overflow-hidden"
      >
        <p className="text-body-small text-muted">
          Once you add plants, you&apos;ll see their bloom season here.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title={season.title}
      meta={season.meta}
      className="h-full overflow-hidden"
    >
      <div className="relative h-[147px] w-full">
        <div
          aria-hidden="true"
          className="absolute inset-0 flex justify-between"
        >
          {season.months.map((month, i) => (
            <span
              key={month + i}
              className={[
                'h-full w-px bg-accent',
                i === season.currentMonth ? '' : 'opacity-10',
              ].join(' ')}
            />
          ))}
        </div>

        {season.spans.map((span) => (
          <div
            key={span.id}
            className={[
              'absolute inset-x-0',
              emphasisOpacity[span.emphasis],
            ].join(' ')}
            style={{ top: span.y }}
          >
            <div
              className="absolute h-[4px] -translate-y-1/2 rounded-full"
              style={{
                left: `${span.x}%`,
                width: `${span.width}%`,
                backgroundColor: span.color,
              }}
            />
            <div
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${span.thumbAt}%`,
                width: span.thumbSize,
                height: span.thumbSize,
              }}
            >
              <div
                className={[
                  'h-full w-full overflow-hidden rounded-full',
                  span.emphasis === 'now' ? 'border' : '',
                ].join(' ')}
                style={{
                  borderColor: span.emphasis === 'now' ? span.color : undefined,
                }}
              >
                <Image
                  src={span.imageUrl}
                  alt={span.plantName}
                  fill
                  sizes="24px"
                  className="object-cover"
                />
              </div>
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-inverse px-2 py-1 text-micro font-medium text-inverse opacity-0 shadow-md transition-opacity duration-normal group-hover:opacity-100"
              >
                {span.plantName}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex w-full items-center justify-between text-center text-micro">
        {season.months.map((month, i) => (
          <span
            key={month + i}
            className={[
              'w-10',
              i === season.currentMonth ? 'text-accent' : 'text-muted',
            ].join(' ')}
          >
            {month}
          </span>
        ))}
      </div>
    </Panel>
  )
}

export default BloomTimelineCard
