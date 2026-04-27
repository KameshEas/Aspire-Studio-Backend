/**
 * Text Generation Activity Handler
 * Handles text generation requests via Groq LLM provider
 */

import { groq } from '../providers/groq';
import { prisma } from '../prisma';
import { ActivityResult, TextGenerationOptions } from './types';

export async function generateTextActivity(
  options: TextGenerationOptions
): Promise<ActivityResult<{ artifactId: string; text: string }>> {
  try {
    const startTime = Date.now();

    const result = await groq.generateText({
      prompt: options.prompt,
      model: options.model || 'mixtral-8x7b-32768',
      maxTokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.7,
      systemPrompt: options.systemPrompt,
    });

    return {
      success: true,
      data: {
        artifactId: result.generationId || '',
        text: result.text,
      },
      duration: Date.now() - startTime,
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
 * Image Generation Activity Handler (Stub for Phase 2)
 */
export async function generateImageActivity(options: {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
}): Promise<ActivityResult> {
  // Phase 2: Implement with HuggingFace GPU worker
  return {
    success: false,
    error: 'Image generation deferred to Phase 2',
  };
}

/**
 * Validate Input Activity
 */
export async function validateInputActivity(input: {
  tenantId: string;
  projectId: string;
  payload: any;
}): Promise<ActivityResult> {
  try {
    if (!input.tenantId || !input.projectId) {
      return {
        success: false,
        error: 'Missing tenantId or projectId',
      };
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
    });

    if (!project) {
      return {
        success: false,
        error: `Project ${input.projectId} not found`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Template Prompt Activity
 * Interpolates variables into prompt template
 */
export async function templatePromptActivity(input: {
  template: string;
  variables?: Record<string, any>;
}): Promise<ActivityResult<{ prompt: string }>> {
  try {
    let prompt = input.template;

    if (input.variables) {
      for (const [key, value] of Object.entries(input.variables)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        prompt = prompt.replace(regex, String(value));
      }
    }

    return {
      success: true,
      data: { prompt },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
