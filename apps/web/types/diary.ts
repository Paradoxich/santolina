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
}

/** One diary per palette plant. Will map to Supabase rows later. */
export interface PlantDiary {
  id: string
  plantName: string
  /** Season summary shown at the top of the diary drawer. */
  summary: string
  /** Thumbnail shown in the diary list when the latest note has photos. */
  thumbnailUrl?: string
  notes: DiaryNote[]
}
