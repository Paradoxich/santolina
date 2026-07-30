/**
 * Guards cross-references into the docs. Run by `pnpm docs:links` and CI.
 *
 * `docs/architecture.md` used to be addressed by section number — `§24` from a
 * code comment, "see §9" from a sibling doc, ~142 of them, 48 outside the file.
 * A number is a position, so the numbering could not change without silently
 * repointing every one of those citations at the wrong section, which is why an
 * earlier session declined to reorganise the file at all. Sections are now
 * addressed by a named anchor that travels with the section, and this check is
 * what keeps that true: an anchor nobody can resolve is a broken reference, and
 * a new `§N` citation is the old problem growing back.
 *
 * Three checks:
 *
 *   A. Every relative markdown link from a tracked file resolves — the file
 *      exists, and if the link carries a `#fragment`, that anchor exists in it.
 *   B. Every bare `some/doc.md#anchor` in a code comment resolves the same way.
 *      Code comments cannot render a link, so they cite the path directly and
 *      would otherwise be checked by nothing.
 *   C. No `§N` citation outside the frozen artifacts listed below.
 *
 * WHAT A GREEN RUN DOES NOT MEAN. This proves every reference points at
 * something that exists. It proves nothing about whether it points at the RIGHT
 * something — a link to #safe-upsert from a paragraph about hardiness resolves
 * perfectly. Anchors also make a rename cheap, not free: renaming one is a
 * repo-wide find-and-replace, and this check is what tells you that you missed
 * one rather than letting the dead link ship.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { REPO_ROOT } from './token-source'

// Artifacts that record what was true when they were written, and so cannot be
// edited to use the new anchors: an applied migration is history, and an
// archived round report is the record of one run's findings. The appendix in
// architecture.md maps their §N citations onto anchors.
const FROZEN = [/^supabase\/migrations\//, /^apps\/web\/rounds\/\d+\//]

// The appendix is the one place a §N may legitimately appear in living prose,
// because listing them is its entire job.
const APPENDIX_ANCHOR = 'appendix-retired-numbers'

// Read as text only what is text. A PNG decoded as UTF-8 produces byte
// sequences that match `§\d` several times per file, and the first run of this
// check reported eleven of them as citations.
const TEXT = /\.(md|mdx|tsx?|jsx?|mjs|cjs|css|sql|ya?ml|json|txt|sh)$/

interface Failure {
  where: string
  detail: string
}

const failures: Failure[] = []

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return out.split('\0').filter(Boolean)
}

/**
 * GitHub's own heading-to-anchor rule: lowercase, strip anything that is not a
 * word character, space or hyphen, then spaces to hyphens. Markdown syntax in
 * the heading (backticks, links) is stripped first so `` ## `seasonal_care` ``
 * lands where a reader's copied link would.
 */
function headingSlug(heading: string): string {
  return heading
    .replace(/`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
}

function anchorsIn(relPath: string): Set<string> {
  const anchors = new Set<string>()
  const text = readFileSync(join(REPO_ROOT, relPath), 'utf8')
  let inFence = false
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence
    if (inFence) continue
    for (const m of line.matchAll(/<a\s+id="([^"]+)"/g)) {
      if (m[1]) anchors.add(m[1])
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading?.[1]) anchors.add(headingSlug(heading[1]))
  }
  return anchors
}

const anchorCache = new Map<string, Set<string> | null>()

function resolveTarget(
  fromFile: string,
  target: string,
  where: string,
  raw: string
): void {
  const [path, fragment] = target.split('#')
  const relPath = path
    ? normalize(join(dirname(fromFile), path)).replace(/\\/g, '/')
    : fromFile

  if (relPath.startsWith('..')) {
    failures.push({ where, detail: `${raw} escapes the repository` })
    return
  }
  if (!existsSync(join(REPO_ROOT, relPath))) {
    failures.push({ where, detail: `${raw} points at a file that is not here` })
    return
  }
  if (!fragment) return

  if (!anchorCache.has(relPath)) {
    anchorCache.set(
      relPath,
      relPath.endsWith('.md') ? anchorsIn(relPath) : null
    )
  }
  const anchors = anchorCache.get(relPath)
  // A fragment on a non-markdown file (a line number on a .ts, say) is not
  // something this check can verify, so it says nothing rather than guessing.
  if (!anchors) return

  if (!anchors.has(fragment)) {
    failures.push({
      where,
      detail: `${raw} — "${relPath}" has no anchor "#${fragment}"`,
    })
  }
}

function checkFile(relPath: string): void {
  if (!TEXT.test(relPath)) return
  const isFrozen = FROZEN.some((re) => re.test(relPath))
  const isMarkdown = relPath.endsWith('.md')
  const isArchitecture = relPath === 'docs/architecture.md'

  let text: string
  try {
    text = readFileSync(join(REPO_ROOT, relPath), 'utf8')
  } catch {
    return // binary or unreadable; nothing to cross-reference
  }
  if (!/[§#]/.test(text)) return

  let pastAppendix = false
  const lines = text.split('\n')

  lines.forEach((line, i) => {
    const where = `${relPath}:${i + 1}`
    if (isArchitecture && line.includes(`id="${APPENDIX_ANCHOR}"`)) {
      pastAppendix = true
    }

    // C. Section numbers, the thing this check exists to stop coming back.
    if (!isFrozen && !pastAppendix) {
      const cited = line.match(/§\d+/)
      if (cited) {
        failures.push({
          where,
          detail:
            `${cited[0]} cites a section by number. Numbers are display ` +
            `order — link the section's anchor instead ` +
            `(docs/architecture.md#<slug>).`,
        })
      }
    }

    // A. Markdown links, relative ones only.
    if (isMarkdown) {
      for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1]
        if (!target || /^(https?:|mailto:|\/)/.test(target)) continue
        resolveTarget(relPath, target, where, m[0])
      }
    }

    // B. Bare doc paths in code comments. Only paths carrying a fragment: a
    // plain "see docs/database-log.md" is prose, and checking every mention of
    // every filename in the repo would find far more noise than breakage.
    if (!isMarkdown) {
      for (const m of line.matchAll(/([\w./-]+\.md)#([\w-]+)/g)) {
        const [, path, fragment] = m
        if (!path || !fragment) continue
        resolveTarget(
          path.includes('/') ? '.' : relPath,
          `${path}#${fragment}`,
          where,
          m[0]
        )
      }
    }
  })
}

for (const file of trackedFiles()) {
  checkFile(file)
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} broken doc reference(s):\n`)
  for (const f of failures) {
    console.error(`  ${f.where}\n    ${f.detail}\n`)
  }
  console.error(
    'Anchors live above their heading in the target file as <a id="...">.\n'
  )
  process.exit(1)
}

console.log('✓ every doc reference resolves, and none cites a section number')
