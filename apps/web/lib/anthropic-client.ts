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

export const CURATION_MODEL = 'claude-sonnet-4-5'

// Separate from CURATION_MODEL so the text-curation scripts keep the model
// their prompts were tuned against. The image pass is new work and needs
// current-generation vision: Sonnet 5 reads images at up to 2576px on the long
// edge, where Sonnet 4.5 downscales to 1568px and loses the focus and framing
// detail the pick depends on.
export const VISION_MODEL = 'claude-sonnet-5'
