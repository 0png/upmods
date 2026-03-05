#!/usr/bin/env tsx
import React from 'react';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { render } from 'ink';
import { App } from './app.js';

// pnpm sets INIT_CWD to the directory where the user ran the pnpm command.
// We resolve relative paths against it so `pnpm dev test-mods/` works from the repo root.
// UPMODS_DIR env var bypasses cmd.exe arg-splitting on Windows (use for paths with spaces):
//   UPMODS_DIR="D:/! Tools/Upmods/test-mods" pnpm --filter @upmods/cli dev
const invocationCwd = process.env['INIT_CWD'] ?? process.cwd();
const envDir = process.env['UPMODS_DIR'];
const argDir = process.argv.slice(2).find((a) => a !== '--');
const rawDir = envDir ?? argDir;
const resolvedDir = rawDir ? path.resolve(invocationCwd, rawDir) : invocationCwd;

// Universal Path Protection: validate the directory path immediately
let dir: string;
try {
  dir = realpathSync(resolvedDir);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Invalid directory path: ${resolvedDir}`);
  console.error(`Error: ${message}`);
  console.error('Please check for special characters that your shell might be misinterpreting.');
  process.exit(1);
}

render(<App dir={dir} />);
