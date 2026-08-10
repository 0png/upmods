# upmods

Minecraft mod updater and cross-loader migration TUI powered by Modrinth.

## Install

```bash
npm install --global upmods
```

Node.js 20 or newer is required.

## Usage

```bash
upmods [instance-dir]
upmods scan [instance-dir] [--json]
upmods check [instance-dir] [--mc-version=1.21.1] [--loader=fabric]
upmods audit [instance-dir] [--json] [--strict]
upmods update [instance-dir] [--dry-run | --yes]
upmods lock [instance-dir]
upmods verify [instance-dir]
upmods rollback [instance-dir]
upmods config [instance-dir] [settings options]
upmods --help
```

An instance root or exact `mods` directory is accepted. If several possible mods directories exist, pass the exact one because upmods will not guess. Saved settings live in `.upmods.json`. Update is preview-only unless `--yes` is supplied; confirmed updates retain checksum verification, backups, and transactional recovery. Apply snapshots and re-verifies staged files immediately before the transaction, adopts the selected release's filename, safely removes the superseded filename, and refuses collisions.

`Ctrl+C` safely cancels non-interactive hashing, network requests, retry waits, and downloads with exit code `130`. In the TUI, `C` cancels checks, downloads, and migration builds back to a safe review screen. Apply and rollback finish their transaction once file replacement has begun.

TUI update safety follows the exact selected set and is checked again against successful downloads before enabling Apply; a failed or deselected compatibility repair therefore cannot be applied as a partial update. The same core policy projects required and incompatible dependencies from the selected target versions, blocking an update before download when its resulting mod set would be startup-unsafe.

Use `upmods config .` to inspect settings. Set the environment with `--mc-version`, `--loader`, and `--channel`; manage policy with repeatable `--ignore`, `--unignore`, `--pin=PROJECT=VERSION`, and `--unpin` options.

Loader migrations are assembled under `mods-updated/<loader>-<minecraft-version>/` and never overwrite the source instance.

Full documentation, source, and issue tracker: [github.com/0png/upmods](https://github.com/0png/upmods)

## License

MIT © 0png.
