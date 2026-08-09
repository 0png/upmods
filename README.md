# upmods

[![CI](https://github.com/0png/upmods/actions/workflows/ci.yml/badge.svg)](https://github.com/0png/upmods/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`upmods` is a terminal UI for updating Minecraft mods through Modrinth and migrating a mod set between Fabric, Forge, NeoForge, Quilt, and other supported loaders.

## Features

- Identify local `.jar` files by SHA-1 through the Modrinth v2 API.
- Select a target Minecraft release and mod loader.
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
npm install --global ./upmods-0.1.0.tgz
```

## Usage

```bash
upmods [mods-dir]
upmods rollback [mods-dir]
upmods --help
```

If no directory is supplied, upmods uses the current working directory.

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
| `U` | Start download or migration build |
| `L` | Toggle language |
| `Q` | Quit |

## Safety and limitations

- Loader migration only creates a mod directory; it does not install or configure a Minecraft loader or launcher instance.
- Cross-project substitute mods are not selected automatically.
- Dependency quality depends on metadata supplied by Modrinth project authors.
- Unidentified and unavailable mods are reported and skipped.
- Ordinary Apply operations back up the overwritten files under `.upmods-backup/` first.

## Development

```bash
pnpm install
pnpm --filter upmods dev -- ./mods
pnpm release:check
pnpm pack:cli
```

The monorepo keeps headless business logic in `packages/core` and Ink presentation/state wiring in `packages/cli`.

## License

MIT © 0png. See [LICENSE](LICENSE).
