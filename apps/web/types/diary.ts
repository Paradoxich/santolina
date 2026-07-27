import type { DiaryEventType } from '@/lib/diary-events'

export interface DiaryNotePhoto {
  src: string
  /** Rendered width in px — the Figma photo strip mixes widths. */
  width: number
}

export interface DiaryNote {
  id: string
  text: string
  /** ISO date, e.g. "2026-05-08" */
  date: string
  photos?: DiaryNotePhoto[]
  /** Typed care events this entry logged; empty for a freeform note. */
  eventTypes: DiaryEventType[]
}

/**
 * One diary per palette plant — thread identity is (garden, plant), not the
 * palette row itself. Retired alongside the Diary page and its Overview
 * card (stage 2 + stage 4 of the diary-to-plant-story migration); kept
 * until then so every commit in that sequence leaves the app working.
 */
export interface PlantDiary {
  id: string
  /** The plants table id — pairs with the garden as this thread's real identity. */
  plantId: string
  /** The live palette_plants row id, or null if this plant isn't currently in the garden. */
  paletteId: string | null
  plantName: string
  /** Shown at the top of the diary drawer — first sentence of the plant's static description. */
  summary: string
  /** Thumbnail shown in the diary list when the latest note has photos. */
  thumbnailUrl?: string
  notes: DiaryNote[]
}
