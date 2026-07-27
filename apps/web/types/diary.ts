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
