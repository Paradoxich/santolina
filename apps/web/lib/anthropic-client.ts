// SERVER-ONLY — never import this file in client components.
import Anthropic from '@anthropic-ai/sdk'

function createClient() {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  return new Anthropic({ apiKey })
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
