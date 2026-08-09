import type { AppPhase } from './reducer.js';

export const WORKFLOW_STEP_COUNT = 5;

export function getWorkflowStep(phase: AppPhase): number | null {
  switch (phase) {
    case 'scanning':
    case 'identifying':
    case 'scan_complete':
      return 1;
    case 'version_select':
    case 'loader_select':
      return 2;
    case 'checking':
    case 'check_complete':
    case 'migration_checking':
    case 'migration_review':
      return 3;
    case 'downloading':
    case 'migration_building':
      return 4;
    case 'applying':
    case 'rollbacking':
    case 'done':
    case 'migration_done':
      return 5;
    case 'error':
      return null;
    default:
      return null;
  }
}
