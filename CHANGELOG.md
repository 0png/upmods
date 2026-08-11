# Changelog

All notable changes to upmods are documented here.

## Unreleased

### Added

- A public PowerShell installer supporting the short `irm .../install.ps1 | iex` installation flow.

## 0.2.0 - 2026-08-10

### Added

- Instance-root resolution for native Minecraft, Prism Launcher, Modrinth App, and CurseForge layouts.
- Persistent per-instance `.upmods.json` settings for Minecraft version, loader, update channel, ignore rules, and version pins.
- Safe bounded local metadata fallback for `fabric.mod.json`, `quilt.mod.json`, `META-INF/mods.toml`, and `META-INF/neoforge.mods.toml`.
- Pure core audit reports plus `upmods audit`, JSON output, severity levels, remediation text, and strict CI exits.
- Policy-aware `upmods update` dry runs and explicitly confirmed transactional updates.
- TUI suggested-setting quick checks, pre-download audit/policy summaries, back, retry, and rescan controls.
- Non-interactive `upmods scan` inventory with human-readable and JSON output.
- Non-interactive update checks with loader detection, JSON output, and an opt-in CI failure code.
- Persistent local SHA-1 cache with an explicit `--no-cache` escape hatch.
- Portable mod-set lockfiles through `upmods lock`, plus drift detection through `upmods verify`.
- Safe `upmods config` inspection and atomic updates for environment, channel, ignore rules, and version pins, including JSON output and clear/unset operations.
- A deterministic offline built-CLI integration harness covering Prism and CurseForge fixtures, real local JAR metadata, scan, check, audit/strict exits, lock/verify drift, update dry runs, verified Apply, checksum failure, rollback, and config persistence.
- Cooperative cancellation across hashing, Modrinth requests and retry waits, downloads, update staging, and migration builds, with TUI safe-return controls and conventional command exit codes.

### Changed

- Accept instance roots as well as exact mods directories across scan, check, audit, update, lock, verify, rollback, and the TUI.
- Include disabled `.jar.disabled`, `.jar.old`, and `.jar.bak` files in health analysis without treating them as active mods.
- Filter update candidates by stable-only or allow-beta channel and keep ignored/pinned decisions visible.
- Stage automatic updates separately and require every verified download to succeed before invoking transactional Apply.
- Hash multiple JARs concurrently while preserving deterministic scan results.
- Split the CLI bootstrap from the React/Ink application so help and version commands start without loading the TUI.
- Remove unused runtime packages from the published dependency graph.
- Prefetch Minecraft version and loader metadata while local JAR hashing is still running.
- Retry transient Modrinth failures with bounded backoff and explicit request timeouts.
- Verify downloaded files against Modrinth checksums and throttle progress rendering.
- Automatically restore already-attempted files when an Apply operation fails partway through.
- Install each selected release under its actual downloaded filename, remove the superseded filename transactionally, and refuse filename collisions.
- Record Apply lifecycle state in versioned backup manifests so rollback ignores failed or already rolled-back sessions while remaining compatible with legacy manifests.
- Ignore late asynchronous TUI events after cancellation, while allowing an entered Apply or rollback transaction to finish or restore atomically.
- Refuse ambiguous instance roots containing multiple possible mods directories instead of choosing one implicitly.
- Exclude disabled JARs from the active dependency graph and audit exact Modrinth dependency versions plus supported local version ranges.
- Return a failing exit code for confirmed JSON updates when download or checksum validation prevents Apply.
- Localize newly added TUI navigation controls and display the active update channel alongside the pre-download audit summary.
- Centralize confirmed-update safety policy in core so CLI, TUI navigation, and programmatic execution consistently block unresolved startup issues before downloading or applying files.
- Re-evaluate TUI safety from selected updates and then from successful downloads, preventing a deselected or failed compatibility repair from authorizing a partial Apply.
- Snapshot and re-verify staged update checksums at the Apply boundary, rejecting files changed after download before creating a backup manifest or touching installed mods.
- Project the dependency graph of selected target versions before download, including version-ID-only Modrinth dependencies and locally identified fallback metadata, so newly missing or incompatible dependencies block dry runs, TUI actions, and confirmed updates consistently.

## 0.1.0 - 2026-08-09

### Added

- Interactive scanning and Modrinth identification for local mod JARs.
- Minecraft version and target-loader selection.
- Ordinary update review, download, apply, backup, and rollback flows.
- Loader migration analysis for Fabric, Forge, NeoForge, Quilt, and other Modrinth loaders.
- Recursive required/optional dependency resolution and incompatibility reporting.
- Managed target-loader output directories with migration manifests.
- English and Traditional Chinese TUI.
- npm-ready bundled CLI with `--help` and `--version`.
