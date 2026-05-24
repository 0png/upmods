import type { AppPhase } from './reducer.js';

export const WORKFLOW_STEP_COUNT = 5;

export function getWorkflowStep(phase: AppPhase): number | null {
  switch (phase) {
    case 'scanning':
    case 'identifying':
    case 'scan_complete':
      return 1;
    case 'version_select':
      return 2;
    case 'checking':
    case 'check_complete':
      return 3;
    case 'downloading':
      return 4;
    case 'done':
      return 5;
    case 'error':
      return null;
    default:
      return null;
  }
}
