// Typed diary events — the shared vocabulary behind Tier 3 Care Tips and the
// diary "did it" shortcut. Client-safe: no framework or Supabase imports, so
// both the composer (client) and care-tips logic can import it.
//
// Vocabulary ruling (Care Tips v2 spec, July 14 2026): "fertilize", never
// "feed" — the audience is non-native-English European beginners, and
// "fertilize" is the word on the product label with cognates across most
// European languages.

export const DIARY_EVENT_TYPES = [
  'planted',
  'watered',
  'fertilized',
  'pruned',
] as const

export type DiaryEventType = (typeof DIARY_EVENT_TYPES)[number]

/** Past-tense label for the event tag on a diary entry and the picker chips. */
export const DIARY_EVENT_LABELS: Record<DiaryEventType, string> = {
  planted: 'Planted',
  watered: 'Watered',
  fertilized: 'Fertilized',
  pruned: 'Pruned',
}

export function isDiaryEventType(value: unknown): value is DiaryEventType {
  return (
    typeof value === 'string' &&
    (DIARY_EVENT_TYPES as readonly string[]).includes(value)
  )
}
