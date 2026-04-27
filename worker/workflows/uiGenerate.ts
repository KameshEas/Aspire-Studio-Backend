/**
 * UI Generation Workflow (Skeleton for Phase 2)
 * Deferred: Layout synthesis, component spec, Figma export
 */

import { WorkflowInput, WorkflowOutput } from '../../lib/workflow/engine';

export async function uiGenerateWorkflow(
  input: WorkflowInput
): Promise<WorkflowOutput> {
  const startTime = Date.now();

  // Placeholder: Full UI generation deferred to Phase 2
  return {
    artifacts: [],
    errors: [
      {
        activity: 'uiGenerateWorkflow',
        message: 'UI generation deferred to Phase 2',
        timestamp: new Date().toISOString(),
      },
    ],
    metrics: {
      totalDurationMs: Date.now() - startTime,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
    },
  };
}
