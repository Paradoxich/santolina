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
- Zustand for client-side state
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
  /store            ← Zustand stores
  /styles           ← global styles, Tailwind config
  /types            ← TypeScript type definitions
  /server           ← server actions and API route handlers
```

---

## Database — Supabase

Six tables. All IDs are UUIDs. Row-level security required on all user-owned tables.

- `users` — extends Supabase auth.users
- `gardens` — garden profile (location, space type, sun, style, size). One per user in v1.
- `plants` — shared plant catalog cached from Perenual API. Public read, service role write.
- `palette_plants` — join table between gardens and plants. User's palette. Includes status (planned/planted/considering) and source (generated/manual/existing).
- `plant_combinations` — which plants work well together. Public read, service role write.
- `agent_sessions` — rolling agent context summary per garden.

Full schema is documented in Notion. Never store passwords — Supabase auth handles that.

---

## External APIs

- **Open-Meteo** — weather and climate data. Free, no API key. City-level resolution. Used to derive climate zone, hardiness zone, frost dates, seasonal data from user's city input.
- **Perenual API** — plant catalog. Key in environment variables. Plants are cached in the `plants` table — Perenual is the source of truth, local table is a cache.
- **Vercel AI SDK** — agent layer. Streaming responses. Model TBD (Claude or GPT-4o). Key in environment variables.

---

## Environment variables

See `.env.example` at root of `/apps/web`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
NEXT_PUBLIC_APP_URL=
```

Never commit `.env.local`. Never expose service role key to the client.

---

## Key product decisions

- **Web first** — desktop optimised, mobile responsive. No native mobile app in v1.
- **Ornamental gardening only** — edible growing is a later phase.
- **Progressive onboarding** — 5 steps (location, space type, sun, style, size). No forced completion. Value shown immediately.
- **No account creation during onboarding** — prompted when user first tries to save.
- **Logging is optional** — never required, never pushed.
- **Agent is invisible infrastructure** — no personality, no name, no popups. It makes everything smarter quietly.
- **Profile changes never override palette** — system suggests, user decides.

---

## V1 scope — five features only

1. Garden Profile
2. Plant Library
3. My Garden / Palette
4. Seasonal View
5. The Agent

Everything else is deferred. Do not build logging, diagnostics, edible growing, or multiple gardens in v1.

---

## Code conventions

- TypeScript strict mode everywhere
- No hardcoded color, spacing, or typography values — always use tokens via CSS custom properties or Tailwind config
- Server components by default in Next.js — client components only when interactivity requires it
- Server actions for data mutations — no API routes unless necessary
- Zustand for client state — no Redux, no Context for global state
- Prettier: no semi, single quotes, tab width 2, trailing commas es5, print width 80

---

## What NOT to build yet

- Changesets — added before first npm publish
- Chromatic — added once enough components exist
- Playwright — added for critical flows later
- Real design tokens — placeholders only until Figma design is complete
- Supabase realtime — not needed in v1
- Multiple gardens per user — schema supports it, app enforces one in v1

---

## Project links

- Product: santolina.app
- Framework: paradoxui.com
- npm: @paradoxui/tokens, @paradoxui/ui
- GitHub: santolina (app), paradoxui (framework)
