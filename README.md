# upmods

[![npm](https://img.shields.io/npm/v/upmods)](https://www.npmjs.com/package/upmods)
[![CI](https://github.com/0png/upmods/actions/workflows/ci.yml/badge.svg)](https://github.com/0png/upmods/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

Safely maintain the mods in a Minecraft instance from one command:

```powershell
cd D:\Games\PrismLauncher\instances\MyPack
upmods
```

`upmods` discovers the real `mods` directory, detects Minecraft and loader metadata conservatively, checks Modrinth for compatible releases, audits the installed set, and applies confirmed updates through a verified backup transaction. It supports Fabric, Forge, NeoForge, and Quilt.

## Install

Requires [Node.js 20 or newer](https://nodejs.org/).

### PowerShell one-liner

Paste this into PowerShell:

```powershell
irm https://raw.githubusercontent.com/0png/upmods/master/install.ps1 | iex
```

From Command Prompt or `Win+R`:

```powershell
powershell -c "irm https://raw.githubusercontent.com/0png/upmods/master/install.ps1 | iex"
```

The hosted [installer script](install.ps1) checks Node.js 20+, installs the latest public npm release, handles actionable failures, and verifies the installed version.

Or install normally:

```powershell
npm install --global upmods@latest
```

Then enter either a Minecraft instance root or its `mods` directory and run `upmods`:

```powershell
cd 'D:\Games\PrismLauncher\instances\MyPack'
upmods
```

## What it does

- Finds common vanilla Minecraft, Prism Launcher, Modrinth App, and CurseForge instance layouts.
- Remembers each instance's Minecraft version, loader, update channel, ignored projects, and pinned versions.
- Identifies JARs through Modrinth SHA-1 lookup with a persistent local scan cache.
- Safely reads Fabric, Quilt, Forge, and NeoForge metadata when a hash has no Modrinth match.
- Audits duplicate files/projects, loader and Minecraft incompatibilities, dependencies, legacy JARs, unidentified files, and lockfile drift.
- Plans stable-only or beta-allowed updates with clear updated, skipped, pinned, ignored, and incompatible decisions.
- Verifies downloads with SHA-512/SHA-1, backs up replaced files, and applies updates transactionally.
- Supports cross-loader migration without modifying the source instance.
- Provides an English and Traditional Chinese Ink TUI plus JSON output and CI exit codes.

## Quick start

Interactive maintenance:

```powershell
upmods .
```

Preview an update without changing files:

```powershell
upmods update . --dry-run
```

Apply the reviewed plan with backup and checksum verification:

```powershell
upmods update . --yes
```

`upmods update` without `--yes` is preview-only. It never performs a non-interactive Apply implicitly.

## Commands

| Command | Purpose |
| --- | --- |
| `upmods [instance-dir]` | Open the interactive TUI |
| `upmods scan [instance-dir]` | Inventory and identify local JARs |
| `upmods check [instance-dir]` | Check for compatible updates |
| `upmods audit [instance-dir]` | Find health, compatibility, dependency, and drift problems |
| `upmods update [instance-dir] --dry-run` | Preview all policy decisions and safety blockers |
| `upmods update [instance-dir] --yes` | Download, verify, back up, and transactionally apply updates |
| `upmods lock [instance-dir]` | Write a portable `.upmods-lock.json` snapshot |
| `upmods verify [instance-dir]` | Compare the current mod set with its lockfile |
| `upmods rollback [instance-dir]` | Restore the latest applied backup session |
| `upmods config [instance-dir]` | Inspect or change persistent instance settings |

Run `upmods --help` for every option. Common automation examples:

```powershell
upmods scan . --json
upmods check . --json --fail-on-updates
upmods audit . --json --strict
upmods update . --dry-run --channel=allow-beta
upmods verify . --json
```

Exit code `2` means the requested CI condition needs attention, such as updates found with `--fail-on-updates`, strict audit errors, or lockfile drift. Cancellation exits with `130` (`143` for `SIGTERM`).

## Instance detection and settings

The path may be the exact `mods` directory or an instance root. If no path is supplied, the current directory is used. Detection deliberately refuses to guess when metadata conflicts or several possible mod directories exist; provide the exact directory or confirm the suggestion in the TUI.

Confirmed settings are stored atomically in `<instance-dir>/.upmods.json`:

```json
{
  "schemaVersion": 1,
  "minecraftVersion": "1.21.1",
  "loader": "fabric",
  "channel": "stable-only",
  "ignored": ["project-id-or-slug"],
  "pinned": {
    "project-id-or-slug": "version-id-or-version-number"
  }
}
```

Manage settings without editing JSON:

```powershell
upmods config .
upmods config . --mc-version=1.21.1 --loader=fabric --channel=stable-only
upmods config . --ignore=example-project --unignore=old-project
upmods config . --pin=sodium=mc1.21-0.6.13 --unpin=old-project
```

Project references accept a Modrinth project ID or slug. Pins accept an exact Modrinth version ID or version number and are resolved only within the configured Minecraft version and loader.

## Safety model

- Dry-run and TUI review use the same policy and projected dependency analysis as confirmed updates.
- Startup-breaking audit errors and incompatible update plans block download and Apply with an actionable explanation.
- Downloads are staged outside the live mod set and verified against Modrinth checksums.
- Apply revalidates a private same-filesystem snapshot before changing the backup manifest or installed files.
- A failed Apply automatically restores the original set; the latest successful session can also be rolled back manually.
- Ambiguous local metadata helps display and audit results but never authorizes an unrelated replacement download.
- Disabled JARs do not satisfy active dependencies.
- Apply and rollback become non-interruptible only after their transaction boundary, preventing half-written state.

Backups are stored under `<mods-dir>/.upmods-backup/`. Cross-loader output is written to `<mods-dir>/mods-updated/<loader>-<minecraft-version>/` and never overwrites an unmanaged directory.

## TUI keys

| Key | Action |
| --- | --- |
| `↑` / `↓` | Navigate or scroll |
| `Enter` | Confirm |
| `Space` | Toggle an update or optional dependency |
| `A` / `N` | Select all / clear selectable items |
| `O` | Open the highlighted Modrinth version page |
| `F` | Quick-check with saved or detected settings |
| `B` | Return to the previous safe step |
| `C` | Cancel current safe work and return to review |
| `X` | Rescan the instance |
| `T` | Retry after a scan error |
| `L` | Toggle language |
| `Q` | Quit |

## Limitations

- Loader migration builds a target mod directory; it does not install a loader or configure a launcher instance.
- Cross-project substitute mods are not selected automatically.
- Compatibility and dependency quality depend on Modrinth and embedded JAR metadata.
- Unknown local version-range syntaxes are treated conservatively rather than guessed.
- Unidentified or unavailable mods are reported and skipped.

## Development

```powershell
pnpm install
pnpm --filter upmods dev -- ./mods
pnpm test:integration
pnpm release:check
pnpm pack:cli
```

The monorepo keeps headless business logic in `packages/core` and Ink presentation, interaction, and command wiring in `packages/cli`. The integration suite builds the published CLI and exercises real launcher/JAR fixtures against a local fake Modrinth API, including failed verification, successful Apply, post-update checks, and rollback.

## License

MIT © 0png. See [LICENSE](LICENSE).
