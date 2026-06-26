/**
 * Image Generation Activity Handler
 * Handles image generation via HuggingFace GPU workers (FLUX.1-schnell)
 */

import { HuggingFaceAdapter } from '../../lib/providers/huggingface';
import type { ActivityResult } from '../../lib/workflow/activities';

const huggingface = new HuggingFaceAdapter();

export interface ImageGenerationOptions {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  projectId: string;
  generationId?: string;
  taskQueue?: string;
}

export interface GeneratedImage {
  imageBase64: string;
  mimeType: string;
  model: string;
  width: number;
  height: number;
  latencyMs: number;
}

/**
 * Main image generation activity
 * Routes to HuggingFace API with retry logic built-in via Bull queue
 * Intended for gpu-worker task queue
 */
export async function generateImageActivity(
  options: ImageGenerationOptions
): Promise<ActivityResult<GeneratedImage>> {
  try {
    const startTime = Date.now();

    if (!options.prompt || options.prompt.trim().length === 0) {
      return {
        success: false,
        error: 'Image prompt cannot be empty',
        duration: 0,
      };
    }

    // Validate prompt length (HuggingFace has limits)
    if (options.prompt.length > 1000) {
      return {
        success: false,
        error: 'Prompt exceeds 1000 character limit',
        duration: 0,
      };
    }

    const width = options.width || 1024;
    const height = options.height || 1024;

    // Validate dimensions
    if (width < 256 || width > 2048 || height < 256 || height > 2048) {
      return {
        success: false,
        error: 'Image dimensions must be between 256 and 2048',
        duration: 0,
      };
    }

    // Call HuggingFace API
    const result = await huggingface.generateImage({
      prompt: options.prompt,
      model: options.model || 'black-forest-labs/FLUX.1-schnell',
      width,
      height,
    });

    const generatedImage: GeneratedImage = {
      imageBase64: result.imageBase64,
      mimeType: result.mimeType,
      model: result.model,
      width,
      height,
      latencyMs: result.latencyMs,
    };

    return {
      success: true,
      data: generatedImage,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[generateImageActivity] Error:', errorMsg);

    return {
      success: false,
      error: `Image generation failed: ${errorMsg}`,
      duration: Date.now() - performance.now(),
    };
  }
}

/**
 * Generate mock/placeholder image for preview purposes
 * Used in UI generation when quick preview is needed before full rendering
 */
export async function generateMockImageActivity(options: {
  title: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
}): Promise<ActivityResult<{ imageBase64: string; mimeType: string }>> {
  try {
    const width = options.width || 1024;
    const height = options.height || 768;
    const bgColor = options.backgroundColor || '#f0f0f0';
    const textColor = options.textColor || '#333333';

    // Create simple SVG placeholder
    const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  <text x="50%" y="50%" text-anchor="middle" dy="0.3em" 
        font-size="32" font-family="Arial" fill="${textColor}"
        dominant-baseline="middle">
    ${escapeXml(options.title)}
  </text>
  <text x="50%" y="60%" text-anchor="middle" dy="0.3em"
        font-size="16" font-family="Arial" fill="#999999"
        dominant-baseline="middle">
    Preview: ${width}x${height}px
  </text>
</svg>`.trim();

    const base64 = Buffer.from(svg).toString('base64');

    return {
      success: true,
      data: {
        imageBase64: base64,
        mimeType: 'image/svg+xml',
      },
      duration: 50,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
}

/**
 * Batch image generation for multiple prompts
 * Used in brand generation when creating multiple visual assets
 */
export async function batchGenerateImagesActivity(options: {
  prompts: Array<{ name: string; prompt: string }>;
  model?: string;
  width?: number;
  height?: number;
  projectId: string;
}): Promise<ActivityResult<GeneratedImage[]>> {
  try {
    const results: GeneratedImage[] = [];
    const errors: string[] = [];

    for (const item of options.prompts) {
      try {
        const result = await generateImageActivity({
          prompt: item.prompt,
          model: options.model,
          width: options.width,
          height: options.height,
          projectId: options.projectId,
        });

        if (result.success && result.data) {
          results.push(result.data);
        } else {
          errors.push(`${item.name}: ${result.error}`);
        }
      } catch (err) {
        errors.push(`${item.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (results.length === 0) {
      return {
        success: false,
        error: `Batch image generation failed: ${errors.join('; ')}`,
        duration: 0,
      };
    }

    // Partial success is acceptable
    return {
      success: results.length > 0,
      data: results,
      duration: 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
}

/**
 * Generate variation of an existing image prompt
 * Used for alternative generation attempts
 */
export async function generateImageVariationActivity(options: {
  basePrompt: string;
  variationType: 'style' | 'layout' | 'color' | 'simplify' | 'enhance';
  projectId: string;
}): Promise<ActivityResult<GeneratedImage>> {
  try {
    let enhancedPrompt = options.basePrompt;

    // Apply variation
    switch (options.variationType) {
      case 'style':
        enhancedPrompt += ', artistic style, painterly';
        break;
      case 'layout':
        enhancedPrompt += ', different composition, centered focus';
        break;
      case 'color':
        enhancedPrompt += ', vibrant colors, high saturation';
        break;
      case 'simplify':
        enhancedPrompt += ', minimalist, clean design';
        break;
      case 'enhance':
        enhancedPrompt += ', detailed, high quality, professional';
        break;
    }

    return await generateImageActivity({
      prompt: enhancedPrompt,
      projectId: options.projectId,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
}

// Helper: Escape XML special characters for SVG
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
