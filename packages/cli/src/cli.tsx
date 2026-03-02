#!/usr/bin/env tsx
import React from 'react';
import { render } from 'ink';
import { App } from './app.js';

const dir = process.argv[2] ?? process.cwd();
render(<App dir={dir} />);
