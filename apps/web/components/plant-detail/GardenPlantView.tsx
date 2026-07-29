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
import { DIARY_EVENT_LABELS, type DiaryEventType } from '@/lib/diary-events'
import { getBloomStatus, getStageNote } from '@/lib/bloom-status'
import { getCurrentSeason } from '@/lib/season'
import { formatBloomRange } from '@/lib/format-plant'
import { flattenNotePhotos } from './StorySection'
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

const TRACKED_EVENTS: DiaryEventType[] = ['watered', 'fertilized', 'pruned']

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
  /** Resolved hero photos for the species, newest editorial pick first. */
  heroPhotos: string[]
  /** Opens the page's species-photo lightbox at this index. */
  onHeroPhotoClick: (index: number) => void
  /** Scrolls to the full story section below the grid. */
  onSeeAllNotes: () => void
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
  onHeroPhotoClick,
  onSeeAllNotes,
  todayIso,
}: GardenPlantViewProps) {
  const now = new Date(`${todayIso}T12:00:00Z`)
  const [notePhotoIndex, setNotePhotoIndex] = useState<number | null>(null)

  const bloomMonths = plant.bloom_months ?? []
  const status = getBloomStatus(bloomMonths, now)
  const stageNote = getStageNote(bloomMonths, now)
  const season = getCurrentSeason(now)
  const currentAction = plant.seasonal_care?.[season] ?? null
  const bloomRange = formatBloomRange(plant.bloom_months) ?? undefined

  // One entry per logged event, as listGardenCareEvents does server-side.
  const events = notes.flatMap((note) =>
    note.eventTypes.map((type) => ({ type, date: note.date }))
  )

  const plantedEvent = events
    .filter((e) => e.type === 'planted')
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const daysInGarden = plantedEvent ? daysSince(plantedEvent.date, now) : null

  const recency = TRACKED_EVENTS.map((type) => {
    const latest = events
      .filter((e) => e.type === type)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    return { type, days: latest ? daysSince(latest.date, now) : null }
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
    <div className="flex flex-col gap-item-gap">
      {/* ============================================================
          ROW 1 — the plant itself, and where it is right now.
      ============================================================= */}
      <div className={rows.top}>
        <Panel
          title="Your plant"
          meta={
            daysInGarden !== null
              ? `Planted ${agoLabel(daysInGarden)}`
              : // NEEDS COLUMN: palette_plants.planted_at. The age is inferred
                // from a 'planted' diary event, so a plant marked planted
                // without logging has no age at all — and every establishment
                // window rule in CARE_EVENT_RULES silently never fires for it.
                'Planting date not recorded'
          }
          className="h-full"
        >
          <div className="flex min-h-0 flex-1 gap-tight-gap">
            {(heroPhotos.length > 0 ? heroPhotos.slice(0, 3) : [null]).map(
              (src, i) => {
                const inner = (
                  <>
                    <PlantImage
                      src={src}
                      alt={`${plant.common_name} photo ${i + 1}`}
                      fill
                      sizes="200px"
                      className="object-cover"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[image:var(--thumbnail-scrim)]"
                    />
                  </>
                )
                const shell =
                  'relative min-w-0 flex-1 overflow-hidden rounded-sm'
                return src ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onHeroPhotoClick(i)}
                    aria-label={`View ${plant.common_name} photo ${i + 1}`}
                    className={`${shell} cursor-pointer transition-opacity duration-normal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
                  >
                    {inner}
                  </button>
                ) : (
                  <div key="placeholder" className={shell}>
                    {inner}
                  </div>
                )
              }
            )}
          </div>
          {/* NEEDS COLUMN: palette_plants.placement. The only field that would
              tell two copies of the same species apart. */}
          <span className="text-label text-muted">No spot recorded</span>
        </Panel>

        <Panel className="h-full justify-between">
          <div className="flex flex-col gap-item-gap">
            {/* w-fit: Badge is a span, but a flex column stretches it. */}
            <Badge variant="accent" className="w-fit">
              {STATUS_LABEL[status]}
            </Badge>
            <p className="text-subheading font-medium leading-tight tracking-heading text-primary">
              {stageNote}
            </p>
            <p className="text-body text-secondary">
              {currentAction ?? 'Nothing to do this stage.'}
            </p>
          </div>
          <span className="text-label font-medium uppercase tracking-label text-muted">
            Right now
          </span>
        </Panel>
      </div>

      {/* ============================================================
          ROW 2 — the year, and what you have written in it.
      ============================================================= */}
      <div className={rows.middle}>
        <Panel
          title="Its year"
          meta={bloomRange}
          className="h-full overflow-hidden"
        >
          <YearTimeline
            bloomMonths={bloomMonths}
            events={events}
            today={now}
            plantName={plant.common_name}
            imageUrl={heroPhotos[0] ?? null}
          />
        </Panel>

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
      </div>

      {/* ============================================================
          ROW 3 — what you last did, the photos you have taken, and what
          this plant is doing for the garden.
      ============================================================= */}
      <div
        className={plant.environment_benefits ? rows.bottom : rows.bottomTwoUp}
      >
        <Panel title="Last done" className="h-full">
          <ul className="flex w-full flex-col">
            {recency.map(({ type, days }) => (
              <li
                key={type}
                className="flex w-full items-center justify-between gap-row-gap border-b border-divider py-item-gap"
              >
                <span className="text-body text-primary">
                  {DIARY_EVENT_LABELS[type]}
                </span>
                <span className="shrink-0 text-label text-muted">
                  {days === null ? 'Not logged' : agoLabel(days)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

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
