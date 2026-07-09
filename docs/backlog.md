# Santolina + Paradox UI — Roadmap

Working backlog for the Santolina app and the Paradox UI design system extracted
from it. Grouped into buckets and roughly prioritized within each; open items
come first, completed ones are grouped under **Done** at the end of each section.
This is a living document, not a commitment.

---

## Design System (Paradox UI)

Paradox UI is extracted from the product as it's built. The current focus is
closing the gap between the kit and how the app actually consumes it.

**Kit vs. product**

- [ ] Extend `Button` with the variants the product needs (small circular icon buttons, light "control" style), then adopt it across the existing hand-rolled call sites. Highest-leverage cleanup.
- [ ] Bloom-status badge colors — the five statuses share one placeholder chip; design a categorical hue palette (hue-named variants in the kit, status→hue mapping in the app) so each status reads distinct. Placement and wiring are done; this is purely color decisions. Chip currently reads over a photo (see placement in Done), so the palette needs enough contrast/opacity to sit on an image.

**Kit consistency**

- [ ] Add `forwardRef` across kit components (form libraries, tooltip positioning).
- [ ] Unify prop naming (`variant` vs. `tone`, `size` vs. `inputSize`).
- [ ] Add a class-merging strategy for consumer style overrides (`tailwind-merge` or equivalent). Follow-up once it lands: the bloom-status corner chip (`GardenPlantTile`) is a hand-rolled frosted overlay `<span>` because Badge's variant background can't currently be overridden for the on-photo frosted look — fold it into a Badge `overlay`/frosted variant then (pairs with the bloom-status colors below).
- [ ] Spacing-token migration for Button, Input, and Modal — fold into each component's redesign pass rather than a standalone sweep (mapping numeric padding onto the semantic scale is a design decision, and a standalone pass would be churned by the redesigns anyway).
- [ ] Redesign Toasts, Input fields, and Modal to the product's visual language.

**Publishing prep**

- [ ] Remove product/domain-specific naming from kit components, token comments, and Storybook demo copy.
- [ ] Prepare the package for external consumers (built output, Tailwind setup docs).
- [ ] Ship the Tailwind preset mapping to real tokens; sweep remaining hardcoded values in the app.

**Design**

- [ ] Final weather icon set — 7 concepts (Sunny, Partly Cloudy, Cloudy, Foggy, Rain, Snow, Thunderstorm). Night variants deferred.
- [ ] Empty-state placeholder illustration.
- [ ] General motion/transition pass across the UI.

**Done**

- [x] Extract `EmptyState` into `@paradoxui/ui` — the `next/link` coupling inverted via a `linkComponent` prop (defaults to `<a>`); app call sites pass Next's `Link`.
- [x] Extract `DrawerSection` into `@paradoxui/ui` — moved unchanged; the plant-detail sections import it from the kit.
- [x] Componentize the Sidebar — already a single `AppSidebar` (plus `MobileTabBar`); Avatar adoption stays tracked under the `Badge`/`Avatar` item above.
- [x] Fix small kit bugs — undefined `--color-neutral-*` references, fixed Modal element id, SSR-unsafe Tooltip ids (`Tooltip`/`Modal` now use `useId()`).
- [x] Extract `Drawer` into `@paradoxui/ui` — the kit owns the non-animated chrome (positioning, scroll lock, header/close); animation is injected via `panelComponent`/`panelProps`, so the kit carries no framer-motion dependency. `lib/drawer-motion.ts` is the app's single slide-in source of truth.
- [x] Card spacing migrated to semantic tokens (`px-card-padding py-row-gap`, value-identical to the old `px-6 py-4`).
- [x] Adopt `Badge`/`Avatar` at the hand-rolled sites — "Removed from garden" tag (kit `Badge` default variant), sidebar avatar (kit `Avatar`, new `xs` size, now consuming the `--avatar-fill` token). Bloom-status labels sentence-cased to match the filter chips.
- [x] Move bloom status to a frosted corner chip on the photo (top-right) — off the title, reads over any image. Implemented as a tokenized overlay `<span>` rather than the kit Badge (see the tailwind-merge follow-up above); colors are a placeholder pending the palette item.

---

## Database & Plant Data

- [x] ~~Re-seeding silently reverts editorial corrections — fix the upsert~~ — **done July 9, 2026.** Root cause: `upsert_trefle_plant`'s COALESCE/CASE direction let incoming Trefle data overwrite stored values wherever Trefle has data (round-3 re-seed reverted 49 of 62 editorial sun corrections; restored same day). Two structural fixes shipped: **(1)** `20260709210000_fill_only_trefle_upsert.sql` — on UPDATE the stored value now always wins, Trefle only fills gaps (applied to live DB and registered in migration history); **(2)** `seed-plants.ts` skips already-cataloged species by default (name + resolved-ID match, `--include-existing` to override), so routine runs only touch new entries. Verified: hostile upsert against a corrected row changed nothing; full default seed run made zero writes (145 skipped). Audit of collateral damage from the round-3 re-seed: sun was the only casualty (restored); hardiness corrections, bloom months, descriptions, and all AI-only fields intact; no duplicate species. Detail in `architecture.md` §9 (revision note).
- [ ] **New plants still under-report sun on first draft** — separate from the re-seed revert above. Brand-new round-3 plants drafted under the fixed curation prompt (Panicum virgatum, Jasminum nudiflorum, Cornus mas, Colchicum autumnale, Eranthis hyemalis, Zantedeschia) still came out narrow, so the prompt line alone isn't a reliable gate. No botanist on the team. Candidate fixes: widen where the stored sun set is a strict subset of the blind cross-check's, as a guarded reversible migration (team already ruled this direction is "directional, not noise", commit `eac884c`); or the deeper fix — model sun as primary ("best") + "tolerated" instead of one flat array so "thrives vs. tolerates" stops being conflated (schema + UI, post-test). Report: `apps/web/reports/cross-check-2026-07-09-15-49-19.json`.
- [ ] **Editorial review of the cross-check's remaining flags** — 7 `plant_type` classifications (subshrub/tuber/succulent edge cases: Thymus, Euphorbia characias, Cyclamen, Eranthis, Sedum spectabile, Rudbeckia hirta, Eschscholzia) and one hardiness value (Eranthis hyemalis max 9 vs. 7). Judgment calls, intentionally unapplied.
- [ ] `users` / `agent_sessions` tables — idle by design until authentication and the agent land.

**Done**

- [x] **Round 3 catalog expansion (July 2026)** — catalog to 152 plants, 377 companion pairs. Targeted the thin styles (lush 18→26, modern 18→22). Surfaced that Trefle name-search silently returns sibling species; 4 species that couldn't be name-seeded (ostrich fern, Karl Foerster grass, winter heath, bergenia) were re-added as manual rows and AI-curated. Added a `--new-only` flag to `curate-plants.ts` for targeted top-ups.
- [x] **Populate `plant_combinations`** via an AI pass — 311 companion pairs across the 125-plant catalog, capped at 5 per plant and deduped; verified rendering in the app.
- [x] **Sun under-reporting: 62 rows widened + forward fixes** — migration `20260709092512` widened 62 sun ranges; curation prompt and cross-check severity updated. NOTE: 49 were later clobbered by a re-seed and restored July 9 — see the open "re-seeding reverts sun" item above for the durable fix.
- [x] **Build the botanical cross-check** (`cross-check-plants.ts`) — a blind second-pass fact-checker over curated fields; flags only, never writes.
- [x] **Expand the plant catalog** — now 125 species, all curated with images and descriptions.
- [x] **Replayable migration** recording the direct-to-DB data corrections, guarded and idempotent.

_Accepted v1 gap: orphaned storage files are not cleaned up on delete._

---

## Features

- [ ] **Authentication & accounts** — sign-in, sessions, and per-user data. The app currently runs as a single-tenant development setup; this is the largest item and is scoped alongside onboarding.
- [ ] **Onboarding** — garden-profile wizard.
- [ ] **The Agent** — invisible in the wiring, summonable as a plant-scoped assistant (⌘K sidebar plus drawer chat entry points). Behavior finalized when agent design begins.
- [ ] **Garden Reflections** — pattern-level synthesis across the diary over time, not a chronological log.
- [ ] **Explore** — validate richer filters / condition-based personalization before building.
- [ ] **Content strategy** for the Garden Insight, Care Tips, and Growing-card status messages — define what each should communicate in its final form.

_Deferred by design: diary AI summaries (wait for the agent), repo split (wait for Paradox UI's first external consumer), night weather icons._

---

## UI Fixes

- [ ] Care Tips — rework the header count for the generic-fallback state.
- [ ] Diary — edit/delete a single note; refine the "removed from garden" treatment; reposition the clear-diary and add-note actions; add a top border above the notes list.
- [ ] Apply tooltips to all icon buttons.
- [ ] Search — recommended chips below the search field.
- [ ] Plant detail — polish small card backgrounds, swap the water icon, add an image placeholder for missing photos.
- [ ] Bloom Timeline — show a plant's name on hover.

**Done**

- [x] 404 page — on-brand `app/not-found.tsx` with a back-to-dashboard link.
- [x] My Plants card — thumbnail border radius 4px → 8px.

---

## Suggested sequencing

1. Extend `Button` and adopt it across the app — stops the kit/product drift and unblocks consistent UI work.
2. Bundle the Diary UI fixes.
3. Kit consistency, de-gardening, and packaging as Paradox UI rises in priority.
4. Authentication last, scoped alongside onboarding.
