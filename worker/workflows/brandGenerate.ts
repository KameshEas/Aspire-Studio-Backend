/**
 * Brand Generation Workflow
 * Orchestrates: brand name → tone → palette → logo → PDF assembly
 */

import { WorkflowInput, WorkflowOutput } from '../../lib/workflow/engine';
import {
  generateTextActivity,
  validateInputActivity,
  templatePromptActivity,
} from '../activities/text-generation';
import { storeArtifactActivity } from '../activities/storage';

export async function brandGenerateWorkflow(
  input: WorkflowInput
): Promise<WorkflowOutput> {
  const artifacts: WorkflowOutput['artifacts'] = [];
  const errors: WorkflowOutput['artifacts'] = [];
  const startTime = Date.now();

  try {
    // 1. Validate input
    const validation = await validateInputActivity({
      tenantId: input.tenantId,
      projectId: input.projectId,
      payload: input.payload,
    });

    if (!validation.success) {
      throw new Error(`Validation failed: ${validation.error}`);
    }

    // 2. Template the prompts
    const brandPayload = input.payload.brand || {};

    const namePrompt = await templatePromptActivity({
      template:
        brandPayload.nameTemplate ||
        'Create a professional brand name for: {{description}}',
      variables: { description: brandPayload.description || '' },
    });

    if (!namePrompt.success) {
      throw new Error(`Name template failed: ${namePrompt.error}`);
    }

    // 3. Generate brand name
    const nameResult = await generateTextActivity({
      prompt: namePrompt.data!.prompt,
      model: input.options?.model || 'mixtral-8x7b-32768',
      maxTokens: 100,
      temperature: 0.7,
    });

    if (!nameResult.success) {
      errors.push({
        activity: 'generateBrandName',
        message: nameResult.error || 'Unknown error',
        timestamp: new Date().toISOString(),
      } as any);
    } else if (nameResult.data) {
      // 4. Store brand name artifact
      const nameArtifact = await storeArtifactActivity({
        content: nameResult.data.text,
        mimeType: 'text/plain',
        projectId: input.projectId,
        generationId: input.idempotencyKey,
        fileName: 'brand-name.txt',
      });

      if (nameArtifact.success && nameArtifact.data) {
        artifacts.push({
          id: nameArtifact.data.artifactId,
          type: 'text',
          url: nameArtifact.data.url,
          mimeType: 'text/plain',
          metadata: { kind: 'brand-name' },
        });
      }
    }

    // 5. Generate brand tone
    const tonePrompt = await templatePromptActivity({
      template:
        brandPayload.toneTemplate ||
        'Define the brand tone for: {{name}}. Industry: {{industry}}',
      variables: {
        name: nameResult.data?.text || 'Brand',
        industry: brandPayload.industry || 'Technology',
      },
    });

    if (tonePrompt.success) {
      const toneResult = await generateTextActivity({
        prompt: tonePrompt.data!.prompt,
        model: input.options?.model || 'mixtral-8x7b-32768',
        maxTokens: 200,
        temperature: 0.7,
      });

      if (toneResult.success && toneResult.data) {
        const toneArtifact = await storeArtifactActivity({
          content: toneResult.data.text,
          mimeType: 'text/plain',
          projectId: input.projectId,
          generationId: input.idempotencyKey,
          fileName: 'brand-tone.txt',
        });

        if (toneArtifact.success && toneArtifact.data) {
          artifacts.push({
            id: toneArtifact.data.artifactId,
            type: 'text',
            url: toneArtifact.data.url,
            mimeType: 'text/plain',
            metadata: { kind: 'brand-tone' },
          });
        }
      }
    }

    // 6. Generate color palette
    const palettePrompt = await templatePromptActivity({
      template:
        brandPayload.paletteTemplate ||
        'Generate a color palette for brand: {{name}}, tone: {{tone}}',
      variables: {
        name: nameResult.data?.text || 'Brand',
        tone: 'Professional',
      },
    });

    if (palettePrompt.success) {
      const paletteResult = await generateTextActivity({
        prompt: palettePrompt.data!.prompt,
        model: input.options?.model || 'mixtral-8x7b-32768',
        maxTokens: 300,
        temperature: 0.8,
      });

      if (paletteResult.success && paletteResult.data) {
        const paletteArtifact = await storeArtifactActivity({
          content: paletteResult.data.text,
          mimeType: 'application/json',
          projectId: input.projectId,
          generationId: input.idempotencyKey,
          fileName: 'brand-palette.json',
        });

        if (paletteArtifact.success && paletteArtifact.data) {
          artifacts.push({
            id: paletteArtifact.data.artifactId,
            type: 'text',
            url: paletteArtifact.data.url,
            mimeType: 'application/json',
            metadata: { kind: 'brand-palette' },
          });
        }
      }
    }

    // 7. Note: Logo generation (generateImage) deferred to Phase 2

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
          activity: 'brandGenerateWorkflow',
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
