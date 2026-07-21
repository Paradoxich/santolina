/**
 * Build a browsable review page for the hero-image picks.
 *
 * The markdown report is fine for skimming reasons, but reviewing an image pick
 * means looking at the images, and remote <img> tags don't render usefully in
 * most markdown viewers. This emits a standalone HTML file instead: open it in
 * a normal browser and the photos load straight from their source.
 *
 * Verdicts are kept in localStorage so a review can be done across several
 * sittings without losing anything, and exported as a plain list of plant names
 * to act on. Nothing here writes to the database — deciding what to do with a
 * rejected pick is a separate, deliberate step.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/review-image-picks.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/review-image-picks.ts --all
 *   open reports/image-picks.html
 *
 * Default scope is the review queue (medium confidence and anything with no
 * usable photo). --all includes the high-confidence picks too.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'

const REPORTS_DIR = join(process.cwd(), 'reports')
const HTML_OUT = join(REPORTS_DIR, 'image-picks.html')

interface Row {
  id: string
  common_name: string
  scientific_name: string | null
  image_url: string | null
  image_url_curated: string | null
  image_pick_confidence: 'high' | 'medium' | 'low' | null
  image_pick_reason: string | null
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

function card(r: Row): string {
  const changed = Boolean(
    r.image_url_curated && r.image_url && r.image_url_curated !== r.image_url
  )
  const firstHero = Boolean(r.image_url_curated && !r.image_url)
  const status = !r.image_url_curated
    ? 'no usable photo'
    : firstHero
      ? 'first hero'
      : changed
        ? 'replaced'
        : 'kept'

  const panes = !r.image_url_curated
    ? `<div class="pane"><span class="none">no pick — nothing usable among the candidates</span></div>`
    : changed
      ? `<div class="pane"><h4>before</h4><img loading="lazy" src="${r.image_url}"></div>
         <div class="pane"><h4>after</h4><img loading="lazy" src="${r.image_url_curated}"></div>`
      : `<div class="pane"><h4>${firstHero ? 'new hero' : 'confirmed'}</h4><img loading="lazy" src="${r.image_url_curated}"></div>`

  // "Keep before" only makes sense when there is a distinct before to keep —
  // a replaced pick. For a first hero, a confirmed pick, or a no-usable-photo
  // there is nothing to revert to, so the button is omitted.
  const keepBefore = changed
    ? `<button data-v="before">Keep the before</button>`
    : ''

  return `<article class="card" data-id="${r.id}" data-name="${escapeHtml(r.common_name)}">
  <header>
    <h3>${escapeHtml(r.common_name)}</h3>
    <div class="meta">
      ${r.scientific_name ? `<em>${escapeHtml(r.scientific_name)}</em>` : ''}
      <span class="tag ${r.image_pick_confidence ?? 'none'}">${r.image_pick_confidence ?? 'n/a'}</span>
      <span class="tag status">${status}</span>
    </div>
  </header>
  <p class="reason">${escapeHtml(r.image_pick_reason ?? '(no reason recorded)')}</p>
  <div class="panes">${panes}</div>
  <div class="verdict">
    <button data-v="ok">Good</button>
    ${keepBefore}
    <button data-v="bad">Needs a new photo</button>
    <button data-v="clear">Clear</button>
    <span class="mark"></span>
  </div>
</article>`
}

async function main() {
  const all = process.argv.slice(2).includes('--all')
  const supabase = getSupabaseAdmin()

  const rows = await fetchAllRows<Row>((from, to) =>
    supabase
      .from('plants')
      .select(
        'id, common_name, scientific_name, image_url, image_url_curated, image_pick_confidence, image_pick_reason'
      )
      .not('image_checked_at', 'is', null)
      .order('id')
      .range(from, to)
  )

  // Queue first: no-pick, then low, then medium. High only with --all.
  const rank = { none: 0, low: 1, medium: 2, high: 3 } as const
  const scoped = rows
    .filter(
      (r) => all || !r.image_url_curated || r.image_pick_confidence !== 'high'
    )
    .sort((a, b) => {
      const ka = !a.image_url_curated
        ? 'none'
        : (a.image_pick_confidence ?? 'none')
      const kb = !b.image_url_curated
        ? 'none'
        : (b.image_pick_confidence ?? 'none')
      return rank[ka] - rank[kb] || a.common_name.localeCompare(b.common_name)
    })

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Hero image picks — review</title>
<style>
  :root { color-scheme: light dark; --line: #8883; }
  body { font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 0 auto; padding: 2rem 1.5rem 6rem; max-width: 1100px; }
  h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
  .lede { opacity: .75; margin: 0 0 1.5rem; }
  .bar { position: sticky; top: 0; background: Canvas; border-bottom: 1px solid var(--line); padding: .75rem 0; margin-bottom: 1.5rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; z-index: 2; }
  .card { border: 1px solid var(--line); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; }
  .card.done-ok { border-color: #3a825a; }
  .card.done-bad { border-color: #b4483c; }
  .card.done-before { border-color: #b8860b; }
  header h3 { margin: 0; font-size: 1.1rem; }
  .meta { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin: .25rem 0 .5rem; opacity: .8; font-size: .85rem; }
  .tag { border: 1px solid var(--line); border-radius: 99px; padding: .05rem .5rem; font-size: .75rem; }
  .tag.medium { border-color: #b8860b; }
  .tag.low, .tag.none { border-color: #b4483c; }
  .reason { margin: .25rem 0 .75rem; }
  .panes { display: flex; gap: 1rem; flex-wrap: wrap; }
  .pane { flex: 1 1 320px; }
  .pane h4 { margin: 0 0 .35rem; font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; opacity: .6; }
  .pane img { width: 100%; max-height: 420px; object-fit: cover; border-radius: 6px; display: block; background: #8881; }
  .none { opacity: .6; font-style: italic; }
  .verdict { margin-top: .75rem; display: flex; gap: .5rem; align-items: center; }
  button { font: inherit; padding: .3rem .7rem; border-radius: 6px; border: 1px solid var(--line); background: transparent; cursor: pointer; }
  button:hover { background: #8882; }
  .mark { font-size: .85rem; opacity: .8; }
  #out { width: 100%; min-height: 8rem; margin-top: .5rem; font-family: ui-monospace, monospace; font-size: .8rem; }
</style>

<h1>Hero image picks — review</h1>
<p class="lede">${scoped.length} plant(s)${all ? ' (everything)' : ' — the queue: medium confidence and anything with no usable photo'}. Three verdicts: <strong>Good</strong> keeps the pick, <strong>Keep the before</strong> reverts to the previous photo (a free fix — that photo still exists), <strong>Needs a new photo</strong> flags it for sourcing. Verdicts save in this browser as you go; nothing is written to the database until you run the apply script.</p>

<div class="bar">
  <strong id="progress">0 / ${scoped.length} reviewed</strong>
  <button id="export">Export verdicts</button>
  <button id="reset">Reset all</button>
</div>

${scoped.map(card).join('\n')}

<textarea id="out" placeholder="Export verdicts to get a list you can paste back." hidden></textarea>

<script>
const KEY = 'santolina-image-review'
const store = JSON.parse(localStorage.getItem(KEY) || '{}')

function paint(card) {
  const v = store[card.dataset.id]
  card.classList.toggle('done-ok', v === 'ok')
  card.classList.toggle('done-bad', v === 'bad')
  card.classList.toggle('done-before', v === 'before')
  card.querySelector('.mark').textContent =
    v === 'ok' ? 'looks good'
    : v === 'before' ? 'revert to the previous photo'
    : v === 'bad' ? 'needs a new photo sourced'
    : ''
}

function progress() {
  const n = document.querySelectorAll('.card').length
  const done = Object.keys(store).length
  document.getElementById('progress').textContent = done + ' / ' + n + ' reviewed'
}

document.querySelectorAll('.card').forEach((card) => {
  paint(card)
  card.querySelectorAll('.verdict button').forEach((b) => {
    b.addEventListener('click', () => {
      const v = b.dataset.v
      if (v === 'clear') delete store[card.dataset.id]
      else store[card.dataset.id] = v
      localStorage.setItem(KEY, JSON.stringify(store))
      paint(card); progress()
    })
  })
})
progress()

document.getElementById('export').addEventListener('click', () => {
  const before = [], bad = [], ok = []
  document.querySelectorAll('.card').forEach((c) => {
    const entry = { id: c.dataset.id, name: c.dataset.name }
    const v = store[c.dataset.id]
    if (v === 'before') before.push(entry)
    else if (v === 'bad') bad.push(entry)
    else if (v === 'ok') ok.push(entry)
  })
  // The revert list is the machine-readable part: one plant id per line, which
  // apply-image-reverts.ts parses. The other two verdicts ride along as
  // comments so the whole review lives in one file — the apply script skips
  // any line starting with '#', so they can't be acted on by accident.
  const out = document.getElementById('out')
  out.hidden = false
  out.value =
    '# Paste this into apps/web/reports/image-reverts.txt, then run:\\n' +
    '#   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-image-reverts.ts        (dry run)\\n' +
    '#   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-image-reverts.ts --apply\\n' +
    '#\\n' +
    '# REVERT TO PREVIOUS PHOTO (' + before.length + ') — these lines are what the script acts on:\\n' +
    before.map(e => e.id + '  # ' + e.name).join('\\n') +
    '\\n#\\n' +
    '# NEEDS A NEW PHOTO SOURCED (' + bad.length + ') — for reference, not reverted:\\n' +
    bad.map(e => '#   ' + e.name).join('\\n') +
    '\\n#\\n' +
    '# CONFIRMED GOOD (' + ok.length + '):\\n' +
    ok.map(e => '#   ' + e.name).join('\\n')
  out.scrollIntoView({ behavior: 'smooth' })
})

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Clear every verdict recorded in this browser?')) return
  localStorage.removeItem(KEY)
  for (const k in store) delete store[k]
  document.querySelectorAll('.card').forEach(paint)
  progress()
})
</script>`

  mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(HTML_OUT, html)
  console.log(`Review page: ${HTML_OUT} (${scoped.length} plant(s))`)
  console.log(`Open it with:  open ${HTML_OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
