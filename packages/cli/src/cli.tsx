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

render(<App dir={dir} />);
