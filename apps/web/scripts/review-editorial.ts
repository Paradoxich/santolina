/**
 * Build a browsable page showing what the editorial bar actually says about a
 * set of plants — the photo, the copy and the tags, side by side, with each
 * criterion marked cleared or open.
 *
 * WHY IT EXISTS. `is_curated` is one word for three judgments, and after the
 * 2026-07-29 split those judgments are recorded separately. That makes a
 * question answerable that was not before: *which* criterion is a row short
 * on? The immediate case is round 7's 76 rows, marked approved before the
 * stamp columns existed — approvals with nothing recorded behind them. Deciding
 * whether to trust them is a judgment about earlier work, and judging it from
 * a list of names is not really judging it.
 *
 * Nothing here writes. It is a reading tool, like review-image-picks.ts, and
 * for the same reason: reviewing copy and photographs means looking at them,
 * and a markdown file full of remote <img> tags does not render anywhere
 * useful.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/review-editorial.ts --round 7
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/review-editorial.ts --ids a,b
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/review-editorial.ts --legacy
 *   open reports/editorial-review.html
 *
 * --legacy is the shortcut for the case above: rows claiming is_curated with
 * no editorial_checked_at at all.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { parseScope, scopeIds, describeScope, applyScope } from './scope'
import { IMAGE_CONFIDENCE_REQUIRED } from '../lib/editorial-standard'

const REPORTS_DIR = join(process.cwd(), 'reports')
const HTML_OUT = join(REPORTS_DIR, 'editorial-review.html')

interface Row {
  id: string
  common_name: string
  scientific_name: string | null
  plant_type_label: string | null
  description: string | null
  style_tags: string[] | null
  space_types: string[] | null
  image_url: string | null
  image_url_curated: string | null
  image_pick_confidence: string | null
  image_verified_at: string | null
  is_curated: boolean | null
  editorial_checked_at: string | null
  editorial_image_at: string | null
  editorial_description_at: string | null
  editorial_tags_at: string | null
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] as string
  )

/**
 * What criterion 1 would say today, restated here rather than imported from
 * curate-editorial — that script is a pass with a mandatory scope and side
 * effects, and importing it to ask a question would run it. The BAR itself
 * comes from lib/editorial-standard.ts, which is the part that must not drift.
 */
function imageVerdict(r: Row): { ok: boolean; note: string } {
  if (!r.image_url_curated && !r.image_url)
    return { ok: false, note: 'no image at all' }
  if (!r.image_pick_confidence)
    return { ok: false, note: 'the image pass never judged this row' }
  if (r.image_pick_confidence === IMAGE_CONFIDENCE_REQUIRED)
    return { ok: true, note: 'high confidence' }
  if (r.image_pick_confidence === 'medium')
    return {
      ok: false,
      note: r.image_verified_at
        ? 'medium, and it survived the targeted re-check — needs a different photograph'
        : 'medium — a targeted re-check would settle it',
    }
  return { ok: false, note: `${r.image_pick_confidence} confidence` }
}

function card(r: Row): string {
  const img = imageVerdict(r)
  const hero = r.image_url_curated ?? r.image_url
  const criterion = (label: string, cleared: boolean, note: string) =>
    `<div class="crit ${cleared ? 'ok' : 'open'}">
       <span class="dot"></span>
       <div><strong>${label}</strong><br><span class="note">${escapeHtml(note)}</span></div>
     </div>`

  return `<article class="card">
  <div class="pane">
    ${hero ? `<img loading="lazy" src="${hero}">` : '<div class="none">no image</div>'}
  </div>
  <div class="body">
    <h3>${escapeHtml(r.common_name)}</h3>
    <div class="meta">
      ${r.scientific_name ? `<em>${escapeHtml(r.scientific_name)}</em>` : ''}
      ${r.plant_type_label ? `<span class="tag">${escapeHtml(r.plant_type_label)}</span>` : ''}
    </div>
    <p class="desc">${escapeHtml(r.description ?? '(no description)')}</p>
    <div class="tags">
      <strong>style:</strong> ${r.style_tags?.length ? r.style_tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(' ') : '<span class="none">none (style-neutral)</span>'}
      &nbsp; <strong>space:</strong> ${r.space_types?.length ? r.space_types.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(' ') : '<span class="none">none</span>'}
    </div>
    <div class="crits">
      ${criterion('1. image shows the right plant', img.ok, img.note)}
      ${criterion('2. description reads well', Boolean(r.editorial_description_at), r.editorial_description_at ? 'cleared' : 'never recorded')}
      ${criterion('3. tags make product sense', Boolean(r.editorial_tags_at), r.editorial_tags_at ? 'cleared' : 'never recorded')}
    </div>
  </div>
</article>`
}

async function main() {
  const argv = process.argv.slice(2)
  const legacy = argv.includes('--legacy')
  const supabase = getSupabaseAdmin()

  const scope = parseScope(argv)
  const ids = scope ? scopeIds(scope) : null

  if (!legacy && !scope) {
    console.error(
      '\nreview-editorial needs --round <label>, --ids <a,b>, or --legacy.\n' +
        '--legacy shows rows marked curated with no editorial verdict recorded.\n'
    )
    process.exit(1)
  }

  const rows = await fetchAllRows<Row>((from, to) => {
    let q = supabase
      .from('plants')
      .select(
        'id, common_name, scientific_name, plant_type_label, description, style_tags, space_types, image_url, image_url_curated, image_pick_confidence, image_verified_at, is_curated, editorial_checked_at, editorial_image_at, editorial_description_at, editorial_tags_at'
      )
    if (legacy) q = q.eq('is_curated', true).is('editorial_checked_at', null)
    return applyScope(q, ids).order('common_name').range(from, to)
  })

  if (rows.length === 0) {
    console.log('No matching plants.')
    return
  }

  const imgOpen = rows.filter((r) => !imageVerdict(r).ok).length

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Editorial review</title>
<style>
  :root { color-scheme: light dark; --line: #8883; }
  body { font: 15px/1.6 ui-sans-serif, system-ui, sans-serif; margin: 0 auto; padding: 2rem 1.5rem 6rem; max-width: 1000px; }
  h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
  .lede { opacity: .8; margin: 0 0 2rem; }
  .card { display: flex; gap: 1.25rem; border: 1px solid var(--line); border-radius: 10px; padding: 1rem; margin-bottom: 1rem; }
  .pane { flex: 0 0 220px; }
  .pane img { width: 100%; height: 200px; object-fit: cover; border-radius: 6px; display: block; background: #8881; }
  .body { flex: 1 1 auto; min-width: 0; }
  h3 { margin: 0; font-size: 1.05rem; }
  .meta { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin: .2rem 0 .6rem; opacity: .8; font-size: .85rem; }
  .tag { border: 1px solid var(--line); border-radius: 99px; padding: .05rem .5rem; font-size: .75rem; }
  .desc { margin: 0 0 .6rem; }
  .tags { font-size: .85rem; margin-bottom: .75rem; }
  .none { opacity: .55; font-style: italic; }
  .crits { display: flex; flex-direction: column; gap: .3rem; border-top: 1px solid var(--line); padding-top: .6rem; }
  .crit { display: flex; gap: .5rem; align-items: flex-start; font-size: .85rem; }
  .dot { width: .6rem; height: .6rem; border-radius: 50%; margin-top: .45rem; flex: 0 0 auto; }
  .crit.ok .dot { background: #3a825a; }
  .crit.open .dot { background: #b8860b; }
  .crit.open .note { opacity: .9; }
  .note { opacity: .7; }
  @media (max-width: 720px) { .card { flex-direction: column; } .pane { flex: none; } }
</style>

<h1>Editorial review — ${rows.length} plant(s)</h1>
<p class="lede">${
    legacy
      ? `These are marked <strong>curated</strong> but carry no editorial verdict — they were approved before the stamp columns existed, so nothing records what was checked. <strong>${imgOpen}</strong> of them would not clear criterion 1 today.`
      : escapeHtml(describeScope(scope!, ids))
  }<br>
Green means that criterion is recorded as cleared. Amber means it is not — which is not the same as failing, only that nothing recorded it.</p>

${rows.map(card).join('\n')}
`

  mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(HTML_OUT, html)
  console.log(
    `\n${rows.length} plant(s); ${imgOpen} would not clear the image criterion today.`
  )
  console.log(`Page: ${HTML_OUT}`)
  console.log(`Open it with:  open ${HTML_OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
