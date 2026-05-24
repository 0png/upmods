import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorkflowStep, WORKFLOW_STEP_COUNT } from './workflow.js';

test('workflow step count stays aligned with the visible upmods flow', () => {
  assert.equal(WORKFLOW_STEP_COUNT, 5);
});

test('scan-related phases map to step 1', () => {
  assert.equal(getWorkflowStep('scanning'), 1);
  assert.equal(getWorkflowStep('identifying'), 1);
  assert.equal(getWorkflowStep('scan_complete'), 1);
});

test('version selection maps to step 2', () => {
  assert.equal(getWorkflowStep('version_select'), 2);
});

test('check-related phases map to step 3', () => {
  assert.equal(getWorkflowStep('checking'), 3);
  assert.equal(getWorkflowStep('check_complete'), 3);
});

test('download and completion map to the final visible steps', () => {
  assert.equal(getWorkflowStep('downloading'), 4);
  assert.equal(getWorkflowStep('done'), 5);
});

test('error phase hides the workflow step indicator', () => {
  assert.equal(getWorkflowStep('error'), null);
});
