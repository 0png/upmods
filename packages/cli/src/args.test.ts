import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCliArgs } from './args.js';

test('parses audit strict JSON options', () => {
  assert.deepEqual(parseCliArgs(['audit', 'instance', '--strict', '--json']).command, 'audit');
  const parsed = parseCliArgs(['audit', 'instance', '--strict', '--json']);
  assert.equal(parsed.directory, 'instance');
  assert.equal(parsed.strict, true);
  assert.equal(parsed.json, true);
});

test('parses update safety and policy options', () => {
  const parsed = parseCliArgs([
    'update', '.', '--dry-run', '--mc-version=1.21.1', '--loader=fabric', '--channel=allow-beta',
  ]);
  assert.equal(parsed.command, 'update');
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.mcVersion, '1.21.1');
  assert.equal(parsed.loader, 'fabric');
  assert.equal(parsed.channel, 'allow-beta');
});

test('refuses destructive and dry-run modes together', () => {
  assert.throws(() => parseCliArgs(['update', '--dry-run', '--yes']), /either --dry-run or --yes/);
});

test('rejects options on commands that do not support them', () => {
  assert.throws(() => parseCliArgs(['rollback', '.', '--json']), /cannot be used with rollback/);
});

test('keeps an unrecognized first positional as the interactive directory', () => {
  const parsed = parseCliArgs(['C:\\Minecraft\\mods']);
  assert.equal(parsed.command, 'interactive');
  assert.equal(parsed.directory, 'C:\\Minecraft\\mods');
});

test('parses repeatable config changes and pin assignments', () => {
  const parsed = parseCliArgs([
    'config', '.', '--json', '--mc-version=1.21.1', '--loader=fabric', '--channel=allow-beta',
    '--ignore=first', '--ignore=second', '--unignore=old',
    '--pin=sodium=mc1.21-0.6.13', '--pin=lithium=abc123', '--unpin=retired',
  ]);
  assert.equal(parsed.command, 'config');
  assert.equal(parsed.directory, '.');
  assert.deepEqual(parsed.ignore, ['first', 'second']);
  assert.deepEqual(parsed.unignore, ['old']);
  assert.deepEqual(parsed.pin, [
    { project: 'sodium', version: 'mc1.21-0.6.13' },
    { project: 'lithium', version: 'abc123' },
  ]);
  assert.deepEqual(parsed.unpin, ['retired']);
});

test('parses config clear options', () => {
  const parsed = parseCliArgs(['config', 'instance', '--clear-mc-version', '--clear-loader']);
  assert.equal(parsed.clearMcVersion, true);
  assert.equal(parsed.clearLoader, true);
});

test('rejects conflicting config values and malformed pins', () => {
  assert.throws(
    () => parseCliArgs(['config', '--loader=fabric', '--clear-loader']),
    /either --loader or --clear-loader/,
  );
  assert.throws(() => parseCliArgs(['config', '--pin=sodium']), /PROJECT=VERSION/);
  assert.throws(() => parseCliArgs(['update', '--ignore=sodium']), /cannot be used with update/);
});
