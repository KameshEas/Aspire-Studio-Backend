/**
 * Project Build Workflow
 * Composite orchestrator: validates → templates → parallel (brand/content/UI) → assemble landing → code gen
 */

import { WorkflowInput, WorkflowOutput } from '../../lib/workflow/engine';
import { brandGenerateWorkflow } from './brandGenerate';
import { contentGenerateWorkflow } from './contentGenerate';
import { uiGenerateWorkflow } from './uiGenerate';
import { codeGenerateWorkflow } from './codeGenerate';
import { storeArtifactActivity } from '../activities/storage';

export async function projectBuildWorkflow(
  input: WorkflowInput
): Promise<WorkflowOutput> {
  const artifacts: WorkflowOutput['artifacts'] = [];
  const errors: WorkflowOutput['artifacts'] = [];
  const startTime = Date.now();

  try {
    // 1. Spawn parallel generation tasks
    const [brandResult, contentResult, uiResult] = await Promise.all([
      brandGenerateWorkflow({
        ...input,
        payload: { ...input.payload, brand: input.payload.brand },
      }),
      contentGenerateWorkflow({
        ...input,
        payload: { ...input.payload, content: input.payload.content },
      }),
      uiGenerateWorkflow({
        ...input,
        payload: { ...input.payload, ui: input.payload.ui },
      }),
    ]);

    // Collect artifacts from each workflow
    if (brandResult.artifacts) {
      artifacts.push(...brandResult.artifacts);
    }
    if (contentResult.artifacts) {
      artifacts.push(...contentResult.artifacts);
    }
    if (uiResult.artifacts) {
      artifacts.push(...uiResult.artifacts);
    }

    // Collect errors
    if (brandResult.errors) {
      errors.push(...brandResult.errors);
    }
    if (contentResult.errors) {
      errors.push(...contentResult.errors);
    }
    if (uiResult.errors) {
      errors.push(...uiResult.errors);
    }

    // 2. Assemble landing page (Phase 2)
    // For now, create a summary artifact
    const summary = {
      phase: 'Phase 1 MVP',
      brandArtifacts: brandResult.artifacts?.length || 0,
      contentArtifacts: contentResult.artifacts?.length || 0,
      uiArtifacts: uiResult.artifacts?.length || 0,
      totalArtifacts: artifacts.length,
      timestamp: new Date().toISOString(),
    };

    const summaryArtifact = await storeArtifactActivity({
      content: JSON.stringify(summary, null, 2),
      mimeType: 'application/json',
      projectId: input.projectId,
      generationId: input.idempotencyKey,
      fileName: 'project-build-summary.json',
    });

    if (summaryArtifact.success && summaryArtifact.data) {
      artifacts.push({
        id: summaryArtifact.data.artifactId,
        type: 'text',
        url: summaryArtifact.data.url,
        mimeType: 'application/json',
        metadata: { kind: 'project-build-summary' },
      });
    }

    // 3. Code generation (Phase 2 - currently deferred)
    const codeResult = await codeGenerateWorkflow(input);
    if (codeResult.artifacts) {
      artifacts.push(...codeResult.artifacts);
    }
    if (codeResult.errors) {
      errors.push(...codeResult.errors);
    }

    return {
      artifacts,
      errors: errors.length > 0 ? errors : undefined,
      metrics: {
        totalDurationMs: Date.now() - startTime,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      artifacts,
      errors: [
        {
          activity: 'projectBuildWorkflow',
          message: error instanceof Error ? error.message : String(error),
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
}
