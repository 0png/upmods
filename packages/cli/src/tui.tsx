import React from 'react';
import { render } from 'ink';
import { App } from './app.js';
import type { InstanceResolution } from '@upmods/core';

export function runTui(instance: InstanceResolution): ReturnType<typeof render> {
  return render(<App dir={instance.modsDir} instance={instance} />);
}
