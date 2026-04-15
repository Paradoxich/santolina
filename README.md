# Santolina

A modern plant care application built as a monorepo with a shared design system.

## Overview

Santolina is a full-stack monorepo containing a Next.js plant app and a shared React component library (`@paradoxui/ui`) backed by a CSS design token system (`@paradoxui/tokens`).

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

# Copy environment variables
cp apps/web/.env.example apps/web/.env.local
# Fill in your values in .env.local
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
