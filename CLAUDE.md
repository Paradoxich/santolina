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

**Tooling:** Turborepo + pnpm workspaces. Node 22 LTS (pinned in `.nvmrc`).

Node 22 is a requirement, not a preference: `@supabase/supabase-js` builds its
realtime client against a native `WebSocket`, which arrives in Node 22, so on
Node 20 every script under `apps/web/scripts/` throws at client construction
before it reaches a query. `.nvmrc` said 20 until 2026-07-28 and nothing caught
it, because local machines were already on 22.

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
  /scripts          ← data scripts (seed, curate, cross-check, combinations) — run via tsx, see [the round runbook](docs/architecture.md#round-runbook)
  /rounds           ← per-round provenance, committed (manifests, reports, catalog archives)
  /reference        ← committed lookup caches the guards read
```

No `/store` yet — the app holds no global client state (see Code conventions). A `/store` directory arrives only if Zustand is adopted. `/reports` may appear at runtime for cross-check output; it is gitignored, not source.

---

## Database — Supabase

> **Before touching the catalog, read `docs/database-log.md`. Append an entry when you are done.**
>
> It is the operational record of what has been done to the database and, more importantly, the list of traps that have already cost someone time, money, or nearly cost data — silent rate-limit fallbacks, flags that don't scope the way their docs claim, pipeline steps that quietly never ran. Several were live for multiple rounds before anyone noticed. Do not rediscover them.
>
> `scripts/log-db-session.ts --round <label>` writes the factual half of an entry for you.

Seven tables. All IDs are UUIDs. Row-level security required on all user-owned tables.

- `users` — extends Supabase auth.users; created (with an empty garden) by the `handle_new_user` trigger on signup
- `gardens` — garden profile (location + lat/lon, space type, sun, style, size). One per user in v1; only location is populated until the onboarding wizard ships.
- `plants` — shared plant catalog cached from the Trefle API, enriched by an AI curation pass. Public read, service role write.
- `palette_plants` — join table between gardens and plants. User's palette. Includes status (planned/planted) and source (generated/manual/existing). The app only moves plants between planned and planted; a legacy `considering` status was dropped from the check constraint July 2026 (see [the palette write path](docs/architecture.md#palette-write-path)).
- `plant_combinations` — which plants work well together. Public read, service role write. Populated by `apps/web/scripts/curate-combinations.ts` (see [plant combinations](docs/architecture.md#plant-combinations)).
- `agent_sessions` — rolling agent context summary per garden.
- `diary_entries` — user's dated notes and photos. Keyed by garden + plant (not the palette row), so a plant's history survives being removed from the palette; `plant_id` is nullable and a null means a garden-level entry (weather, first frost). User-owned (RLS on garden ownership); photos live in the private `diary-photos` storage bucket (garden-ownership policies, signed-URL reads). See [diary identity](docs/architecture.md#diary-identity) and [private diary photos](docs/architecture.md#diary-photos-private).

Full schema is documented in Notion. Data-layer decisions (provider choice, curation flow, safe upsert strategy) are recorded in `docs/architecture.md`. Never store passwords — Supabase auth handles that.

---

## External APIs

- **Open-Meteo** — weather data. Free, no API key. City-level resolution. Used today for two things only: geocoding the location picker (`/welcome`, dashboard modal) and the dashboard's 7-day forecast. Climate zone / frost-date derivation from location is a future idea, not built; hardiness is modelled via editorial RHS ratings instead ([hardiness](docs/architecture.md#hardiness), currently parked).
- **Trefle API** — plant species data (`TREFLE_API_KEY`). Plants are cached in the `plants` table; Trefle populates botanical facts only. Replaced Perenual, whose free tier returned paywalled nulls — see [the Trefle-over-Perenual choice](docs/architecture.md#plant-data-provider).
- **Anthropic API** — powers a growing set of offline data scripts (`ANTHROPIC_API_KEY`; `CURATION_MODEL` = `claude-sonnet-4-5` for text, `VISION_MODEL` = `claude-sonnet-5` for the hero-image pass — see `lib/anthropic-client.ts`), all under `apps/web/scripts/`, none in the request path. Full current list and run order: [the round runbook](docs/architecture.md#round-runbook). Representative examples:
  - `curate-plants.ts` — fills gaps Trefle can't (care instructions, style tags, seasonal rhythm). Never overwrites existing data.
  - `curate-combinations.ts` — populates `plant_combinations` with companion pairings (see [plant combinations](docs/architecture.md#plant-combinations)).
  - `cross-check-plants.ts` — blind second pass that fact-checks botanical fields and flags disagreements; never edits catalog data (writes only its own `botanical_checked_at` stamp — see [the botanical cross-check](docs/architecture.md#botanical-cross-check)).
  - `curate-seasonal-care.ts` / `cross-check-seasonal-care.ts` — distills and blind-checks the Care Tips `seasonal_care` field (see [seasonal_care](docs/architecture.md#seasonal-care)).
- **Vercel AI SDK** — reserved for the deferred agent layer. The `ai` and `openai` packages are installed but nothing imports them yet; model choice is decided when the Agent is built.

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
CRON_SECRET=
```

Never commit `.env.local`. Never expose service role key to the client.

---

## Key product decisions

- **Web first** — desktop optimised, mobile responsive. No native mobile app in v1.
- **Ornamental-first, not ornamental-only** — the vision is "a small home garden I want to be beautiful," not farm management. Herbs and a few edibles are welcome; dedicated edible-growing features are a later phase.
- **Accounts gate the whole app, with a demo way in** — magic link (default) + Google OAuth, no passwords anywhere, plus an anonymous "look around" demo (`POST /auth/demo`) that seeds a temporary garden and converts in place to a real account. Demo-ness is `auth.users.is_anonymous` and nothing else; unconverted accounts are purged by cron after 7 days. Middleware redirects unauthenticated requests to `/login`; only the landing page, `/login`, `/auth/*` and `/design-system` stay public. A garden is auto-created on signup by trigger, never "set up." See [Accounts](docs/architecture.md#auth).
- **Onboarding wizard deferred, location step is not** — the 5-step wizard (space type, sun, style, size) stays post-test, but location is collected in a required first-run step (`/welcome`, gated on null garden location) because the entire climate layer depends on it. The one deliberate exception to never-forced inputs ([the auth cutover](docs/architecture.md#auth)).
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
5. Auth + account settings — pulled forward from post-test in July 2026 (magic link + Google, full-app gate, required location step; see [the auth cutover](docs/architecture.md#auth))

**Deferred to post-test (expected a few weeks out):**

- Garden Profile / onboarding wizard (space type, sun, style, size — auth and the location step already shipped, see above)
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
