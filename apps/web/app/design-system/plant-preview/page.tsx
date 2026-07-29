'use client'

/**
 * Preview of the garden-scoped plant detail view: what a plant page becomes
 * once the plant is *yours* rather than a catalog entry. Static sample data,
 * no queries, no migrations. Lives under the public /design-system area so it
 * can be opened without a session.
 *
 * The argument it is making, in one line: a catalog entry is documentation
 * (identical for everyone, read once), and a plant you own is a project page
 * (state at the top, activity in the middle, reference demoted to a drawer you
 * open when something looks wrong).
 *
 * Everything above "Care reference" is derivable from data that already
 * exists, with two exceptions marked NEEDS COLUMN inline.
 */

import { useState } from 'react'
import { Badge, Icon, StatCard, DetailRow } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { PlantImage } from '@/components/PlantImage'
import { DIARY_EVENT_LABELS, type DiaryEventType } from '@/lib/diary-events'
import { getStageNote, getBloomStatus } from '@/lib/bloom-status'
import { getCurrentSeason } from '@/lib/season'
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

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
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

  // Most recent occurrence per tracked event type.
  const recency = TRACKED_EVENTS.map((type) => {
    const latest = events
      .filter((e) => e.type === type)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    return { type, days: latest ? daysSince(latest.date) : null }
  })

  return (
    <div className="w-full">
      {/* ---- preview chrome, not part of the design ---- */}
      <div className="mx-auto mb-8 flex w-full max-w-[760px] flex-col gap-item-gap rounded-md border border-divider-subtle bg-surface-subtle p-card-padding">
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

      {/* ---- the page itself ---- */}
      <div className="mx-auto flex w-full max-w-[640px] flex-col">
        <div className="flex w-full flex-col gap-item-gap">
          <h1 className="text-title font-semibold text-primary">
            {plant.common_name}
          </h1>
          <p className="text-body italic text-muted">{plant.scientific_name}</p>
        </div>

        {/* ---------------------------------------------------------------
            1. STATE. Where this plant is right now. Status, position within
            the stage, and the one thing to do about it. All three already
            exist: getBloomStatus, getStageNote, seasonal_care[season].
        ---------------------------------------------------------------- */}
        <section className="mt-section-break flex w-full flex-col gap-item-gap rounded-md border border-card bg-surface-card p-card-padding">
          <div className="flex flex-wrap items-center gap-item-gap">
            {/* Badge, not Chip: the status is a readout, not a control. */}
            <Badge variant="accent">{STATUS_LABEL[status]}</Badge>
            <span className="text-body text-secondary">{stageNote}</span>
          </div>

          <p className="text-body text-primary">
            {currentAction ?? 'Nothing to do this stage.'}
          </p>

          <div className="flex flex-wrap items-center gap-item-gap text-label text-muted">
            {daysInGarden !== null ? (
              <span>In your garden {agoLabel(daysInGarden)}</span>
            ) : (
              // NEEDS COLUMN: palette_plants.planted_at. Today this is inferred
              // from a 'planted' diary event, so a plant marked planted without
              // logging has no age at all, and every establishment window rule
              // in CARE_EVENT_RULES silently never fires for it.
              <span>Planting date not recorded</span>
            )}
            <span aria-hidden>·</span>
            {/* NEEDS COLUMN: palette_plants.placement. The only field that
                distinguishes two copies of the same species. */}
            <span>No spot recorded</span>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            2. THE YEAR. Species window and your logs in one coordinate space.
        ---------------------------------------------------------------- */}
        <section className="mt-section-break flex w-full flex-col gap-item-gap">
          <h2 className="text-section uppercase text-muted">The year</h2>
          <YearTimeline
            bloomMonths={plant.bloom_months}
            events={events}
            today={TODAY}
          />
        </section>

        {/* ---------------------------------------------------------------
            3. ACTIVITY. The diary read as a log rather than a scrapbook.
        ---------------------------------------------------------------- */}
        <section className="mt-section-break flex w-full flex-col gap-item-gap">
          <h2 className="text-section uppercase text-muted">Activity</h2>

          <div className="grid w-full grid-cols-1 gap-inline-gap sm:grid-cols-3">
            {recency.map(({ type, days }) => (
              <StatCard key={type} label={DIARY_EVENT_LABELS[type]}>
                {days === null ? 'Not logged' : agoLabel(days)}
              </StatCard>
            ))}
          </div>

          {notes.length === 0 ? (
            <div className="flex w-full flex-col gap-inline-gap rounded-md bg-fern-100 p-card-padding">
              <p className="text-body text-secondary">
                Nothing logged yet. A note now is what makes next summer
                comparable.
              </p>
              <button
                type="button"
                className="w-fit rounded-chip bg-accent px-3 py-1.5 text-label text-on-accent"
              >
                Write the first note
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-inline-gap">
              {notes.map((note) => (
                <article
                  key={note.id}
                  className="flex w-full flex-col gap-tight-gap rounded-md bg-fern-100 p-inline-gap"
                >
                  <div className="flex items-center gap-tight-gap">
                    <span className="text-label text-muted">
                      {formatDate(note.date)}
                    </span>
                    {note.eventTypes.map((event) => (
                      <span
                        key={event}
                        className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-label text-muted"
                      >
                        {DIARY_EVENT_LABELS[event]}
                      </span>
                    ))}
                  </div>
                  {note.text && (
                    <p className="text-body text-primary">{note.text}</p>
                  )}
                  {note.photoCount > 0 && (
                    <div className="flex gap-inline-gap">
                      {Array.from({ length: note.photoCount }).map((_, i) => (
                        <div
                          key={i}
                          className="relative h-[79px] w-[110px] shrink-0 overflow-hidden rounded-xs"
                        >
                          <PlantImage
                            src={null}
                            alt=""
                            fill
                            sizes="110px"
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-tight-gap">
            {TRACKED_EVENTS.map((type) => (
              <button
                key={type}
                type="button"
                className="rounded-chip bg-surface-control px-3 py-1.5 text-label text-secondary transition-colors duration-fast hover:bg-surface-hover"
              >
                Log {DIARY_EVENT_LABELS[type].toLowerCase()}
              </button>
            ))}
            <button
              type="button"
              className="rounded-chip bg-surface-control px-3 py-1.5 text-label text-secondary transition-colors duration-fast hover:bg-surface-hover"
            >
              Write a note
            </button>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            4. REFERENCE. Everything the Explore view leads with, demoted.
            Nothing is deleted, it just stops competing with your plant.
        ---------------------------------------------------------------- */}
        <section className="mt-section-break flex w-full flex-col gap-item-gap">
          <button
            type="button"
            onClick={() => setReferenceOpen((open) => !open)}
            className="flex w-full items-center justify-between rounded-md border border-divider-subtle px-card-padding py-item-gap text-left transition-colors duration-fast hover:bg-surface-hover"
          >
            <span className="flex flex-col gap-tight-gap">
              <span className="text-body text-primary">Care reference</span>
              <span className="text-label text-muted">
                Water, light, soil, pruning, the full year, and the botanical
                details
              </span>
            </span>
            <span className="text-label text-muted">
              {referenceOpen ? 'Hide' : 'Show'}
            </span>
          </button>

          {referenceOpen && (
            <div className="flex w-full flex-col gap-section-break pt-item-gap">
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

              <div className="flex w-full flex-col gap-item-gap">
                <h3 className="text-section uppercase text-muted">
                  Through the year
                </h3>
                <div className="flex w-full flex-col">
                  {Object.entries(plant.seasonal_rhythm).map(([key, value]) => (
                    <DetailRow
                      key={key}
                      labelWidth="sm"
                      label={
                        key.charAt(0).toUpperCase() +
                        key.slice(1).replace('_', ' ')
                      }
                      value={value}
                    />
                  ))}
                </div>
              </div>

              <div className="flex w-full flex-col gap-item-gap">
                <h3 className="text-section uppercase text-muted">Details</h3>
                <div className="flex w-full flex-col">
                  <DetailRow label="Plant type" value={plant.plant_type} />
                  <DetailRow label="Height" value={plant.height} />
                  <DetailRow label="Spread" value={plant.spread} />
                  <DetailRow
                    label="Best placement"
                    value={plant.best_placement}
                  />
                  <DetailRow
                    label="Environment"
                    value={plant.environment_benefits}
                  />
                  <DetailRow label="Native to" value={plant.native_to} />
                  <DetailRow label="Family" value={plant.family} />
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="h-16" />
      </div>
    </div>
  )
}
