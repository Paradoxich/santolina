/**
 * Parse the "keep the before" revert list exported by the image-pick review
 * page (scripts/review-image-picks.ts).
 *
 * Pure and side-effect free so it can be unit-tested and imported without
 * triggering a script run — the parser decides what gets written to the
 * database, so it is the part most worth testing in isolation.
 */

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

/**
 * Pull one plant id from each line that isn't a comment.
 *
 * The review export folds all three verdicts into one file: the reverts are
 * bare id lines, while "needs a new photo" and "confirmed good" ride along as
 * `#` comments. Skipping comment lines is what keeps a name sitting in a
 * comment from ever being mistaken for something to change.
 */
export function parseRevertList(text: string): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const match = line.match(UUID_RE)
    if (!match) continue
    const id = match[0].toLowerCase()
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}
