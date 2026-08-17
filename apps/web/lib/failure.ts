/**
 * The user-facing half of a failure.
 *
 * Every server action in this app throws for developers, not for readers:
 *
 *   throw new Error(`Failed to add diary entry: ${error.message}`)
 *   throw new Error('Palette row not found in the current garden')
 *
 * Components used to render `err.message` straight into the UI with a friendly
 * string as the `instanceof Error` fallback beside it, which made the friendly
 * string dead code — it fired only for a non-Error throw, and everything real
 * throws an Error. So what users actually saw was Postgres text and internal
 * row language. Found 2026-08-17 while sweeping error styling: forcing one
 * write to fail put the word "offline" on screen, verbatim from the thrown
 * Error.
 *
 * The shape here has no branch: the message shown is ALWAYS the caller's copy,
 * chosen for the action that failed, and the thrown error goes to the console
 * where it is worth reading. There is deliberately no way to ask this function
 * for `err.message` — a caller that wants to show what was thrown has to stop
 * using it, which is visible in review.
 *
 * Copy convention for the second argument: name what did not happen, then what
 * to do. "Could not save your note. Try again." Not "Error saving note", and
 * never a dash.
 */
/**
 * A thrown error whose message IS the copy, for the one place that needs it:
 * the auth controls, where the action lives in the caller (signing in vs
 * converting a demo garden) and only the caller knows how its failure reads.
 *
 * The marker is the point. `AuthOptions` used to show `(error as Error).message`
 * for anything thrown, which was right for the wrapped Supabase failures its
 * callers raise deliberately, and wrong for everything else — a network fault
 * inside `signInWithOtp`, which throws rather than returning `{ error }`, put
 * its own text on the sign-in card. Now only a message that was written for a
 * reader can reach one.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

export function failureMessage(err: unknown, copy: string): string {
  // eslint-disable-next-line no-console -- the technical half has to land
  // somewhere, and this is the only place that still has it.
  console.error(err)
  return copy
}
