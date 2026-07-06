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
