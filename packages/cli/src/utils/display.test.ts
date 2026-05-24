import test from 'node:test';
import assert from 'node:assert/strict';
import { fitColumn, truncateText } from './display.js';

test('truncateText keeps shorter strings unchanged', () => {
  assert.equal(truncateText('upmods', 10), 'upmods');
});

test('truncateText truncates long strings with ellipsis', () => {
  assert.equal(truncateText('modrinth-release', 8), 'modrint…');
});

test('truncateText handles empty strings', () => {
  assert.equal(truncateText('', 4), '');
});

test('truncateText handles very narrow widths', () => {
  assert.equal(truncateText('長字串', 1), '…');
});

test('fitColumn pads to width', () => {
  assert.equal(fitColumn('abc', 5), 'abc  ');
});

test('fitColumn truncates then pads when needed', () => {
  assert.equal(fitColumn('very-long-version', 6), 'very-…');
});
