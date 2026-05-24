#!/usr/bin/env tsx
import React from 'react';
import path from 'node:path';
import { render } from 'ink';
import { App } from './app.js';

// pnpm sets INIT_CWD to the directory where the user ran the pnpm command.
// We resolve relative paths against it so `pnpm dev test-mods/` works from the repo root.
const invocationCwd = process.env['INIT_CWD'] ?? process.cwd();
const rawDir = process.argv.slice(2).find((a) => a !== '--');
const dir = rawDir ? path.resolve(invocationCwd, rawDir) : invocationCwd;

const ALT_SCREEN_ENTER = '\u001b[?1049h';
const ALT_SCREEN_EXIT = '\u001b[?1049l';
const CLEAR_SCREEN = '\u001b[2J\u001b[H';

let restored = false;

const restoreScreen = () => {
  if (restored) return;
  restored = true;
  process.stdout.write(ALT_SCREEN_EXIT);
};

process.stdout.write(ALT_SCREEN_ENTER);
process.stdout.write(CLEAR_SCREEN);

const instance = render(<App dir={dir} />);

instance.waitUntilExit().finally(() => {
  restoreScreen();
});

process.on('SIGINT', () => {
  restoreScreen();
  process.exit(130);
});

process.on('SIGTERM', () => {
  restoreScreen();
  process.exit(143);
});
