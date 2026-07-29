/**
 * Shared reading of the token layer for the two token guards
 * (scan-token-usage.ts, check-tokens.ts).
 *
 * One home rule this file exists to serve: `packages/tokens/index.css` is the
 * only place a token VALUE may be written. Everything else — docs, the
 * design-system page, this scan — must derive from it or link to it.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export const REPO_ROOT = resolve(__dirname, '../../..')
export const TOKENS_CSS = join(REPO_ROOT, 'packages/tokens/index.css')

/** Source trees a token can legitimately be consumed from. */
const SOURCE_ROOTS = [
  'apps/web/app',
  'apps/web/components',
  'apps/web/lib',
  'apps/web/hooks',
  'apps/web/server',
  'apps/web/styles',
  'packages/ui/src',
]

const SOURCE_EXTS = ['.ts', '.tsx', '.css']
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', 'dist', '.git'])

/**
 * A CSS colour literal: hex, or a colour function whose first argument is a
 * number. The "starts with a number" part carries real weight —
 *
 *   rgb(255 255 255 / 0.6)          a literal value        -> flagged
 *   rgb(from var(--step) r g b / a) derives from a token   -> fine
 *   "never paste an rgb() triple"   prose about the syntax -> fine
 *
 * so relative colour syntax and prose both pass without needing an exemption.
 * A rule stated as "mentions rgb(" flagged this file's own guidance comment.
 */
export const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(\s*[\d.]/i

/** A custom-property declaration: `--name: value;` (value may wrap lines). */
const DECLARATION = /(--[a-z0-9-]+)\s*:\s*([^;]*);/gi

export interface TokenDeclaration {
  name: string
  /** Raw declared value, whitespace collapsed. Never re-published as prose. */
  value: string
}

/** Every custom property declared in index.css, in source order. */
export function readTokenDeclarations(): TokenDeclaration[] {
  const css = readFileSync(TOKENS_CSS, 'utf8')
  const out: TokenDeclaration[] = []
  const seen = new Set<string>()
  for (const match of css.matchAll(DECLARATION)) {
    const [, name, rawValue] = match
    if (!name || rawValue === undefined) continue
    if (seen.has(name)) continue
    seen.add(name)
    out.push({ name, value: rawValue.replace(/\s+/g, ' ').trim() })
  }
  return out
}

/** Every scannable source file, repo-relative. */
export function listSourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (SOURCE_EXTS.some((ext) => entry.endsWith(ext))) {
        out.push(relative(REPO_ROOT, full))
      }
    }
  }
  for (const root of SOURCE_ROOTS) walk(join(REPO_ROOT, root))
  return out.sort()
}

export function readRepoFile(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8')
}
