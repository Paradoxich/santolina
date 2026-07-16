'use client'

import { Chip, SwatchChip } from '@paradoxui/ui'
import { BLOOM_COLOR_BUCKETS } from '@/lib/bloom-colors'
import {
  EMPTY_FILTERS,
  SEASON_OPTIONS,
  STYLE_OPTIONS,
  SUN_OPTIONS,
  TYPE_OPTIONS,
  countActiveFilters,
  toggleValue,
  type ExploreFilterState,
  type FilterOption,
} from '@/lib/explore-filters'

interface ExploreFiltersProps {
  filters: ExploreFilterState
  onChange: (next: ExploreFilterState) => void
  /** Whether the garden's region resolved — hides the native chip when not. */
  canFilterNative: boolean
}

interface AxisRowProps {
  label: string
  options: FilterOption[]
  selected: string[]
  onToggle: (value: string) => void
}

/** Shared treatment for the small utility label above each filter row. */
const AXIS_LABEL = 'text-label uppercase tracking-label text-secondary'

function AxisRow({ label, options, selected, onToggle }: AxisRowProps) {
  return (
    <div>
      <p className={AXIS_LABEL}>{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip
            key={o.value}
            selected={selected.includes(o.value)}
            onClick={() => onToggle(o.value)}
          >
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}

/**
 * The Explore filter rows, toggled by the search bar's filter icon.
 * Functional first pass — visual treatment gets its own design pass later.
 */
export function ExploreFilters({
  filters,
  onChange,
  canFilterNative,
}: ExploreFiltersProps) {
  const activeCount = countActiveFilters(filters)

  return (
    <div className="mt-3 rounded-lg border border-divider bg-surface-card p-card-padding shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-label uppercase tracking-label text-muted">
          Filters
        </p>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="text-body-small text-secondary transition-colors duration-normal hover:text-primary"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="mt-row-gap flex flex-col gap-row-gap">
        <AxisRow
          label="Type"
          options={TYPE_OPTIONS}
          selected={filters.types}
          onToggle={(v) =>
            onChange({ ...filters, types: toggleValue(filters.types, v) })
          }
        />
        <AxisRow
          label="Sun"
          options={SUN_OPTIONS}
          selected={filters.sun}
          onToggle={(v) =>
            onChange({ ...filters, sun: toggleValue(filters.sun, v) })
          }
        />
        <AxisRow
          label="Bloom season"
          options={SEASON_OPTIONS}
          selected={filters.seasons}
          onToggle={(v) =>
            onChange({ ...filters, seasons: toggleValue(filters.seasons, v) })
          }
        />
        <AxisRow
          label="Style"
          options={STYLE_OPTIONS}
          selected={filters.styles}
          onToggle={(v) =>
            onChange({ ...filters, styles: toggleValue(filters.styles, v) })
          }
        />
        <div>
          <p className={AXIS_LABEL}>Color</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {BLOOM_COLOR_BUCKETS.map((b) => (
              <SwatchChip
                key={b.value}
                color={b.swatch}
                label={b.label}
                selected={filters.colors.includes(b.value)}
                onClick={() =>
                  onChange({
                    ...filters,
                    colors: toggleValue(filters.colors, b.value),
                  })
                }
              />
            ))}
          </div>
        </div>

        {canFilterNative && (
          <div>
            <p className={AXIS_LABEL}>Region</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip
                selected={filters.nativeOnly}
                onClick={() =>
                  onChange({ ...filters, nativeOnly: !filters.nativeOnly })
                }
              >
                Native to my region
              </Chip>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExploreFilters
