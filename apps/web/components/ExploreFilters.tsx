'use client'

import { FilterDropdown } from '@/components/FilterDropdown'
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
} from '@/lib/explore-filters'

interface ExploreFiltersProps {
  filters: ExploreFilterState
  onChange: (next: ExploreFilterState) => void
  /** Whether the garden's region resolved — hides the Region chip when not. */
  canFilterNative: boolean
}

// The Color axis carries a swatch per option; the others are plain labels.
const COLOR_OPTIONS = BLOOM_COLOR_BUCKETS.map((b) => ({
  value: b.value,
  label: b.label,
  swatch: b.swatch,
}))

const NATIVE_OPTIONS = [{ value: 'native', label: 'Native to my region' }]

/**
 * The Explore filters, surfaced below the search field as a row of dropdown
 * chips — one per axis (Type, Sun, Bloom season, Style, Color, Region). Each
 * chip opens a multi-select popover and shows a count when active.
 */
export function ExploreFilters({
  filters,
  onChange,
  canFilterNative,
}: ExploreFiltersProps) {
  const activeCount = countActiveFilters(filters)

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <FilterDropdown
        label="Type"
        options={TYPE_OPTIONS}
        selected={filters.types}
        onToggle={(v) =>
          onChange({ ...filters, types: toggleValue(filters.types, v) })
        }
      />
      <FilterDropdown
        label="Sun"
        options={SUN_OPTIONS}
        selected={filters.sun}
        onToggle={(v) =>
          onChange({ ...filters, sun: toggleValue(filters.sun, v) })
        }
      />
      <FilterDropdown
        label="Bloom season"
        options={SEASON_OPTIONS}
        selected={filters.seasons}
        onToggle={(v) =>
          onChange({ ...filters, seasons: toggleValue(filters.seasons, v) })
        }
      />
      <FilterDropdown
        label="Style"
        options={STYLE_OPTIONS}
        selected={filters.styles}
        onToggle={(v) =>
          onChange({ ...filters, styles: toggleValue(filters.styles, v) })
        }
      />
      <FilterDropdown
        label="Color"
        options={COLOR_OPTIONS}
        selected={filters.colors}
        onToggle={(v) =>
          onChange({ ...filters, colors: toggleValue(filters.colors, v) })
        }
      />
      {canFilterNative && (
        <FilterDropdown
          label="Region"
          options={NATIVE_OPTIONS}
          selected={filters.nativeOnly ? ['native'] : []}
          onToggle={() =>
            onChange({ ...filters, nativeOnly: !filters.nativeOnly })
          }
        />
      )}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="ml-1 text-body-small text-secondary transition-colors duration-normal hover:text-primary"
        >
          Clear all
        </button>
      )}
    </div>
  )
}

export default ExploreFilters
