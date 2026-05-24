import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatListNumber,
  getViewportState,
  getVisibleItems,
  getVisibleWindow,
} from './viewport.js';

test('getVisibleWindow returns full range when list is shorter than visibleCount', () => {
  assert.deepEqual(getVisibleWindow(3, 1, 10), { start: 0, end: 3 });
});

test('getVisibleWindow follows the selected index through the middle of a long list', () => {
  assert.deepEqual(getVisibleWindow(20, 8, 5), { start: 6, end: 11 });
});

test('getVisibleWindow clamps correctly near the end of the list', () => {
  assert.deepEqual(getVisibleWindow(20, 19, 5), { start: 15, end: 20 });
});

test('getVisibleItems returns items with their original indices', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(getVisibleItems(items, 3, 3), [
    { item: 'c', index: 2 },
    { item: 'd', index: 3 },
    { item: 'e', index: 4 },
  ]);
});

test('getViewportState returns current position and hidden counts', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(getViewportState(items, 3, 3), {
    visibleItems: [
      { item: 'c', index: 2 },
      { item: 'd', index: 3 },
      { item: 'e', index: 4 },
    ],
    currentPosition: 4,
    totalCount: 6,
    hiddenAbove: 2,
    hiddenBelow: 1,
  });
});

test('formatListNumber pads to the width of the list size', () => {
  assert.equal(formatListNumber(2, 18), '03.');
  assert.equal(formatListNumber(2, 120), '003.');
});
