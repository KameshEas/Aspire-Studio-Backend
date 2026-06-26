/**
 * UI Generation Workflow
 * Orchestrates: layout synthesis → component spec → mock image → Figma export
 * 
 * Task Queue: light-worker for LLM, gpu-worker for image generation
 * Timeout: 10 minutes
 * Retries: Per-activity (via Bull queue retry logic)
 */

import { WorkflowInput, WorkflowOutput } from '../../lib/workflow/engine';
import {
  synthesizeLayoutActivity,
  generateComponentSpecActivity,
  generateUIThumbnailActivity,
  exportToFigmaActivity,
  generateHTMLPreviewActivity,
} from '../activities/ui-generation';
import { storeArtifactActivity } from '../activities/storage';

export async function uiGenerateWorkflow(
  input: WorkflowInput
): Promise<WorkflowOutput> {
  const startTime = Date.now();
  const artifacts = [];
  const errors = [];

  try {
    // Step 1: Validate input
    if (!input.projectId || !input.tenantId) {
      throw new Error('Missing projectId or tenantId');
    }

    // Step 2: Extract brand information from payload
    const { brandName = 'Brand', brandTone = 'professional', targetAudience = 'General', siteType = 'saas' } =
      input.payload || {};

    // Step 3: Synthesize layout specification from brand
    console.log('[uiGenerateWorkflow] Synthesizing layout...');
    const layoutResult = await synthesizeLayoutActivity({
      brandName,
      brandTone,
      targetAudience,
      siteType: siteType as 'landing' | 'saas' | 'blog' | 'portfolio' | 'ecommerce',
    });

    if (!layoutResult.success || !layoutResult.data) {
      errors.push({
        activity: 'synthesizeLayoutActivity',
        message: layoutResult.error || 'Layout synthesis failed',
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Layout synthesis failed: ${layoutResult.error}`);
    }

    const layoutSpec = layoutResult.data;

    // Step 4: Generate component specifications from layout
    console.log('[uiGenerateWorkflow] Generating component specs...');
    const componentResult = await generateComponentSpecActivity({
      layoutSpec,
      includeAnimations: false,
      includeAccessibility: true,
    });

    if (!componentResult.success || !componentResult.data) {
      errors.push({
        activity: 'generateComponentSpecActivity',
        message: componentResult.error || 'Component spec generation failed',
        timestamp: new Date().toISOString(),
      });
      // Continue with empty components
    }

    const components = componentResult.data || [];

    // Step 5: Generate UI thumbnail/mockup image
    console.log('[uiGenerateWorkflow] Generating UI thumbnail...');
    const thumbnailResult = await generateUIThumbnailActivity({
      layoutSpec,
      width: 1024,
      height: 768,
    });

    if (thumbnailResult.success && thumbnailResult.data) {
      // Store thumbnail as artifact
      const storageThumbnailResult = await storeArtifactActivity({
        content: Buffer.from(thumbnailResult.data.imageBase64, 'base64'),
        mimeType: thumbnailResult.data.mimeType,
        projectId: input.projectId,
        generationId: input.generationId || `ui-gen-${Date.now()}`,
        fileName: 'ui-thumbnail.svg',
      });

      if (storageThumbnailResult.success) {
        artifacts.push({
          id: storageThumbnailResult.data?.artifactId || '',
          name: 'UI Thumbnail',
          type: 'image',
          url: storageThumbnailResult.data?.url || '',
          mimeType: 'image/svg+xml',
        });
      }
    } else {
      errors.push({
        activity: 'generateUIThumbnailActivity',
        message: thumbnailResult.error || 'Thumbnail generation failed',
        timestamp: new Date().toISOString(),
      });
    }

    // Step 6: Generate HTML preview
    console.log('[uiGenerateWorkflow] Generating HTML preview...');
    const htmlResult = await generateHTMLPreviewActivity({
      layoutSpec,
      components,
    });

    if (htmlResult.success && htmlResult.data) {
      const storageHtmlResult = await storeArtifactActivity({
        content: htmlResult.data.html,
        mimeType: 'text/html',
        projectId: input.projectId,
        generationId: input.generationId || `ui-gen-${Date.now()}`,
        fileName: 'ui-preview.html',
      });

      if (storageHtmlResult.success) {
        artifacts.push({
          id: storageHtmlResult.data?.artifactId || '',
          name: 'HTML Preview',
          type: 'html',
          url: storageHtmlResult.data?.url || '',
          mimeType: 'text/html',
        });
      }
    }

    // Step 7: Store layout specification as JSON artifact
    const layoutJsonResult = await storeArtifactActivity({
      content: JSON.stringify(layoutSpec, null, 2),
      mimeType: 'application/json',
      projectId: input.projectId,
      generationId: input.generationId || `ui-gen-${Date.now()}`,
      fileName: 'layout-spec.json',
    });

    if (layoutJsonResult.success) {
      artifacts.push({
        id: layoutJsonResult.data?.artifactId || '',
        name: 'Layout Specification',
        type: 'json',
        url: layoutJsonResult.data?.url || '',
        mimeType: 'application/json',
      });
    }

    // Step 8: Store components specification as JSON artifact
    const componentJsonResult = await storeArtifactActivity({
      content: JSON.stringify(components, null, 2),
      mimeType: 'application/json',
      projectId: input.projectId,
      generationId: input.generationId || `ui-gen-${Date.now()}`,
      fileName: 'component-specs.json',
    });

    if (componentJsonResult.success) {
      artifacts.push({
        id: componentJsonResult.data?.artifactId || '',
        name: 'Component Specifications',
        type: 'json',
        url: componentJsonResult.data?.url || '',
        mimeType: 'application/json',
      });
    }

    // Step 9: Export to Figma (optional, may fail gracefully)
    console.log('[uiGenerateWorkflow] Exporting to Figma...');
    const figmaResult = await exportToFigmaActivity({
      layoutSpec,
      components,
      projectId: input.projectId,
    });

    if (figmaResult.success && figmaResult.data) {
      artifacts.push({
        id: `figma-${figmaResult.data.figmaFileId}`,
        name: 'Figma Design File',
        type: 'figma',
        url: figmaResult.data.figmaUrl,
        mimeType: 'application/figma',
      });
    } else {
      // Non-fatal: Figma export is optional
      console.warn('[uiGenerateWorkflow] Figma export skipped:', figmaResult.error);
    }

    return {
      artifacts,
      errors,
      metrics: {
        totalDurationMs: Date.now() - startTime,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        componentCount: components.length,
        artifactCount: artifacts.length,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[uiGenerateWorkflow] Fatal error:', errorMsg);

    return {
      artifacts,
      errors: [
        ...errors,
        {
          activity: 'uiGenerateWorkflow',
          message: `Workflow failed: ${errorMsg}`,
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
