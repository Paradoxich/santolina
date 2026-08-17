// SERVER-ONLY — never import this file in client components.
import Anthropic from '@anthropic-ai/sdk'

// ---------------------------------------------------------------------------
// The usage meter
//
// WHY IT IS HERE AND NOT AT THE CALL SITES. Every script that spends money
// reaches the API through getAnthropicClient(), so this is the only place that
// sees all of them — including the next one somebody writes. The alternative,
// a `run.usage(response.usage)` line per call site, is fifteen edits today and
// a silent gap the first time an author forgets one. Same reason the recipe is
// hashed rather than version-numbered: a fact that depends on somebody
// remembering has already rotted here at least once.
//
// TOKENS, NEVER DOLLARS. Prices change and are not a property of the run; the
// token counts are what actually happened. Cost is derived at read time from
// the model and the mode, which is why both are in the key.
// ---------------------------------------------------------------------------

export interface UsageTotals {
  /** API calls whose usage was observed. NOT rows: a row can cost two calls. */
  calls: number
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

/**
 * Keyed `${model}:${mode}`. Mode is part of the key because the Batch API bills
 * at half rate, so a total that mixes the two cannot be priced afterwards —
 * and the vision pass, the most expensive step in the pipeline, is the batch
 * one.
 */
export type UsageMeter = Record<string, UsageTotals>

type UsageMode = 'sync' | 'batch'

const meter: UsageMeter = {}

const emptyTotals = (): UsageTotals => ({
  calls: 0,
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
})

/**
 * Add one response's usage to the process-wide meter. Exported for the two
 * places that cannot be wrapped, and for tests.
 */
export function recordUsage(
  model: string,
  mode: UsageMode,
  usage: {
    input_tokens?: number | null
    output_tokens?: number | null
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
  }
): void {
  const key = `${model}:${mode}`
  const totals = (meter[key] ??= emptyTotals())
  totals.calls += 1
  totals.input_tokens += usage.input_tokens ?? 0
  totals.output_tokens += usage.output_tokens ?? 0
  totals.cache_creation_input_tokens += usage.cache_creation_input_tokens ?? 0
  totals.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0
}

/** A snapshot, deep-copied so the caller cannot be mutated out from under. */
export function readUsageMeter(): UsageMeter {
  return Object.fromEntries(
    Object.entries(meter).map(([key, totals]) => [key, { ...totals }])
  )
}

/**
 * What was spent since a snapshot. Keys present in `before` but unchanged since
 * are dropped, so a run that made no calls reports `{}` rather than a wall of
 * zeroes.
 */
export function usageSince(before: UsageMeter): UsageMeter {
  const delta: UsageMeter = {}
  for (const [key, after] of Object.entries(readUsageMeter())) {
    const prior = before[key] ?? emptyTotals()
    const diff: UsageTotals = {
      calls: after.calls - prior.calls,
      input_tokens: after.input_tokens - prior.input_tokens,
      output_tokens: after.output_tokens - prior.output_tokens,
      cache_creation_input_tokens:
        after.cache_creation_input_tokens - prior.cache_creation_input_tokens,
      cache_read_input_tokens:
        after.cache_read_input_tokens - prior.cache_read_input_tokens,
    }
    if (diff.calls > 0) delta[key] = diff
  }
  return delta
}

/** Test seam. Never called by a script — the meter is per-process by design. */
export function resetUsageMeter(): void {
  for (const key of Object.keys(meter)) delete meter[key]
}

function createClient() {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  return meterUsage(new Anthropic({ apiKey }))
}

/**
 * Wrap the two entry points that return billed usage.
 *
 * `messages.create` covers every text script. `messages.batches.results` covers
 * the image pass, which submits a batch and reads the usage back per entry —
 * a client that only wrapped `create` would miss the single most expensive step
 * in the pipeline and report the round as cheap.
 *
 * HONEST LIMIT, and it is the one to know when reading a record: batch tokens
 * are attributed to the invocation that READS the results, not the one that
 * submitted the batch. A pick that is submitted by one run and collected by a
 * later resumed run bills, in the log, to the second. Re-reading a completed
 * batch's results a second time counts them twice for the same reason. Both are
 * visible as a run whose batch `calls` exceed its `row_count`.
 */
export function meterUsage(client: Anthropic): Anthropic {
  const create = client.messages.create.bind(client.messages)
  client.messages.create = (async (body: never, options: never) => {
    const response = await create(body, options)
    // A streamed response is a Stream and carries no usage here; only the
    // non-streaming Message does.
    if (response && typeof response === 'object' && 'usage' in response) {
      recordUsage(
        (body as { model: string }).model,
        'sync',
        (response as { usage: Parameters<typeof recordUsage>[2] }).usage
      )
    }
    return response
  }) as typeof client.messages.create

  const results = client.messages.batches.results.bind(client.messages.batches)
  client.messages.batches.results = (async (id: never, options: never) => {
    const page = await results(id, options)
    // Callers do `for await (const entry of await results(...))`, so handing
    // back an async iterable is enough; nothing uses the decoder's own methods.
    return (async function* metered() {
      for await (const entry of page) {
        if (entry.result.type === 'succeeded') {
          const message = entry.result.message
          recordUsage(message.model, 'batch', message.usage)
        }
        yield entry
      }
    })()
  }) as unknown as typeof client.messages.batches.results

  return client
}

let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) _client = createClient()
  return _client
}

// Used by every TEXT curation and cross-check script: curate-plants,
// cross-check-plants, curate-combinations, curate-styles, curate-greenery,
// draft-hardiness, and the seasonal-care pair. Their prompts were tuned
// against 4.5.
//
// DO NOT merge this with VISION_MODEL, and do not bump it as a routine
// dependency update. Changing it is a data migration: a new model silently
// re-rolls every field these scripts draft, so it needs its own sample review
// — the same discipline as the seasonal_care and combinations sample passes —
// not a version bump. The image pass had no such baseline to protect, which is
// why it could start on the newer model.
export const CURATION_MODEL = 'claude-sonnet-4-5'

// Separate from CURATION_MODEL so the text-curation scripts keep the model
// their prompts were tuned against. The image pass is new work and needs
// current-generation vision: Sonnet 5 reads images at up to 2576px on the long
// edge, where Sonnet 4.5 downscales to 1568px and loses the focus and framing
// detail the pick depends on.
export const VISION_MODEL = 'claude-sonnet-5'
