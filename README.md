# Santolina

A garden planning and management app for people who want a beautiful, well-considered outdoor space. Built as a monorepo alongside Paradox UI, an open source design system extracted from the product as it's built.

## Overview

Santolina helps beginner to intermediate gardeners design and manage ornamental gardens. Users describe their conditions and style preferences and get a curated plant palette with seasonal guidance.

The monorepo contains the Next.js web app and the Paradox UI packages (@paradoxui/ui, @paradoxui/tokens), kept deliberately separate so the design system stays extractable.

## Monorepo Structure

```
santolina/
├── apps/
│   └── web/                  # Next.js plant app (santolina-web)
├── packages/
│   ├── tokens/               # @paradoxui/tokens — pure CSS design tokens
│   ├── ui/                   # @paradoxui/ui — React component library
│   ├── typescript-config/    # @paradoxui/typescript-config — shared TS configs
│   └── eslint-config/        # @paradoxui/eslint-config — shared ESLint configs
├── turbo.json                # Turborepo pipeline config
├── pnpm-workspace.yaml       # pnpm workspace config
└── package.json              # Root package.json
```

## Tech Stack

- **Package manager**: pnpm with workspaces
- **Monorepo orchestration**: Turborepo
- **Node version**: 20 LTS
- **App**: Next.js 15, TypeScript, Tailwind CSS, Framer Motion, Zustand, Supabase, Vercel AI SDK
- **UI library**: React 19, TypeScript, Tailwind CSS, Storybook 8
- **Tokens**: Pure CSS custom properties

## Setup

### Prerequisites

- Node.js 20 LTS (`nvm use`)
- pnpm 9 (`npm install -g pnpm@9`)

### Install

```bash
# Install all dependencies
pnpm install

# Copy environment variables (only if .env.local doesn't exist yet)
cp -n apps/web/.env.example apps/web/.env.local
# Fill in your values in .env.local
#
# Warning: `cp` without -n overwrites an existing .env.local and wipes your keys.
# To back up first: cp apps/web/.env.local apps/web/.env.local.bak
```

### Development

```bash
# Run everything in dev mode (Next.js + Storybook)
pnpm dev

# Run only the web app
pnpm --filter santolina-web dev

# Run only Storybook
pnpm --filter @paradoxui/ui storybook
```

### Build

```bash
pnpm build
```

### Lint & Format

```bash
pnpm lint
pnpm format
```

### Type Check

```bash
pnpm typecheck
```

### Test

```bash
pnpm test
```

### Plant data layer

The `plants` table is seeded from Trefle and then filled in by an AI curation
pass. Both scripts require the relevant keys in `apps/web/.env.local`
(`TREFLE_API_KEY`, `ANTHROPIC_API_KEY`):

```bash
cd apps/web

# Seed from Trefle
./node_modules/.bin/tsx --env-file=.env.local scripts/seed-plants.ts

# AI curation pass — fills gaps Trefle can't
./node_modules/.bin/tsx --env-file=.env.local scripts/curate-plants.ts
```

See `docs/architecture.md` for the data-layer decisions behind this (provider
choice, curation strategy, safe upsert function).

## Further reading

- [`docs/architecture.md`](docs/architecture.md) — data-layer architecture decisions
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — how to build UI in this repo (tokens, components, styling patterns)

## License

All rights reserved — see [`LICENSE`](LICENSE). See [`LICENSE_NOTES.md`](LICENSE_NOTES.md) for how this applies across the monorepo's two products.
