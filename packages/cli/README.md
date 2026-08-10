# upmods

[![npm](https://img.shields.io/npm/v/upmods)](https://www.npmjs.com/package/upmods)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://github.com/0png/upmods/blob/master/LICENSE)

Safely maintain Minecraft mods from an instance root or exact `mods` directory. `upmods` detects common launcher layouts, checks Modrinth compatibility, audits the installed set, and applies confirmed updates through a verified backup transaction.

## Install

Requires [Node.js 20 or newer](https://nodejs.org/).

PowerShell one-liner:

```powershell
$node=Get-Command node.exe -ErrorAction SilentlyContinue; if(-not $node){throw 'upmods requires Node.js 20+: https://nodejs.org/'}; $major=[int]((node --version).TrimStart('v').Split('.')[0]); if($major -lt 20){throw "upmods requires Node.js 20+ (found $(node --version))"}; if(-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)){throw 'npm was not found; reinstall Node.js from https://nodejs.org/'}; npm.cmd install --global upmods@latest; if($LASTEXITCODE -ne 0){throw 'npm could not install upmods'}; upmods.cmd --version
```

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
