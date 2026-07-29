/**
 * Generates `components/design-system/token-consumers.generated.ts` — which
 * source files consume each token.
 *
 * Why generated rather than written down: "where is this token used" was a
 * fact that lived in prose, went stale, and kept describing a component the
 * token had been reassigned away from. A generated answer cannot rot without
 * `pnpm tokens:check` going red.
 *
 * The utility class names come from walking the real Tailwind preset object,
 * not from guessing at the token name — `--color-surface-card-translucent`
 * maps to `bg-surface-card-translucent` because the preset says so.
 *
 * WHAT THIS DOES NOT PROVE: it is a source scan. A file listed here mentions
 * the token; it does not follow a class name built at runtime by string
 * concatenation, and it says nothing about whether the usage is correct or
 * whether the component is reachable. Absence of a consumer is the reliable
 * half of the signal.
 *
 *   pnpm tokens:usage    regenerate
 *   pnpm tokens:check    guards + fails if the committed file is stale
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import preset from '../../../packages/tokens/preset'
import {
  REPO_ROOT,
  listSourceFiles,
  readRepoFile,
  readTokenDeclarations,
} from './token-source'

const OUT_FILE = join(
  REPO_ROOT,
  'apps/web/components/design-system/token-consumers.generated.ts'
)

/**
 * Tailwind theme key -> utility prefixes it produces. A superset is safe:
 * a prefix that never appears in source simply never matches. `colors` is
 * the base palette, which still feeds the utilities not overridden by a
 * dedicated key (divide, fill, stroke).
 */
const PREFIXES: Record<string, string[]> = {
  colors: [
    'bg',
    'text',
    'border',
    'ring',
    'outline',
    'divide',
    'fill',
    'stroke',
  ],
  textColor: ['text'],
  backgroundColor: ['bg'],
  borderColor: ['border', 'divide'],
  ringColor: ['ring'],
  outlineColor: ['outline'],
  fontFamily: ['font'],
  fontSize: ['text'],
  fontWeight: ['font'],
  borderRadius: ['rounded'],
  boxShadow: ['shadow'],
  transitionDuration: ['duration'],
  transitionTimingFunction: ['ease'],
  lineHeight: ['leading'],
  letterSpacing: ['tracking'],
  spacing: [
    'p',
    'px',
    'py',
    'pt',
    'pr',
    'pb',
    'pl',
    'm',
    'mx',
    'my',
    'mt',
    'mr',
    'mb',
    'ml',
    'gap',
    'gap-x',
    'gap-y',
    'space-x',
    'space-y',
    'w',
    'h',
    'min-w',
    'min-h',
    'max-w',
    'max-h',
    'size',
    'inset',
    'top',
    'right',
    'bottom',
    'left',
    'basis',
  ],
}

/** token name -> every utility class that resolves to it. */
function buildClassMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()

  const add = (token: string, cls: string) => {
    if (!map.has(token)) map.set(token, new Set())
    map.get(token)!.add(cls)
  }

  const walk = (node: unknown, prefixes: string[], path: string[]) => {
    if (typeof node === 'string') {
      // Values are `var(--token)`; anything else is a literal like
      // `transparent` and belongs to no token.
      const token = node.match(/var\(\s*(--[a-z0-9-]+)\s*\)/i)?.[1]
      if (!token) return
      const suffix = path.filter((p) => p !== 'DEFAULT').join('-')
      for (const prefix of prefixes) {
        add(token, suffix ? `${prefix}-${suffix}` : prefix)
      }
      return
    }
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        walk(child, prefixes, [...path, key])
      }
    }
  }

  const theme = preset.theme as Record<string, unknown>
  for (const [key, node] of Object.entries(theme)) {
    if (key === 'extend') {
      for (const [ekey, enode] of Object.entries(
        node as Record<string, unknown>
      )) {
        if (PREFIXES[ekey]) walk(enode, PREFIXES[ekey], [])
      }
      continue
    }
    if (PREFIXES[key]) walk(node, PREFIXES[key], [])
  }
  return map
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function main() {
  const tokens = readTokenDeclarations()
  const classMap = buildClassMap()
  const files = listSourceFiles()

  // Read every file once; the per-token scan is a regex over the cached text.
  const contents = new Map(files.map((f) => [f, readRepoFile(f)]))

  const consumers: Record<string, string[]> = {}

  for (const { name } of tokens) {
    const classes = [...(classMap.get(name) ?? [])]
    // A utility must sit on its own word boundary, so `bg-surface-card` does
    // not swallow `bg-surface-card-translucent`.
    const patterns = [
      new RegExp(`var\\(\\s*${escape(name)}\\s*[)/]`),
      ...classes.map(
        (cls) => new RegExp(`(?<![\\w-])${escape(cls)}(?![\\w-])`)
      ),
    ]
    const hits: string[] = []
    for (const [file, text] of contents) {
      // The token file defines tokens; it is never a consumer of one.
      if (file.startsWith('packages/tokens/')) continue
      if (patterns.some((p) => p.test(text))) hits.push(file)
    }
    consumers[name] = hits
  }

  const body = Object.entries(consumers)
    .map(
      ([token, files]) =>
        `  '${token}': [${files.map((f) => `\n    '${f}',`).join('')}${
          files.length ? '\n  ' : ''
        }],`
    )
    .join('\n')

  const header = `// GENERATED by apps/web/scripts/scan-token-usage.ts — do not edit.
// Run \`pnpm tokens:usage\` to regenerate; \`pnpm tokens:check\` fails when stale.
//
// Source-scan only: a listed file mentions the token. It does not prove the
// usage is correct, and it cannot see a class name assembled at runtime.

/** Repo-relative files that reference each token, directly or via a utility. */
export const tokenConsumers: Record<string, string[]> = {
`

  writeFileSync(OUT_FILE, `${header}${body}\n}\n`)

  const used = Object.values(consumers).filter((f) => f.length > 0).length
  console.log(
    `token consumers: ${tokens.length} tokens, ${used} consumed, ` +
      `${tokens.length - used} with no consumer found`
  )
}

main()
