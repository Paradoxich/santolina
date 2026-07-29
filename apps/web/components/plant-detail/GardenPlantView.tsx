'use client'

/**
 * The garden-scoped view of a plant you are growing: state at the top,
 * activity in the middle, reference demoted. Built on the dashboard's card
 * system (Panel, the same three-row grid ratios, CardIllustration for empty
 * cards) because a plant you own is a dashboard for that plant, and inventing
 * a second visual language beside the one we shipped would be a mistake.
 *
 * Growing plants only. A planned plant has no diary (Ana, 21 July 2026), so
 * three of these five cards would be permanently empty — it keeps the linear
 * layout in PlantDetailPage instead.
 *
 * Every value here comes from data that already exists. The two things it
 * cannot source are marked NEEDS COLUMN and render as "not recorded" rather
 * than being hidden, so the gap stays visible.
 */

import { useState } from 'react'
import { Badge, Icon, Lightbox, Panel } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { PlantImage } from '@/components/PlantImage'
import { CardIllustration } from '@/components/dashboard/CardIllustration'
import { DIARY_EVENT_LABELS } from '@/lib/diary-events'
import { getBloomStatus, getStageNote } from '@/lib/bloom-status'
import { getPlantCareTips, isPeakHeat } from '@/lib/care-tips'
import { formatBloomRange } from '@/lib/format-plant'
import { flattenNotePhotos } from './StorySection'
import { PlantGallery } from './PlantGallery'
import { YearTimeline } from './YearTimeline'
import type { DbPlant } from '@/lib/plants-db'
import type { DiaryNote } from '@/types/diary'

/** Same row ratios as the dashboard grid, so the two pages sit on one system. */
const rows = {
  top: 'grid grid-cols-1 gap-item-gap lg:min-h-[276px] lg:grid-cols-[592fr_420fr]',
  middle: 'grid grid-cols-1 gap-item-gap lg:min-h-[272px] lg:grid-cols-2',
  bottom: 'grid grid-cols-1 gap-item-gap lg:min-h-[234px] lg:grid-cols-3',
  bottomTwoUp: 'grid grid-cols-1 gap-item-gap lg:min-h-[234px] lg:grid-cols-2',
}

const STATUS_LABEL: Record<string, string> = {
  blooming: 'Flowering',
  'pre-bloom': 'About to flower',
  done: 'Resting',
  resting: 'Resting',
  evergreen: 'Evergreen',
}

const CLICKABLE =
  'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

const MS_PER_DAY = 1000 * 60 * 60 * 24

function daysSince(date: string, now: Date): number {
  return Math.floor(
    (now.getTime() - new Date(`${date}T12:00:00Z`).getTime()) / MS_PER_DAY
  )
}

/** "6 days ago", "today", "3 months ago". Terse, no invented precision. */
function agoLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 31) return `${days} days ago`
  const months = Math.round(days / 30)
  return months === 1 ? 'a month ago' : `${months} months ago`
}

function formatDayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

export interface GardenPlantViewProps {
  plant: DbPlant
  notes: DiaryNote[]
  /** Resolved hero photos for the species, editorial pick first. */
  heroPhotos: string[]
  /** Botanical name plus aliases, already formatted by the page. */
  subtitle: string | null
  /** Opens the page's species-photo lightbox at this index. */
  onHeroPhotoClick: (index: number) => void
  /** Opens the diary drawer. */
  onSeeAllNotes: () => void
  /**
   * The Care reference card, owned by the page because it renders the
   * reference sections and holds their open/closed state. Rendered as the
   * middle card of the bottom row, between Photos and the impact card.
   */
  reference?: React.ReactNode
  /**
   * Today as YYYY-MM-DD, resolved once on the server and passed down.
   * Calling new Date() here instead produces a different value during SSR
   * than on hydration, which React reports as a mismatch on the timeline's
   * today line — it is positioned by fraction-of-year, so even a few
   * milliseconds change the number.
   */
  todayIso: string
}

export function GardenPlantView({
  plant,
  notes,
  heroPhotos,
  subtitle,
  onHeroPhotoClick,
  onSeeAllNotes,
  reference,
  todayIso,
}: GardenPlantViewProps) {
  const now = new Date(`${todayIso}T12:00:00Z`)
  const [notePhotoIndex, setNotePhotoIndex] = useState<number | null>(null)

  const bloomMonths = plant.bloom_months ?? []
  const status = getBloomStatus(bloomMonths, now)
  const stageNote = getStageNote(bloomMonths, now)
  // seasonal_care[currentStage] is no longer read here: it is one of the two
  // tiers getPlantCareTips already returns, and reading it separately would
  // put the same line on the page twice.
  const bloomRange = formatBloomRange(plant.bloom_months) ?? undefined

  // One entry per logged event, as listGardenCareEvents does server-side.
  const events = notes.flatMap((note) =>
    note.eventTypes.map((type) => ({ type, date: note.date }))
  )

  const plantedEvent = events
    .filter((e) => e.type === 'planted')
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const daysInGarden = plantedEvent ? daysSince(plantedEvent.date, now) : null

  // This plant's own Care Tips, through the same engine as the dashboard
  // card. No forecast is fetched here, so isPeakHeat falls back to its
  // documented season test — which is what the static summer tip already
  // assumes, so the two agree.
  const tips = getPlantCareTips(plant.id, plant, {
    events: events.map((e) => ({
      plantId: plant.id,
      eventType: e.type,
      occurredAt: new Date(`${e.date}T12:00:00Z`),
    })),
    today: now,
    peakHeat: isPeakHeat(null, now),
  })

  const { images: notePhotos, offsetByNoteId } = flattenNotePhotos(
    notes,
    plant.common_name
  )

  // The Diary card opens the drawer, empty or not — same affordance the
  // dashboard's Plant care card uses to reach its full list.
  const openDiaryProps = {
    role: 'button',
    tabIndex: 0,
    onClick: onSeeAllNotes,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSeeAllNotes()
      }
    },
  }

  return (
    // item-gap (12px) vertically as well as horizontally, so the space
    // between rows matches the space between cards inside one and the grid
    // reads as a single field rather than stacked bands.
    <div className="flex flex-col gap-item-gap">
      {/* ============================================================
          HERO — who this plant is, and how long it has been yours.
          Not a card: it is the page's own header, on the page surface.
      ============================================================= */}
      <div className="grid grid-cols-1 gap-section-gap lg:grid-cols-[480fr_520fr] lg:items-start">
        <div className="flex flex-col gap-item-gap">
          <h1 className="text-title font-semibold text-primary">
            {plant.common_name}
          </h1>
          {subtitle && (
            <p className="text-body italic text-secondary">{subtitle}</p>
          )}
          {plant.description && (
            <p className="text-body leading-normal text-body-secondary">
              {plant.description}
            </p>
          )}

          <div className="mt-item-gap flex flex-col gap-tight-gap">
            <p className="text-body text-primary">
              {daysInGarden !== null
                ? `In your garden ${agoLabel(daysInGarden)}`
                : // NEEDS COLUMN: palette_plants.planted_at. The age is
                  // inferred from a 'planted' diary event, so a plant marked
                  // planted without logging has no age at all, and every
                  // establishment rule in CARE_EVENT_RULES never fires for it.
                  'Planting date not recorded'}
            </p>
            {/* Bloom status was a card of its own and carried one short line,
                so it is a line here instead. */}
            <p className="flex items-center gap-inline-gap text-body text-secondary">
              <Badge variant="accent">{STATUS_LABEL[status]}</Badge>
              {stageNote}
            </p>
          </div>
        </div>

        <PlantGallery
          photos={heroPhotos}
          plantName={plant.common_name}
          onPhotoClick={onHeroPhotoClick}
        />
      </div>

      {/* ============================================================
          NOTES AND CARE.
      ============================================================= */}
      <div className={rows.middle}>
        {notes.length === 0 ? (
          <Panel
            title="Diary"
            {...openDiaryProps}
            className={`relative isolate min-h-[280px] overflow-hidden lg:h-full lg:min-h-0 ${CLICKABLE}`}
          >
            <CardIllustration name="activity" />
            {/* The card is the only way into the drawer, so an empty one has
                to say what tapping it does. */}
            <p className="mt-auto max-w-[55%] text-body-small text-muted">
              Nothing logged yet. Write the first note.
            </p>
          </Panel>
        ) : (
          <Panel
            title="Diary"
            meta={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
            {...openDiaryProps}
            className={`h-full ${CLICKABLE}`}
          >
            <ul className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              {notes.slice(0, 4).map((note) => (
                <li
                  key={note.id}
                  className="flex w-full items-center gap-row-gap border-b border-divider py-item-gap"
                >
                  <span className="w-[44px] shrink-0 text-label text-muted">
                    {formatDayLabel(note.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body text-primary">
                    {note.text ||
                      note.eventTypes
                        .map((e) => DIARY_EVENT_LABELS[e])
                        .join(', ')}
                  </span>
                  {note.photos && note.photos.length > 0 && (
                    <span className="flex shrink-0 items-center gap-tight-gap text-label text-muted">
                      <Icon src={icons.image} size={14} />
                      {note.photos.length}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {/* Not a button: the whole card is one, and nesting a control
                inside a role="button" breaks keyboard and screen reader
                behaviour. This is the affordance label, nothing more. */}
            <span className="mt-item-gap w-fit text-body-small text-secondary">
              See all notes
            </span>
          </Panel>
        )}

        <Panel
          title="Care"
          meta={
            tips.length > 0
              ? `${tips.length} ${tips.length === 1 ? 'tip' : 'tips'}`
              : undefined
          }
          className="h-full"
        >
          {tips.length === 0 ? (
            <p className="text-body leading-normal text-secondary">
              Nothing to do this stage.
            </p>
          ) : (
            <ul className="flex w-full flex-col gap-tight-gap">
              {tips.map((tip, i) => (
                <li
                  key={`${tip.text}-${i}`}
                  className="flex w-full items-center justify-between gap-row-gap rounded-sm bg-surface-subtle px-item-gap py-inline-gap"
                >
                  <span className="min-w-0 flex-1 text-body leading-normal text-primary">
                    {tip.text}
                  </span>
                  {tip.timeframe && (
                    <span className="shrink-0 whitespace-nowrap text-label text-muted">
                      {tip.timeframe}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ============================================================
          THE YEAR — full width, its own row.
      ============================================================= */}
      <Panel title="Its year" meta={bloomRange} className="overflow-hidden">
        <YearTimeline
          bloomMonths={bloomMonths}
          events={events}
          today={now}
          rhythm={plant.seasonal_rhythm}
        />
      </Panel>

      {/* ============================================================
          Photos, the reference entry point, and what the plant does for
          the garden. Drops a column at a time as its cards drop out.
      ============================================================= */}
      <div
        className={plant.environment_benefits ? rows.bottom : rows.bottomTwoUp}
      >
        {notePhotos.length === 0 ? (
          <Panel
            title="Photos"
            className="relative isolate min-h-[234px] overflow-hidden lg:h-full lg:min-h-0"
          >
            <CardIllustration name="planned" />
            <p className="mt-auto max-w-[55%] text-body-small text-muted">
              No photos yet.
            </p>
          </Panel>
        ) : (
          <Panel
            title="Photos"
            meta={`${notePhotos.length} total`}
            className="h-full"
          >
            <div className="grid min-h-0 flex-1 grid-cols-3 gap-tight-gap">
              {notes
                .flatMap((note) =>
                  (note.photos ?? []).map((photo, i) => ({
                    src: photo.src,
                    index: (offsetByNoteId.get(note.id) ?? 0) + i,
                    date: note.date,
                  }))
                )
                .slice(0, 6)
                .map((photo) => (
                  <button
                    // Keyed by position, not src: the same photo can legitimately
                    // appear twice, and signed URLs are not stable identifiers.
                    key={photo.index}
                    type="button"
                    onClick={() => setNotePhotoIndex(photo.index)}
                    aria-label={`View photo from ${formatDayLabel(photo.date)}`}
                    className="relative cursor-pointer overflow-hidden rounded-sm transition-opacity duration-normal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <PlantImage
                      src={photo.src}
                      alt={`${plant.common_name} on ${formatDayLabel(photo.date)}`}
                      fill
                      sizes="120px"
                      className="object-cover"
                    />
                  </button>
                ))}
            </div>
          </Panel>
        )}

        {reference}

        {/* Not every catalog row has this, and an empty impact card would read
            as "this plant does nothing" — so the row drops to 2-up instead. */}
        {plant.environment_benefits && (
          <Panel className="relative isolate min-h-[234px] justify-between overflow-hidden lg:h-full lg:min-h-0">
            <CardIllustration name="insight" />
            <p className="max-w-[66%] text-subheading font-medium leading-tight tracking-heading text-primary lg:max-w-none">
              {plant.environment_benefits}
            </p>
            <span className="text-label font-medium uppercase tracking-label text-muted">
              In your garden
            </span>
          </Panel>
        )}
      </div>

      <Lightbox
        images={notePhotos}
        isOpen={notePhotoIndex !== null}
        initialIndex={notePhotoIndex ?? 0}
        onClose={() => setNotePhotoIndex(null)}
      />
    </div>
  )
}

export default GardenPlantView
