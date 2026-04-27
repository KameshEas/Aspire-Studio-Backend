/**
 * Activity Definitions - Types and interfaces for workflow activities
 */

export type ActivityResult<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
};

export type TextGenerationOptions = {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
};

export type ImageGenerationOptions = {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
};

export type ArtifactStorageOptions = {
  content: string | Buffer;
  mimeType: string;
  projectId: string;
  generationId: string;
  fileName?: string;
};

// Activity task definitions
export interface ActivityTask {
  type: string;
  payload: any;
  taskQueue?: string;
  retryPolicy?: {
    maxAttempts: number;
    initialInterval: number;
    backoffCoefficient: number;
  };
  timeout?: number;
}

// Specialized activities
export const activities = {
  // Text generation
  generateText: (options: TextGenerationOptions): ActivityTask => ({
    type: 'generate-text',
    payload: options,
    taskQueue: 'light-worker',
    retryPolicy: {
      maxAttempts: 3,
      initialInterval: 2000,
      backoffCoefficient: 2,
    },
    timeout: 60000,
  }),

  // Image generation (GPU)
  generateImage: (options: ImageGenerationOptions): ActivityTask => ({
    type: 'generate-image',
    payload: options,
    taskQueue: 'gpu-worker',
    retryPolicy: {
      maxAttempts: 5,
      initialInterval: 3000,
      backoffCoefficient: 2,
    },
    timeout: 120000,
  }),

  // Artifact storage
  storeArtifact: (options: ArtifactStorageOptions): ActivityTask => ({
    type: 'store-artifact',
    payload: options,
    taskQueue: 'io-worker',
    retryPolicy: {
      maxAttempts: 3,
      initialInterval: 1000,
      backoffCoefficient: 2,
    },
    timeout: 30000,
  }),

  // Assembly activities
  assemblePDF: (artifactIds: string[]): ActivityTask => ({
    type: 'assemble-pdf',
    payload: { artifactIds },
    taskQueue: 'io-worker',
    retryPolicy: {
      maxAttempts: 2,
      initialInterval: 2000,
      backoffCoefficient: 2,
    },
    timeout: 60000,
  }),

  assembleHTML: (spec: any, content: any[]): ActivityTask => ({
    type: 'assemble-html',
    payload: { spec, content },
    taskQueue: 'io-worker',
    retryPolicy: {
      maxAttempts: 2,
      initialInterval: 2000,
      backoffCoefficient: 2,
    },
    timeout: 60000,
  }),

  // Validation
  validateInput: (input: any): ActivityTask => ({
    type: 'validate-input',
    payload: input,
    taskQueue: 'light-worker',
    timeout: 5000,
  }),

  // Template processing
  templatePrompt: (template: any, variables: any): ActivityTask => ({
    type: 'template-prompt',
    payload: { template, variables },
    taskQueue: 'light-worker',
    timeout: 5000,
  }),
};

// Activity implementations are in ./activities/ folder
