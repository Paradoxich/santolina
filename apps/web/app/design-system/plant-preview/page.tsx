'use client'

/**
 * Preview of the garden-scoped plant detail view: what a plant page becomes
 * once the plant is *yours* rather than a catalog entry. Static sample data,
 * no queries, no migrations. Lives under the public /design-system area so it
 * can be opened without a session.
 *
 * Built on the dashboard's own language rather than a new one: Panel cards on
 * the sage page, the same three-row grid ratios, dithered illustrations for
 * empty cards, the seasonal card's timeline instrument. A plant you own is a
 * dashboard for that plant, so it should look like the one we already have.
 *
 * Everything above "Care reference" is derivable from data that already
 * exists, with two exceptions marked NEEDS COLUMN inline.
 */

import { useState } from 'react'
import { Badge, Icon, Panel, StatCard, DetailRow } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { PlantImage } from '@/components/PlantImage'
import { CardIllustration } from '@/components/dashboard/CardIllustration'
import { DIARY_EVENT_LABELS, type DiaryEventType } from '@/lib/diary-events'
import { getStageNote, getBloomStatus } from '@/lib/bloom-status'
import { getCurrentSeason } from '@/lib/season'
import { formatBloomRange } from '@/lib/format-plant'
import { YearTimeline } from './YearTimeline'
import {
  SAMPLE_PLANT,
  TODAY,
  NOTES_RICH,
  NOTES_SPARSE,
  NOTES_NONE,
  eventsFromNotes,
  type SampleNote,
} from './sample'

/** Same row ratios as the dashboard grid, so the two pages sit on one system. */
const rows = {
  top: 'grid grid-cols-1 gap-item-gap lg:min-h-[276px] lg:grid-cols-[592fr_420fr]',
  middle: 'grid grid-cols-1 gap-item-gap lg:min-h-[272px] lg:grid-cols-2',
  bottom: 'grid grid-cols-1 gap-item-gap lg:min-h-[234px] lg:grid-cols-3',
}

const STATUS_LABEL: Record<string, string> = {
  blooming: 'Flowering',
  'pre-bloom': 'About to flower',
  done: 'Resting',
  resting: 'Resting',
  evergreen: 'Evergreen',
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

function daysSince(date: string): number {
  return Math.floor(
    (TODAY.getTime() - new Date(`${date}T12:00:00Z`).getTime()) / MS_PER_DAY
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

type Density = 'rich' | 'sparse' | 'none'

const NOTES_BY_DENSITY: Record<Density, SampleNote[]> = {
  rich: NOTES_RICH,
  sparse: NOTES_SPARSE,
  none: NOTES_NONE,
}

const TRACKED_EVENTS: DiaryEventType[] = ['watered', 'fertilized', 'pruned']

export default function PlantPreviewPage() {
  const [density, setDensity] = useState<Density>('rich')
  const [referenceOpen, setReferenceOpen] = useState(false)

  const plant = SAMPLE_PLANT
  const notes = NOTES_BY_DENSITY[density]
  const events = eventsFromNotes(notes)

  const status = getBloomStatus(plant.bloom_months, TODAY)
  const stageNote = getStageNote(plant.bloom_months, TODAY)
  const season = getCurrentSeason(TODAY)
  const currentAction = plant.seasonal_care[season]

  const plantedEvent = events.find((e) => e.type === 'planted')
  const daysInGarden = plantedEvent ? daysSince(plantedEvent.date) : null

  const recency = TRACKED_EVENTS.map((type) => {
    const latest = events
      .filter((e) => e.type === type)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    return { type, days: latest ? daysSince(latest.date) : null }
  })

  const photoNotes = notes.filter((n) => n.photoCount > 0)

  const bloomRange = formatBloomRange(plant.bloom_months) ?? undefined

  return (
    <div className="max-w-[1032px] pb-16">
      {/* ---- preview chrome, not part of the design ---- */}
      <div className="mb-8 flex flex-col gap-item-gap rounded-md border border-divider-subtle bg-surface-subtle p-card-padding">
        <p className="text-label text-muted">
          Preview only. Sample data, frozen to 29 July 2026. Not wired to the
          database.
        </p>
        <div className="flex flex-wrap items-center gap-tight-gap">
          <span className="text-label text-secondary">How much is logged:</span>
          {(
            [
              ['rich', 'Logged often'],
              ['sparse', 'Planted, then nothing'],
              ['none', 'Never logged'],
            ] as [Density, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDensity(value)}
              className={`rounded-chip px-2 py-1 text-label transition-colors duration-fast ${
                density === value
                  ? 'bg-accent text-on-accent'
                  : 'bg-surface-control text-secondary hover:bg-surface-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- page header, matching the dashboard's date + subtitle ---- */}
      <h1 className="text-title font-semibold text-primary">
        {plant.common_name}
      </h1>
      <p className="mt-3 text-body italic text-secondary">
        {plant.scientific_name}
      </p>

      <div className="mt-8 flex flex-col gap-item-gap">
        {/* ============================================================
            ROW 1 — the plant itself, and where it is right now.
        ============================================================= */}
        <div className={rows.top}>
          <Panel
            title="Your plant"
            meta={
              daysInGarden !== null
                ? `Planted ${agoLabel(daysInGarden)}`
                : // NEEDS COLUMN: palette_plants.planted_at. Age is inferred
                  // from a 'planted' diary event today, so a plant marked
                  // planted without logging has no age at all, and every
                  // establishment rule in CARE_EVENT_RULES never fires for it.
                  'Planting date not recorded'
            }
            className="h-full"
          >
            <div className="flex min-h-0 flex-1 gap-tight-gap">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="relative min-w-0 flex-1 overflow-hidden rounded-sm"
                >
                  <PlantImage
                    src={null}
                    alt={plant.common_name}
                    fill
                    sizes="180px"
                    className="object-cover"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-[image:var(--thumbnail-scrim)]"
                  />
                </div>
              ))}
            </div>
            {/* NEEDS COLUMN: palette_plants.placement. The only field that
                tells two copies of the same species apart. */}
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
              bloomMonths={plant.bloom_months}
              events={events}
              today={TODAY}
              plantName={plant.common_name}
              imageUrl={null}
            />
          </Panel>

          {notes.length === 0 ? (
            <Panel
              title="Diary"
              className="relative isolate min-h-[280px] overflow-hidden lg:h-full lg:min-h-0"
            >
              <CardIllustration name="activity" />
              <p className="mt-auto max-w-[55%] text-body-small text-muted">
                Nothing logged yet.
              </p>
            </Panel>
          ) : (
            <Panel
              title="Diary"
              meta={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
              className="h-full"
            >
              <ul className="flex w-full min-h-0 flex-1 flex-col overflow-hidden">
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
                    {note.photoCount > 0 && (
                      <span className="flex shrink-0 items-center gap-tight-gap text-label text-muted">
                        <Icon src={icons.image} size={14} />
                        {note.photoCount}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-item-gap w-fit text-body-small text-secondary underline-offset-2 transition-colors duration-normal hover:text-primary hover:underline"
              >
                See all notes
              </button>
            </Panel>
          )}
        </div>

        {/* ============================================================
            ROW 3 — the operations row: what you last did, the photos you
            have taken, and what this plant is doing for the garden.
        ============================================================= */}
        <div className={rows.bottom}>
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
            <div className="mt-auto flex flex-wrap gap-tight-gap pt-item-gap">
              {TRACKED_EVENTS.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="rounded-chip bg-surface-subtle px-2 py-1 text-label text-secondary transition-colors duration-fast hover:bg-surface-hover"
                >
                  {DIARY_EVENT_LABELS[type]}
                </button>
              ))}
            </div>
          </Panel>

          {photoNotes.length === 0 ? (
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
              meta={`${photoNotes.reduce((n, p) => n + p.photoCount, 0)} total`}
              className="h-full"
            >
              <div className="grid min-h-0 flex-1 grid-cols-3 gap-tight-gap">
                {photoNotes
                  .flatMap((note) =>
                    Array.from({ length: note.photoCount }, (_, i) => ({
                      key: `${note.id}-${i}`,
                      date: note.date,
                    }))
                  )
                  .slice(0, 6)
                  .map((photo) => (
                    <div
                      key={photo.key}
                      className="relative overflow-hidden rounded-sm"
                    >
                      <PlantImage
                        src={null}
                        alt={`${plant.common_name} on ${formatDayLabel(photo.date)}`}
                        fill
                        sizes="90px"
                        className="object-cover"
                      />
                    </div>
                  ))}
              </div>
            </Panel>
          )}

          <Panel className="relative isolate min-h-[234px] justify-between overflow-hidden lg:h-full lg:min-h-0">
            <CardIllustration name="insight" />
            <p className="max-w-[66%] text-subheading font-medium leading-tight tracking-heading text-primary lg:max-w-none">
              {plant.environment_benefits}
            </p>
            <span className="text-label font-medium uppercase tracking-label text-muted">
              In your garden
            </span>
          </Panel>
        </div>

        {/* ============================================================
            REFERENCE — everything Explore leads with, demoted to a drawer
            you open when something looks wrong. Nothing is deleted.
        ============================================================= */}
        <Panel
          title="Care reference"
          description="Water, light, soil, pruning, the full year, and the botanical details"
          meta={
            <button
              type="button"
              onClick={() => setReferenceOpen((open) => !open)}
              className="text-body text-secondary underline-offset-2 transition-colors duration-normal hover:text-primary hover:underline"
            >
              {referenceOpen ? 'Hide' : 'Show'}
            </button>
          }
        >
          {referenceOpen && (
            <div className="flex w-full flex-col gap-section-break">
              <div className="grid w-full grid-cols-1 gap-inline-gap sm:grid-cols-2">
                <StatCard label="Water" icon={<Icon src={icons.water} />}>
                  {plant.water_needs}
                </StatCard>
                <StatCard label="Light" icon={<Icon src={icons.light} />}>
                  {plant.light_needs}
                </StatCard>
                <StatCard label="Soil" icon={<Icon src={icons.soil} />}>
                  {plant.soil_needs}
                </StatCard>
                <StatCard
                  label="Maintenance"
                  icon={<Icon src={icons.maintenance} />}
                >
                  {plant.maintenance_notes}
                </StatCard>
                <StatCard
                  tone="warning"
                  label="Common issues"
                  icon={<Icon src={icons.issues} />}
                  className="sm:col-span-2"
                >
                  {plant.common_issues}
                </StatCard>
              </div>

              <div className="grid w-full grid-cols-1 gap-section-gap lg:grid-cols-2">
                <div className="flex w-full flex-col gap-item-gap">
                  <h3 className="text-section font-medium text-primary">
                    Through the year
                  </h3>
                  <div className="flex w-full flex-col">
                    {Object.entries(plant.seasonal_rhythm).map(
                      ([key, value]) => (
                        <DetailRow
                          key={key}
                          labelWidth="sm"
                          label={
                            key.charAt(0).toUpperCase() +
                            key.slice(1).replace('_', ' ')
                          }
                          value={value}
                        />
                      )
                    )}
                  </div>
                </div>

                <div className="flex w-full flex-col gap-item-gap">
                  <h3 className="text-section font-medium text-primary">
                    Details
                  </h3>
                  <div className="flex w-full flex-col">
                    <DetailRow label="Plant type" value={plant.plant_type} />
                    <DetailRow label="Height" value={plant.height} />
                    <DetailRow label="Spread" value={plant.spread} />
                    <DetailRow
                      label="Best placement"
                      value={plant.best_placement}
                    />
                    <DetailRow label="Native to" value={plant.native_to} />
                    <DetailRow label="Family" value={plant.family} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
