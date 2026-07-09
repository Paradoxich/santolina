# Santolina — Claude Code Context

## What this project is

Santolina is a garden planning and management web app that helps beginner gardeners design beautiful gardens. Users describe their garden conditions and style preference, and get a curated, visual plant palette with seasonal guidance.

The project also extracts an open source UI framework called Paradox UI (`@paradoxui`) from the product as it is built.

---

## Monorepo structure

```
/apps
  /web                  ← Santolina Next.js app
/packages
  /tokens               ← @paradoxui/tokens (pure CSS, no framework dependency)
  /ui                   ← @paradoxui/ui (React component library)
  /typescript-config    ← shared TypeScript configs
  /eslint-config        ← shared ESLint configs
```

**Tooling:** Turborepo + pnpm workspaces. Node 20 LTS.

---

## The single most important rule

Before placing any component, ask: **does this component know anything about gardens?**

- **No** → it belongs in `/packages/ui` — use generic props, no domain knowledge
- **Yes** → it belongs in `/apps/web/components` — built using `/packages/ui` primitives

This discipline is non-negotiable. It keeps the framework extractable.

Full UI-building guidance — tokens, typography, styling patterns, component requirements, and the Figma-to-code workflow — is in `DESIGN_SYSTEM.md` at the repo root. Read it before writing any visual code.

---

## Package details

### `@paradoxui/tokens` — `/packages/tokens`

- Pure CSS custom properties in `index.css`
- Zero dependencies — no React, no Tailwind
- Consumed by `/packages/ui` and `/apps/web` via Tailwind config
- Values are placeholders until real design tokens arrive from Figma

### `@paradoxui/ui` — `/packages/ui`

- React 19 + TypeScript + Tailwind CSS
- All components reference token values via CSS custom properties — never hardcoded values
- Storybook for development and documentation
- Every component needs: typed props interface, accessibility (ARIA, keyboard nav, focus states), at least one Storybook story

### Santolina app — `/apps/web`

- Next.js 15, App Router, TypeScript, Tailwind CSS v3
- Framer Motion for animations
- Zustand — installed but not yet used; reserved for future shared client state (see Code conventions)
- Supabase for database, auth, storage
- Vercel AI SDK for agent layer
- Deployed on Vercel

---

## App folder structure

```
/apps/web
  /app              ← Next.js app router pages
  /components       ← product components (domain-specific, Layer 3)
  /lib              ← utilities, helpers, constants
  /hooks            ← custom React hooks
  /styles           ← global styles, Tailwind config
  /types            ← TypeScript type definitions
  /server           ← server actions and API route handlers
  /scripts          ← data scripts (seed, curate, cross-check, combinations) — run via tsx, see docs/architecture.md §7
```

No `/store` yet — the app holds no global client state (see Code conventions). A `/store` directory arrives only if Zustand is adopted. `/reports` may appear at runtime for cross-check output; it is gitignored, not source.

---

## Database — Supabase

Seven tables. All IDs are UUIDs. Row-level security required on all user-owned tables.

- `users` — extends Supabase auth.users
- `gardens` — garden profile (location, space type, sun, style, size). One per user in v1.
- `plants` — shared plant catalog cached from the Trefle API, enriched by an AI curation pass. Public read, service role write.
- `palette_plants` — join table between gardens and plants. User's palette. Includes status (planned/planted) and source (generated/manual/existing). The status check constraint also permits a legacy `considering`, but the product no longer uses it — the app only moves plants between planned and planted (see `docs/architecture.md` §12).
- `plant_combinations` — which plants work well together. Public read, service role write. Populated by `apps/web/scripts/curate-combinations.ts` (see `docs/architecture.md` §19).
- `agent_sessions` — rolling agent context summary per garden.
- `diary_entries` — user's dated notes and photos per plant. Keyed by garden + plant (not the palette row), so a plant's history survives being removed from the palette. User-owned (RLS on garden ownership); photos live in the public `diary-photos` storage bucket. See `docs/architecture.md` §18.

Full schema is documented in Notion. Data-layer decisions (provider choice, curation flow, safe upsert strategy) are recorded in `docs/architecture.md`. Never store passwords — Supabase auth handles that.

---

## External APIs

- **Open-Meteo** — weather and climate data. Free, no API key. City-level resolution. Used to derive climate zone, hardiness zone, frost dates, seasonal data from user's city input.
- **Trefle API** — plant species data (`TREFLE_API_KEY`). Plants are cached in the `plants` table; Trefle populates botanical facts only. Replaced Perenual, whose free tier returned paywalled nulls — see `docs/architecture.md` §1.
- **Anthropic API** — powers three offline data scripts (`ANTHROPIC_API_KEY`, model `claude-sonnet-4-5`), all under `apps/web/scripts/`, none in the request path:
  - `curate-plants.ts` — fills gaps Trefle can't (care instructions, style tags, seasonal rhythm). Never overwrites existing data.
  - `curate-combinations.ts` — populates `plant_combinations` with companion pairings (see `docs/architecture.md` §19).
  - `cross-check-plants.ts` — blind second pass that fact-checks botanical fields and flags disagreements; never writes to the DB (see `docs/architecture.md` §20).
- **Vercel AI SDK** — agent layer. Streaming responses. Model TBD (Claude or GPT-4o). Key in environment variables.

---

## Environment variables

See `.env.example` at root of `/apps/web`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
TREFLE_API_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_APP_URL=
```

Never commit `.env.local`. Never expose service role key to the client.

---

## Key product decisions

- **Web first** — desktop optimised, mobile responsive. No native mobile app in v1.
- **Ornamental-first, not ornamental-only** — the vision is "a small home garden I want to be beautiful," not farm management. Herbs and a few edibles are welcome; dedicated edible-growing features are a later phase.
- **Progressive onboarding** — 5 steps (location, space type, sun, style, size). No forced completion. Value shown immediately. _Deferred post-test — see scope below._
- **No account creation during onboarding** — prompted when user first tries to save. _Deferred post-test along with onboarding._
- **Logging is in scope for the test version** — the Diary is the baseline "memory" of a user's plants. Still never required, never pushed.
- **Agent = invisible wiring + summonable sidekick** — it quietly powers seasonal logic, memory, and recommendations, and never pops up uninvited. But it does have a visible entry point (sidebar "Agent ⌘K" button; chat icons in the plant/diary drawers open plant-scoped conversations) and, once built, can take or surface actions you discuss with it (e.g. add a plant to Planned). Exact chat behavior is not fully decided. _Deferred post-test — see scope below._
- **Profile changes never override palette** — system suggests, user decides.

---

## Scope — phased rollout

Scope changed during design from the original five-feature plan. Current phase is a test version that validates the core garden-tracking loop before investing in onboarding and the agent layer.

**Test version (current phase):**

1. Dashboard
2. Plant Library / Explore
3. My Garden / Palette (growing + planned)
4. Diary

**Deferred to post-test (expected a few weeks out):**

- Garden Profile / onboarding (5-step wizard)
- The Agent

Everything else is deferred. Do not build edible growing or multiple gardens in this phase.

---

## Code conventions

- TypeScript strict mode everywhere
- No hardcoded color, spacing, or typography values — always use tokens via CSS custom properties or Tailwind config
- Server components by default in Next.js — client components only when interactivity requires it
- Server actions for data mutations — no API routes unless necessary
- Client state: local component state plus server actions with `router.refresh()` to re-pull server data — no Redux. Zustand is installed but not yet used; adopt it only when genuinely shared client state appears (most likely the Agent), and add `/store` then. Context is fine for UI infrastructure (e.g. the toast provider in `@paradoxui/ui`), just not as a global app-state store.
- Prettier: no semi, single quotes, tab width 2, trailing commas es5, print width 80

---

## What NOT to build yet

- Changesets — added before first npm publish
- Chromatic — added once enough components exist
- Playwright — added for critical flows later
- Supabase realtime — not needed in v1
- Multiple gardens per user — schema supports it, app enforces one in v1

---

## Project links

- Product: santolina.app
- Framework: paradoxui.com
- npm: @paradoxui/tokens, @paradoxui/ui
- GitHub: santolina (app), paradoxui (framework)
- Backlog / roadmap: the Notion **Build Backlog** is the single source of truth (there is no in-repo backlog). Design/architecture rationale still lives in `docs/architecture.md`.
