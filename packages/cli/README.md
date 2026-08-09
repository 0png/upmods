# upmods

Minecraft mod updater and cross-loader migration TUI powered by Modrinth.

## Install

```bash
npm install --global upmods
```

Node.js 20 or newer is required.

## Usage

```bash
upmods [mods-dir]
upmods rollback [mods-dir]
upmods --help
```

Loader migrations are assembled under `mods-updated/<loader>-<minecraft-version>/` and never overwrite the source instance.

Full documentation, source, and issue tracker: [github.com/0png/upmods](https://github.com/0png/upmods)

## License

MIT © 0png.
