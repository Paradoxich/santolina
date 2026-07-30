/**
 * Guards the token layer's one-home rule. Run by `pnpm tokens:check` and CI.
 *
 * The failure this exists to prevent, concretely: a drift log in docs/
 * (token-taxonomy.md, since deleted) carried
 * `--color-surface-card-translucent: rgb(237 242 238 / 0.7)` next to a
 * sentence naming the component that used it. Over time the value drifted from
 * the ramp step it claimed, and the token was reassigned to a different
 * component. Both halves read as current fact. Neither was.
 *
 * Four checks:
 *
 *   A. No token VALUE in prose. `packages/tokens/index.css` is the only home.
 *      Docs may point at /design-system, which reads values live from :root.
 *      Scans docs/ recursively plus the root-level *.md files.
 *   B. No token re-types another token's channels — whether the copy is the
 *      whole value or a literal buried inside a compound value (the
 *      landing-scrim gradient carried sage-950's channels as a hand-typed
 *      rgb() for weeks). Black is excepted: it is --color-scrim's own value,
 *      and every shadow legitimately composes black at some alpha.
 *      Ramp-derived values use `rgb(from var(--step) r g b / a)`.
 *   C. The design-system token list covers index.css exactly, both ways.
 *   D. Every fill/stroke in apps/web/public/icons is a current token value.
 *      The weather-*.svg set is exempt by design: illustrations with their
 *      own fixed palette, not UI glyphs (see DESIGN_SYSTEM.md).
 *
 * WHAT A GREEN RUN DOES NOT MEAN. This proves no token value is duplicated and
 * no token is missing from the design-system page. It proves nothing about
 * whether a doc's PROSE is true — whether a token is described as doing what
 * it actually does. That half is unmechanisable; token-consumers.generated.ts
 * exists so the docs never have to claim it in the first place.
 *
 * Historical values are legitimate and exempt via an explicit marker:
 *
 *   <!-- tokens:historical: why this block records values -->
 *   ...
 *   <!-- /tokens:historical -->
 *
 * The marker is deliberately explicit rather than inferred, for the same
 * reason check-round-scope takes an explicit `cleared_at`: a guard that
 * guesses which claims are stale will guess wrong silently.
 */

import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  COLOR_LITERAL,
  REPO_ROOT,
  readRepoFile,
  readTokenDeclarations,
} from './token-source'

const DOCS_DIR = join(REPO_ROOT, 'docs')
const TOKEN_DATA = 'apps/web/components/design-system/token-data.ts'

// Markers may wrap across lines — the reason is prose and should not be
// squeezed onto one line to satisfy a regex.
const OPEN_MARKER = /<!--\s*tokens:historical:\s*[\s\S]+?-->/g
const CLOSE_MARKER = /<!--\s*\/tokens:historical\s*-->/g

interface Failure {
  where: string
  detail: string
}

const failures: Failure[] = []

function listDocs(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.md')) out.push(relative(REPO_ROOT, full))
    }
  }
  walk(DOCS_DIR)
  // Root-level docs (DESIGN_SYSTEM.md, README.md, CLAUDE.md) hold the rules
  // and are the likeliest place a value gets pasted next to a token name.
  for (const entry of readdirSync(REPO_ROOT)) {
    if (entry.endsWith('.md')) out.push(entry)
  }
  return out.sort()
}

/** A. No token value in prose. */
function checkDocs(tokenNames: Set<string>) {
  for (const file of listDocs()) {
    const text = readRepoFile(file)
    const lines = text.split('\n')
    const lineOf = (index: number) => text.slice(0, index).split('\n').length

    // Exempt line ranges: each open marker runs to the next close marker, or
    // to end of file if the author never closed it.
    const opens = [...text.matchAll(OPEN_MARKER)].map((m) => ({
      start: lineOf(m.index!),
      end: lineOf(m.index! + m[0].length),
    }))
    const closes = [...text.matchAll(CLOSE_MARKER)].map((m) => lineOf(m.index!))
    const exempt: [number, number][] = opens.map((open) => [
      open.start,
      closes.find((c) => c >= open.end) ?? lines.length,
    ])
    const isExempt = (line: number) =>
      exempt.some(([from, to]) => line >= from && line <= to)

    lines.forEach((line, i) => {
      if (isExempt(i + 1)) return
      if (!COLOR_LITERAL.test(line)) return
      const named = [...line.matchAll(/--[a-z0-9-]+/gi)]
        .map((m) => m[0])
        .filter((n) => tokenNames.has(n))
      if (named.length === 0) return
      failures.push({
        where: `${file}:${i + 1}`,
        detail:
          `token value in prose (${named.join(', ')}) — link to /design-system, ` +
          `or wrap the block in <!-- tokens:historical: reason -->`,
      })
    })
  }
}

/**
 * `#rgb` / `#rrggbb` / `rgb(r g b ...)` -> "r,g,b", or null if not a literal.
 *
 * The WHOLE value must be the colour. A shadow (`0 1px 2px rgb(0 0 0 / .05)`)
 * or a gradient contains a colour but is not one, and treating it as one made
 * every shadow look like a copy of `--shadow-sm`.
 */
function channelsOf(raw: string): string | null {
  const value = raw.trim()
  if (!/^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(value)) return null

  const hex = value.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i)?.[1]
  if (hex) {
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((d) => d + d)
            .join('')
        : hex
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(',')
  }
  const fn = value.match(/\brgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i)
  if (fn) return [fn[1], fn[2], fn[3]].map((n) => Number(n)).join(',')
  return null
}

/**
 * B. No token re-types the channels of another token.
 *
 * This is the check that actually catches the original bug. An earlier
 * version only looked for colour literals inside COMMENTS — and a negative
 * test proved it green against a faithful reproduction of the defect, because
 * in the real thing the literal sits in the declaration and the comment merely
 * mislabels it. It was checking the symptom.
 *
 * The rule: if a declaration's channels equal a primitive's channels, it is a
 * copy of that primitive, whatever the comment says. Say so with
 * `rgb(from var(--that-primitive) r g b / <alpha>)` and the copy is gone.
 */
function checkNoChannelCopies(tokens: { name: string; value: string }[]) {
  // Primitives are the tokens that legitimately hold a raw value.
  const primitives = new Map<string, string>()
  for (const { name, value } of tokens) {
    if (value.includes('var(')) continue
    const ch = channelsOf(value)
    if (ch && !primitives.has(ch)) primitives.set(ch, name)
  }

  const css = readRepoFile('packages/tokens/index.css')
  const lineOf = (needle: string) => {
    const i = css.indexOf(needle)
    return i === -1 ? 0 : css.slice(0, i).split('\n').length
  }

  for (const { name, value } of tokens) {
    if (primitives.get(channelsOf(value) ?? '') === name) continue // is the primitive
    if (value.includes('var(')) continue // already derives
    const ch = channelsOf(value)
    if (!ch) continue
    const source = primitives.get(ch)
    if (!source) continue // a literal that matches no primitive is its own value
    failures.push({
      where: `packages/tokens/index.css:${lineOf(name)}`,
      detail:
        `${name} re-types the channels of ${source}. Derive it instead: ` +
        `rgb(from var(${source}) r g b / <alpha>) — a hand-typed copy drifts ` +
        'from the step its comment names, which is how this started.',
    })
  }

  // A literal buried inside a compound value (gradient, shadow) is the same
  // copy in a place the whole-value parse can't see. Black is excepted: it is
  // --color-scrim's own value, and shadows legitimately compose it.
  for (const { name, value } of tokens) {
    if (channelsOf(value)) continue // whole values handled above
    for (const literal of value.matchAll(
      /#[0-9a-f]{3,8}\b|\brgba?\(\s*\d+[\s,]+\d+[\s,]+\d+[^)]*\)/gi
    )) {
      const ch = channelsOf(literal[0])
      if (!ch || ch === '0,0,0') continue
      const source = primitives.get(ch)
      if (!source || source === name) continue
      failures.push({
        where: `packages/tokens/index.css:${lineOf(name)}`,
        detail:
          `${name} embeds the channels of ${source} inside a compound value. ` +
          `Derive that stop instead: rgb(from var(${source}) r g b / <alpha>).`,
      })
    }
  }
}

/** C. The design-system token list matches index.css in both directions. */
function checkDesignSystemCoverage(tokenNames: Set<string>) {
  const listed = new Set(
    [...readRepoFile(TOKEN_DATA).matchAll(/'(--[a-z0-9-]+)'/gi)].flatMap(
      (m) => m[1] ?? []
    )
  )
  // token-data.ts builds ramps programmatically, so re-expand those the same
  // way the file does rather than demanding 44 literal strings.
  for (const hue of ['sage', 'fern', 'honey', 'brick']) {
    if (!readRepoFile(TOKEN_DATA).includes(`rampNames('${hue}')`)) continue
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      listed.add(`--color-${hue}-${step}`)
    }
  }

  for (const name of tokenNames) {
    if (!listed.has(name)) {
      failures.push({
        where: TOKEN_DATA,
        detail: `${name} is declared in index.css but missing from the design-system list`,
      })
    }
  }
  for (const name of listed) {
    if (!tokenNames.has(name)) {
      failures.push({
        where: TOKEN_DATA,
        detail: `${name} is listed on the design-system page but no longer declared in index.css`,
      })
    }
  }
}

/** D. Icon SVGs carry only current token colours (weather set exempt). */
const ICONS_DIR = 'apps/web/public/icons'

function checkIconColors(tokens: { name: string; value: string }[]) {
  const current = new Set<string>()
  for (const { value } of tokens) {
    const ch = channelsOf(value)
    if (ch) current.add(ch)
  }
  for (const entry of readdirSync(join(REPO_ROOT, ICONS_DIR)).sort()) {
    if (!entry.endsWith('.svg')) continue
    if (entry.startsWith('weather-')) continue // illustrations, own palette
    const svg = readRepoFile(`${ICONS_DIR}/${entry}`)
    for (const attr of svg.matchAll(/(?:fill|stroke|stop-color)="([^"]+)"/gi)) {
      const raw = attr[1]!
      if (raw === 'none' || raw === 'currentColor') continue
      const ch = channelsOf(raw === 'white' ? '#ffffff' : raw)
      if (ch && current.has(ch)) continue
      failures.push({
        where: `${ICONS_DIR}/${entry}`,
        detail:
          `${raw} is not a current token value. If a ramp step moved, ` +
          're-export the icon; decorative palettes are weather-only.',
      })
    }
  }
}

function main() {
  const tokens = readTokenDeclarations()
  const names = new Set(tokens.map((t) => t.name))

  checkDocs(names)
  checkNoChannelCopies(tokens)
  checkDesignSystemCoverage(names)
  checkIconColors(tokens)

  if (failures.length === 0) {
    console.log(
      `tokens: OK — ${tokens.length} declared, no values in prose, ` +
        'icon colours current, design-system list matches'
    )
    return
  }

  console.error(`tokens: ${failures.length} failure(s)\n`)
  for (const f of failures) console.error(`  ${f.where}\n    ${f.detail}\n`)
  process.exit(1)
}

main()
