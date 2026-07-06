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
}

export function BloomTimelineCard({ season }: BloomTimelineCardProps) {
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
                'h-full w-px bg-[var(--color-accent-primary)]',
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
              className="absolute h-[4px] -translate-y-1/2 rounded-[var(--radius-full)]"
              style={{
                left: `${span.x}%`,
                width: `${span.width}%`,
                backgroundColor: span.color,
              }}
            />
            <div
              className={[
                'absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[var(--radius-full)]',
                span.emphasis === 'now' ? 'border' : '',
              ].join(' ')}
              style={{
                left: `${span.thumbAt}%`,
                width: span.thumbSize,
                height: span.thumbSize,
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
          </div>
        ))}
      </div>

      <div className="flex w-full items-center justify-between text-center text-[length:var(--font-size-micro)]">
        {season.months.map((month, i) => (
          <span
            key={month + i}
            className={[
              'w-10',
              i === season.currentMonth
                ? 'text-[var(--color-accent-primary)]'
                : 'text-[var(--text-label)]',
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
