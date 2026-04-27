/**
 * Content Generation Workflow
 * Orchestrates: hero copy → SEO meta → email sequences → assembly
 */

import { WorkflowInput, WorkflowOutput } from '../../lib/workflow/engine';
import {
  generateTextActivity,
  validateInputActivity,
  templatePromptActivity,
} from '../activities/text-generation';
import { storeArtifactActivity, assembleHtmlActivity } from '../activities/storage';

export async function contentGenerateWorkflow(
  input: WorkflowInput
): Promise<WorkflowOutput> {
  const artifacts: WorkflowOutput['artifacts'] = [];
  const errors: WorkflowOutput['artifacts'] = [];
  const startTime = Date.now();

  try {
    // 1. Validate
    const validation = await validateInputActivity({
      tenantId: input.tenantId,
      projectId: input.projectId,
      payload: input.payload,
    });

    if (!validation.success) {
      throw new Error(`Validation failed: ${validation.error}`);
    }

    const contentPayload = input.payload.content || {};
    const heroPrompt = await templatePromptActivity({
      template:
        contentPayload.heroTemplate ||
        'Write a compelling hero copy for: {{product}}. Target audience: {{audience}}',
      variables: {
        product: contentPayload.product || 'Product',
        audience: contentPayload.audience || 'General',
      },
    });

    // 2. Generate hero copy in parallel with SEO and email
    const tasks = [];

    // Hero copy
    if (heroPrompt.success) {
      tasks.push(
        generateTextActivity({
          prompt: heroPrompt.data!.prompt,
          model: input.options?.model || 'mixtral-8x7b-32768',
          maxTokens: 500,
          temperature: 0.8,
        }).then((result) => ({
          kind: 'hero-copy',
          result,
        }))
      );
    }

    // SEO meta
    const seoPrompt = await templatePromptActivity({
      template:
        contentPayload.seoTemplate ||
        'Generate SEO metadata (title, description, keywords) for: {{product}}',
      variables: { product: contentPayload.product || 'Product' },
    });

    if (seoPrompt.success) {
      tasks.push(
        generateTextActivity({
          prompt: seoPrompt.data!.prompt,
          model: input.options?.model || 'mixtral-8x7b-32768',
          maxTokens: 300,
          temperature: 0.6,
        }).then((result) => ({
          kind: 'seo-meta',
          result,
        }))
      );
    }

    // Email sequences
    const emailPrompt = await templatePromptActivity({
      template:
        contentPayload.emailTemplate ||
        'Create an email sequence (3 emails) for {{product}} targeting {{audience}}',
      variables: {
        product: contentPayload.product || 'Product',
        audience: contentPayload.audience || 'General',
      },
    });

    if (emailPrompt.success) {
      tasks.push(
        generateTextActivity({
          prompt: emailPrompt.data!.prompt,
          model: input.options?.model || 'mixtral-8x7b-32768',
          maxTokens: 800,
          temperature: 0.8,
        }).then((result) => ({
          kind: 'email-sequence',
          result,
        }))
      );
    }

    // Wait for all content generation tasks
    const results = await Promise.all(tasks);

    // 3. Store each artifact
    for (const { kind, result } of results) {
      if (result.success && result.data) {
        const fileName = `content-${kind}.${kind === 'seo-meta' ? 'json' : 'txt'}`;
        const artifact = await storeArtifactActivity({
          content: result.data.text,
          mimeType: kind === 'seo-meta' ? 'application/json' : 'text/plain',
          projectId: input.projectId,
          generationId: input.idempotencyKey,
          fileName,
        });

        if (artifact.success && artifact.data) {
          artifacts.push({
            id: artifact.data.artifactId,
            type: 'text',
            url: artifact.data.url,
            mimeType: kind === 'seo-meta' ? 'application/json' : 'text/plain',
            metadata: { kind },
          });
        }
      } else {
        errors.push({
          activity: `generate${kind}`,
          message: result.error || 'Unknown error',
          timestamp: new Date().toISOString(),
        } as any);
      }
    }

    // 4. Assemble landing bundle HTML (placeholder for Phase 2)
    const bundleHtml = await assembleHtmlActivity(
      { content: contentPayload },
      artifacts
    );

    if (bundleHtml.success && bundleHtml.data) {
      const bundleArtifact = await storeArtifactActivity({
        content: bundleHtml.data.html || '<html></html>',
        mimeType: 'text/html',
        projectId: input.projectId,
        generationId: input.idempotencyKey,
        fileName: 'landing-bundle.html',
      });

      if (bundleArtifact.success && bundleArtifact.data) {
        artifacts.push({
          id: bundleArtifact.data.artifactId,
          type: 'html',
          url: bundleArtifact.data.url,
          mimeType: 'text/html',
          metadata: { kind: 'landing-bundle' },
        });
      }
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
          activity: 'contentGenerateWorkflow',
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
