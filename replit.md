# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── chalet-marketplace/ # Al-Qassim chalet rental marketplace (React + Vite)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Applications

### `artifacts/chalet-marketplace` — سوق الشاليهات - القصيم

Arabic-language vacation rental marketplace for chalets in Al-Qassim region, Saudi Arabia.

**Features:**
- Full RTL (right-to-left) Arabic interface
- Landing page with hero section and search filters (city, guests)
- Listings page with property cards and filter sidebar (city, guests, max price)
- Property detail page with photo gallery, amenities, and WhatsApp booking button
- Mobile-responsive design

**Pages:**
- `/` — Landing page with dynamic city search (from DB)
- `/chalets` — Listings page with filters
- `/chalets/:id` — Property detail page
- `/add-chalet` — Owner submission form (authenticated; dynamic cities + amenities from DB)
- `/dashboard` — Owner dashboard (authenticated)
- `/admin` — Admin CMS panel (authenticated + ADMIN_USER_ID check)

**Tech:** React 19 + Vite, Wouter, TanStack React Query, Tailwind CSS, Embla Carousel, Framer Motion

### `artifacts/api-server` — Express API Server

REST API serving chalet data.

**Endpoints:**
- `GET /api/healthz` — Health check
- `GET /api/chalets` — List chalets (filters: `location`, `maxGuests`, `maxPrice`)
- `GET /api/chalets/:id` — Single chalet detail
- `GET /api/cities` — Public city catalog (dynamic)
- `GET /api/amenities` — Public amenities catalog (dynamic)
- `GET /api/submissions` — Owner's own submissions (authenticated)
- `POST /api/submissions` — Submit new chalet (+ email notification)
- `GET /api/admin/submissions` — All submissions (admin)
- `PATCH /api/admin/submissions/:id/status` — Update status (admin)
- `DELETE /api/admin/submissions/:id` — Delete submission (admin)
- `GET /api/admin/owners` — List all owners (admin)
- CRUD `/api/admin/cities`, `/api/admin/districts`, `/api/admin/amenities` (admin)

**Admin Setup:**
- Set `ADMIN_USER_ID` env var to the Replit user ID of the admin
- Admin's Replit user ID can be found at `GET /api/auth/me` after login

**Email Notifications:**
- Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL` env vars
- Email sent automatically when new submission received

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /healthz`; `src/routes/chalets.ts` exposes `GET /chalets` and `GET /chalets/:id`
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.mjs`)

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/chalets.ts` — chalets table definition

**To seed the database:**
```bash
pnpm --filter @workspace/scripts run seed-chalets
```

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec.

### `scripts` (`@workspace/scripts`)

Utility scripts package.

- `seed-chalets` — Seeds 8 chalet listings into the database
