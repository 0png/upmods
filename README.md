# upmods

[![CI](https://github.com/0png/upmods/actions/workflows/ci.yml/badge.svg)](https://github.com/0png/upmods/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-orange)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Minecraft mods auto-updater — a full-screen terminal app that scans your mods folder, identifies every mod via [Modrinth](https://modrinth.com), and downloads the latest versions for any Minecraft release.**

```
╔══════════════════════════════════════════════════════════════════╗
║  █  █ █▀█ █▄ ▄█ █▀█ █▀▄ █▀▀                                     ║
║  █  █ █▀▀ █ ▀ █ █ █ █ █ ▀▀▄                                     ║
║  █▄▄█ █   █   █ █▄█ █▄▀ ▄▄█                                     ║
║                                                                  ║
║  Minecraft Mod Updater                           v0.1.0          ║
╚══════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────┐
  │ #   Name                       Version      Status          │
  │ ─────────────────────────────────────────────────────────── │
  │ 1   AppleSkin                  3.0.4        UPDATING        │
  │ 2   JEI                        19.21.0.247  UP TO DATE      │
  │ 3   Sodium                     0.6.12       UPDATING        │
  │ 4   Iris Shaders               1.8.7        IDENTIFIED      │
  └─────────────────────────────────────────────────────────────┘

  Step 3 / 5  Checking for updates...
```

---

## Features

- **Automatic mod identification** — hashes every `.jar` file via SHA-1 and matches it against the Modrinth database in a single batch request
- **Target version selection** — choose any Minecraft release and get the best available update for that version
- **Selective updates** — multi-select which mods to update with Space/Enter; skip anything you want to keep pinned
- **Smart migration** — mods that are already compatible with your target version are moved directly, without re-downloading
- **SHA-512 integrity validation** — every download is verified against Modrinth's published checksum before it replaces your file
- **Full-screen TUI** — virtual-scrolling tables, a 5-step progress footer, row numbers, and centered layout that adapts to your terminal size
- **Language toggle** — press `L` at any time to switch the UI language
- **Zero destructive writes** — originals are never modified; updates are staged and only committed on success

---

## Requirements

| Dependency | Minimum version |
|---|---|
| [Node.js](https://nodejs.org) | 20.x |
| [pnpm](https://pnpm.io) | 9.x |

No Modrinth account or API key is required. The public API is used with a well-formed `User-Agent` header as required by Modrinth's usage policy.

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/0png/upmods.git
cd upmods

# 2. Install dependencies
pnpm install

# 3. Build the core package
pnpm --filter @upmods/core build

# 4. Run against your mods folder
pnpm --filter @upmods/cli dev /path/to/your/mods
```

On **Windows**, wrap paths with spaces in the `UPMODS_DIR` environment variable:

```powershell
$env:UPMODS_DIR = "C:\Users\you\AppData\Roaming\.minecraft\mods"
pnpm --filter @upmods/cli dev
```

---

## Usage

### Keyboard controls

| Key | Action |
|---|---|
| `↑` / `↓` | Navigate list (circular scroll) |
| `Space` | Toggle mod selection |
| `Enter` | Confirm / proceed |
| `L` | Toggle UI language |
| `Q` | Quit |

### Workflow

```
Scan → Identify → Select MC version → Review updates → Download / Migrate → Summary
```

1. **Scan** — upmods walks your mods directory and computes a SHA-1 hash for every `.jar` file.
2. **Identify** — hashes are sent to `POST /v2/version_files` (Modrinth batch API). Unrecognised files are flagged and skipped.
3. **Select version** — pick the Minecraft release you want to update to from a live list fetched from Modrinth.
4. **Review** — a table shows every identified mod alongside its current version, the best available version for your chosen MC release, and an `UPDATING` / `UP TO DATE` status.
5. **Select mods** — deselect anything you don't want touched.
6. **Download / Migrate** — updates are downloaded with progress indicators, verified with SHA-512, and placed in `./mods-updated/`. Mods that are already compatible are migrated in place.
7. **Summary** — counts of successes, failures, and skipped mods.

---

## Architecture

upmods is a pnpm monorepo with a strict separation between logic and presentation:

```
packages/
├── core/     # @upmods/core  — headless business logic
│   ├── scanner.ts      SHA-1 hashing & directory scan
│   ├── modrinth.ts     Modrinth v2 HTTP client (undici + p-limit)
│   ├── updater.ts      Update resolution per target MC version
│   ├── downloader.ts   File download + SHA-512 integrity check
│   ├── migrator.ts     Compatible-mod migration
│   ├── sanitizer.ts    Version-string normalisation
│   ├── events.ts       Typed EventEmitter for all async phases
│   └── types.ts        Shared domain types
│
└── cli/      # @upmods/cli   — Ink TUI, no business logic
    ├── app.tsx         Phase orchestration (useReducer state machine)
    ├── components/     One component per phase + shared widgets
    ├── state/
    │   └── reducer.ts  Redux-style action/state reducer
    └── i18n/           Language context + translation strings
```

### Design principles

- **All logic lives in `@upmods/core`.** CLI components receive data and fire callbacks — nothing more.
- **Events over callbacks** — `UpmodsCore` extends `TypedEmitter` and emits granular progress events (`scan:progress`, `identify:complete`, `download:progress`, …) so any consumer (Ink, future GUI, tests) can subscribe.
- **No bundler** — TypeScript compiles directly to ESM; the CLI runs via `tsx` in development.
- **Paths via `node:path` only** — string concatenation of filesystem paths is forbidden.

---

## Development

```bash
# Install all packages
pnpm install

# Build core (required before typecheck/lint on CLI)
pnpm --filter @upmods/core build

# Run the CLI against the test-mods fixture
pnpm --filter @upmods/cli dev test-mods/

# Run unit tests (core only)
pnpm -r test

# TypeScript type-check all packages
pnpm -r typecheck

# Lint all packages
pnpm -r lint
```

### Project conventions

- **ESM throughout** — `"type": "module"` in every `package.json`; local imports must use the `.js` extension.
- **`import type`** — use `import type` for type-only imports (`verbatimModuleSyntax: true`).
- **`moduleResolution: NodeNext`** — required for correct ESM resolution with Node.js.
- **Vitest** — unit tests live alongside source files as `*.test.ts`; all pure functions in `core` must be covered before a feature is considered done.
- **Flat ESLint config** — `eslint.config.js` at the repo root uses ESLint 9 flat config with `typescript-eslint` v8.

### CI

GitHub Actions runs on every push to `master` and all feature branches:

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter @upmods/core build`
3. `pnpm -r typecheck`
4. `pnpm -r lint`
5. `pnpm -r test`

---

## Modrinth API

upmods uses the [Modrinth v2 API](https://docs.modrinth.com) exclusively. No authentication is required.

| Endpoint | Purpose |
|---|---|
| `POST /v2/version_files` | Batch-identify mods by SHA-1 hash |
| `POST /v2/version_files/update` | Fetch latest version per hash + game version |
| `GET /v2/tag/game_version` | List all Minecraft releases |

All requests include `User-Agent: upmods/0.1.0 (https://github.com/0png/upmods)` as required by Modrinth's usage policy. Concurrency is capped at 5 simultaneous requests via `p-limit`.

---

## License

MIT — see [LICENSE](LICENSE) for details.
