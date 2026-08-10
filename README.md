# upmods

[![CI](https://github.com/0png/upmods/actions/workflows/ci.yml/badge.svg)](https://github.com/0png/upmods/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`upmods` is a terminal UI for updating Minecraft mods through Modrinth and migrating a mod set between Fabric, Forge, NeoForge, Quilt, and other supported loaders.

## Features

- Identify local `.jar` files by SHA-1 through the Modrinth v2 API.
- Resolve common native Minecraft, Prism Launcher, Modrinth App, and CurseForge instance layouts.
- Remember per-instance Minecraft version, loader, release channel, ignore rules, and pins.
- Safely inspect Fabric, Quilt, Forge, and NeoForge metadata when SHA-1 lookup has no match.
- Reuse a safe local hash cache for fast repeat scans.
- Select a target Minecraft release and mod loader.
- Run inventory and update checks non-interactively with JSON/CI support.
- Lock and verify reproducible mod sets with portable drift detection.
- Audit duplicate, incompatible, missing-dependency, legacy, unidentified, and lockfile-drift problems.
- Preview policy-aware updates, then apply them transactionally only with explicit confirmation.
- Review and selectively download ordinary updates.
- Build a separate, complete target-loader mod set without modifying the source instance.
- Resolve required and optional Modrinth dependencies recursively.
- Apply ordinary updates with per-session backups and roll back the latest applied session.
- English and Traditional Chinese TUI.

## Install

Node.js 20 or newer is required.

```bash
npm install --global upmods
```

You can also install a release tarball directly:

```bash
npm install --global ./upmods-0.2.0.tgz
```

## Usage

```bash
upmods [instance-dir]
upmods scan [instance-dir] [--json] [--no-cache]
upmods check [instance-dir] [--mc-version=<version>] [--loader=<loader>] [--json]
upmods audit [instance-dir] [--json] [--strict]
upmods update [instance-dir] [--dry-run | --yes]
upmods lock [instance-dir] [--json] [--no-cache]
upmods verify [instance-dir] [--json] [--no-cache]
upmods rollback [instance-dir]
upmods config [instance-dir] [settings options]
upmods --help
```

If no directory is supplied, upmods uses the current working directory. The directory may be an exact `mods` directory or an instance root. Detection is conservative: when launcher metadata conflicts or is missing, pass `--mc-version` and `--loader` or confirm the suggestions in the TUI. If a root contains more than one possible mods directory, upmods refuses to guess and asks for the exact directory.

`upmods scan` provides a fast, non-interactive inventory for scripts and CI. SHA-1 values are cached under `<mods-dir>/.upmods-cache/` and reused while a JAR's name, size, and modification time remain unchanged. Pass `--no-cache` to force a clean hash pass, or `--json` for machine-readable output.

`upmods check` runs the update check without opening the TUI. It uses saved or detected settings, while `--mc-version=1.21.1` and `--loader=fabric` override them. Use `--json` for structured output and `--fail-on-updates` to exit with code `2` when action is needed.

`upmods audit --strict` reports startup-breaking errors separately from warnings and exits with code `2` only when errors are present. Plain audit does not fail CI merely because a JAR is unidentified or disabled.

`upmods update --dry-run` shows every update, up-to-date, ignored, pinned, and incompatible decision. `upmods update` without `--yes` is also preview-only. `--yes` downloads into an isolated staging directory, verifies Modrinth SHA-512/SHA-1 checksums, creates a backup, and uses the existing transactional Apply path. Apply first copies each download to a private same-filesystem transaction snapshot and verifies its checksums again, so a file changed after download cannot pass into the transaction. Apply installs the filename supplied by the selected Modrinth version, removes the superseded filename, and refuses target collisions. A failed download or Apply never intentionally leaves a partially updated instance.

Before either CLI or TUI starts a confirmed update, the shared core safety policy blocks unresolved startup errors and incompatible plan decisions. It builds a projected dependency graph using the selected target versions, unchanged installed mods, and safe local metadata, so a target version that introduces a missing required dependency or a new declared conflict is refused before download. Dry-run JSON includes this result as `safety`. A planned replacement may repair an existing loader, Minecraft-version, or dependency error; unrelated errors still require the displayed remediation first.

In the TUI, safety is recalculated from the exact selected updates. Before Apply it is recalculated again from successfully verified downloads, so deselecting or failing the update that was meant to repair an incompatibility cannot leave an unsafe partial set eligible for Apply.

Press `Ctrl+C` to cancel a non-interactive scan, check, audit, lock, verify, or update while it is still safe to stop. Cancellation aborts pending hashing, Modrinth requests, retry waits, and downloads, removes managed staging files, and exits with code `130` (`143` for `SIGTERM`). Once transactional Apply or rollback has started, upmods lets that transaction finish or restore instead of interrupting it halfway.

`upmods lock` writes a portable `.upmods-lock.json` snapshot without absolute paths. Commit it with a modpack or server configuration, then run `upmods verify` locally or in CI to detect added, removed, changed, or unidentified JAR content. Verification exits with code `2` when drift is found.

### Instance settings

Confirmed settings are stored in `<instance-dir>/.upmods.json`:

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

Settings can be inspected and changed without editing JSON directly:

```bash
upmods config .
upmods config . --json
upmods config . --mc-version=1.21.1 --loader=fabric --channel=stable-only
upmods config . --ignore=example-project --unignore=old-project
upmods config . --pin=sodium=mc1.21-0.6.13 --unpin=old-project
upmods config . --clear-mc-version --clear-loader
```

`--ignore`, `--unignore`, `--pin`, and `--unpin` may be repeated. Project references accept a Modrinth project ID or slug, while pins accept either a version ID or exact version number. Config writes are atomic; malformed or unsupported existing settings are preserved and must be fixed or removed explicitly before a change is accepted.

Use `allow-beta` to include beta releases. Pins are resolved only within the configured Minecraft version and loader. Local JAR metadata is used for display and audit only; it is never treated as permission to download an unrelated replacement.

### Workflow

1. Scan and identify installed mods.
2. Choose the target Minecraft version and loader.
3. Review updates, or analyze a cross-loader migration.
4. Download updates or assemble the target-loader mod set.
5. Review the result and optionally apply ordinary updates.

Cross-loader output is written to:

```text
<mods-dir>/mods-updated/<loader>-<minecraft-version>/
```

The output contains `.upmods-migration.json`. upmods will never replace a migration directory that does not contain a valid managed manifest.

### Keyboard controls

| Key | Action |
| --- | --- |
| `↑` / `↓` | Navigate or scroll |
| `Enter` | Confirm |
| `Space` | Toggle a selectable update or optional dependency |
| `A` / `N` | Select all / clear selectable items |
| `O` | Open the highlighted Modrinth version page |
| `S` | Correct the detected source loader |
| `F` | Use saved/detected settings for a quick check |
| `B` | Return to the previous safe review step |
| `C` | Cancel a check, download, or migration build and return to its safe review step |
| `X` | Rescan the instance from the scan summary |
| `T` | Retry scanning after an error |
| `U` | Start download or migration build |
| `L` | Toggle language |
| `Q` | Quit |

## Safety and limitations

- Loader migration only creates a mod directory; it does not install or configure a Minecraft loader or launcher instance.
- Cross-project substitute mods are not selected automatically.
- Dependency quality depends on metadata supplied by Modrinth project authors.
- Unidentified and unavailable mods are reported and skipped.
- Version-range evaluation for local metadata is conservative and intentionally does not guess for unknown syntaxes.
- Launcher detection does not install or modify Minecraft loaders; ambiguous metadata must be confirmed.
- Disabled JARs never satisfy or trigger active dependency relationships. When version metadata is available, audit also checks exact Modrinth dependency versions and local dependency ranges.
- Ordinary Apply operations back up the replaced files under `.upmods-backup/` first. Versioned filenames are changed transactionally; rollback removes the new filename and restores the original one.
- Checksum revalidation happens before the backup manifest or installed files are changed. A mismatch removes the private snapshot and asks for a fresh download.
- Quit and cancellation abort work that has not crossed the Apply/rollback transaction boundary. Apply and rollback deliberately remain non-interruptible once file replacement begins.

## Development

```bash
pnpm install
pnpm --filter upmods dev -- ./mods
pnpm test:integration
pnpm release:check
pnpm pack:cli
```

The monorepo keeps headless business logic in `packages/core` and Ink presentation/state wiring in `packages/cli`.

`pnpm test:integration` builds the publishable CLI, generates real Prism and CurseForge instance fixtures plus Fabric/Forge/Quilt JAR archives, and exercises the non-interactive workflow against a localhost fake Modrinth API. It covers dry runs, a checksum failure with no Apply, a successful verified Apply using the release filename, a post-update check, and rollback restoration. It requires no external network access.

## License

MIT © 0png. See [LICENSE](LICENSE).
