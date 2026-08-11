# upmods

[![npm](https://img.shields.io/npm/v/upmods)](https://www.npmjs.com/package/upmods)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://github.com/0png/upmods/blob/master/LICENSE)

Safely maintain Minecraft mods from an instance root or exact `mods` directory. `upmods` detects common launcher layouts, checks Modrinth compatibility, audits the installed set, and applies confirmed updates through a verified backup transaction.

## Install

Requires [Node.js 20 or newer](https://nodejs.org/).

PowerShell one-liner:

```powershell
irm https://raw.githubusercontent.com/0png/upmods/master/install.ps1 | iex
```

The public installer checks Node.js 20+, installs the latest npm release, and verifies the installed version. You can [inspect it before running](https://github.com/0png/upmods/blob/master/install.ps1).

Standard install:

```powershell
npm install --global upmods@latest
```

## Quick start

```powershell
cd 'D:\Games\PrismLauncher\instances\MyPack'
upmods
```

Preview and apply from the command line:

```powershell
upmods audit . --strict
upmods update . --dry-run
upmods update . --yes
```

`upmods update` without `--yes` is always preview-only. Confirmed updates retain checksum verification, backups, projected dependency checks, and transactional recovery.

## Commands

| Command | Purpose |
| --- | --- |
| `upmods [instance-dir]` | Open the interactive TUI |
| `upmods scan [instance-dir]` | Inventory and identify JARs |
| `upmods check [instance-dir]` | Check compatible updates |
| `upmods audit [instance-dir]` | Report health and compatibility problems |
| `upmods update [instance-dir] --dry-run` | Preview policy and safety decisions |
| `upmods update [instance-dir] --yes` | Verify, back up, and apply updates |
| `upmods lock [instance-dir]` | Write `.upmods-lock.json` |
| `upmods verify [instance-dir]` | Detect lockfile drift |
| `upmods rollback [instance-dir]` | Restore the latest applied backup |
| `upmods config [instance-dir]` | Manage saved instance settings |

Run `upmods --help` for JSON/CI options, update channels, ignore rules, and version pins.

Full documentation, source, and issue tracker: [github.com/0png/upmods](https://github.com/0png/upmods)

## License

MIT © 0png.
