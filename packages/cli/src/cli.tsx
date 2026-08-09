#!/usr/bin/env node
import React from 'react';
import path from 'node:path';
import { render } from 'ink';
import { App } from './app.js';
import { UpmodsCore } from '@upmods/core';

// pnpm sets INIT_CWD to the directory where the user ran the pnpm command.
// We resolve relative paths against it so `pnpm dev test-mods/` works from the repo root.
const invocationCwd = process.env['INIT_CWD'] ?? process.cwd();
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const CLI_VERSION = '0.1.0';
const HELP = `upmods ${CLI_VERSION}

Minecraft mods updater and loader migration TUI powered by Modrinth.

Usage:
  upmods [mods-dir]
  upmods rollback [mods-dir]

Options:
  -h, --help       Show this help
  -v, --version    Show the installed version

Examples:
  upmods
  upmods C:\\Games\\Minecraft\\mods
  upmods rollback C:\\Games\\Minecraft\\mods`;
const [command, maybeDir] = args;
const isRollbackCommand = command === 'rollback';
const rawDir = isRollbackCommand ? maybeDir : command;
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

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  if (args.includes('--version') || args.includes('-v')) {
    console.log(CLI_VERSION);
    return;
  }

  if (isRollbackCommand) {
    const core = new UpmodsCore();
    const result = await core.rollbackLatestSession(dir);
    console.log(`Rolled back ${result.restoredCount} mods from session ${result.sessionId}`);
    console.log(`Backup dir: ${result.backupDir}`);
    return;
  }

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
}

main().catch((err: unknown) => {
  restoreScreen();
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exitCode = 1;
});
