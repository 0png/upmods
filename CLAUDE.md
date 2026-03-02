# Upmods Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-02

## Active Technologies

- TypeScript 5+ on Node.js 20+ (ESM, `"type": "module"` throughout) (001-upmods-mvp)

## Project Structure

```text
packages/core/   # @upmods/core — headless logic (scanner, Modrinth API, downloader)
packages/cli/    # @upmods/cli — Ink TUI only (no logic)
```

## Commands

```bash
pnpm install                          # install all packages
pnpm --filter @upmods/core build      # build core (required before cli typecheck)
pnpm --filter @upmods/cli dev         # run CLI via tsx (no build)
pnpm -r test                          # run Vitest (core only)
pnpm -r typecheck                     # TypeScript check all packages
pnpm -r lint                          # ESLint all packages
```

## Code Style

TypeScript 5+ on Node.js 20+ (ESM, `"type": "module"` throughout): Follow standard conventions

## Recent Changes

- 001-upmods-mvp: Added TypeScript 5+ on Node.js 20+ (ESM, `"type": "module"` throughout)

<!-- MANUAL ADDITIONS START -->

## Project Overview

upmods — Minecraft mods auto-updater CLI. Identifies mods via SHA-1 → Modrinth v2 API. CLI-as-GUI TUI aesthetic.

## Implementation Status

**Branch**: `001-upmods-mvp`
**Spec**: `specs/001-upmods-mvp/tasks.md`

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1 — Setup (Monorepo Scaffold) | T001–T006 | ✅ DONE |
| Phase 2 — Foundational (types, events, i18n, state machine, CLI shell) | T007–T016 | ⬜ NEXT → start at T007 |
| Phase 3 — US1: Scan & Identify | T017–T025 | ⬜ pending |
| Phase 4 — US2: Version Select & Update Check | T026–T034 | ⬜ pending |
| Phase 5 — US3: Download Updates | T035–T041 | ⬜ pending |
| Phase 6 — US4: Language Toggle | T042–T046 | ⬜ pending |
| Phase 7 — Polish | T047–T052 | ⬜ pending |

## Architecture Rules (from constitution)

- ALL logic in `packages/core`. NO logic in `packages/cli` Ink components.
- `packages/core` must expose events via `EventEmitter` (typed with `typed-emitter`).
- Build order: static TUI shell → state machine → core integration (never reverse).
- Vitest unit tests required for all pure functions in `packages/core` before Done.
- ALL paths via `node:path`. Never string-concatenate paths.
- Never call `process.exit()` in Ink components — use `useApp().exit()`.

## TypeScript Config

- `moduleResolution: NodeNext` + `module: NodeNext`
- Local imports require `.js` extension (e.g., `import foo from './foo.js'`)
- `verbatimModuleSyntax: true` — use `import type` for type-only imports

## ESLint Config

- **Format**: ESLint 9 **flat config** — `eslint.config.js` at repo root (NOT `.eslintrc.json`)
- Uses `typescript-eslint` v8 unified package + `@eslint/js`
- Root `package.json` has `"type": "module"` so `eslint.config.js` uses ESM imports
- `pnpm.onlyBuiltDependencies: ["esbuild"]` set in root `package.json` (pnpm v10 security)

## Modrinth API (key endpoints)

- `POST /v2/version_files` — identify mods by SHA-1 hash (batch)
- `POST /v2/version_files/update` — get latest version per hash + game_version (batch)
- `GET /v2/tag/game_version` — list all MC versions (filter to `version_type: release`)
- Required header: `User-Agent: upmods/0.1.0 (https://github.com/user/upmods)`
- Rate limit: 300 req/min; use `p-limit(5)` for concurrent calls

## Installed Versions (from pnpm-lock.yaml)

- Node.js 22.11.0, pnpm 10.28.0
- TypeScript 5.8.x, ESLint 9.21.x, typescript-eslint 8.26.x
- Vitest 3.0.x, tsx 4.19.x
- ink 5.x, react 18.x, i18next 24.x
- undici 6.x, p-limit 6.x, fs-extra 11.x, typed-emitter 2.x

<!-- MANUAL ADDITIONS END -->
