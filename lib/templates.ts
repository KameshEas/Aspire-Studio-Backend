/**
 * Template interpolation, validation, and utility functions
 * Handles variable substitution, schema validation, and token estimation
 */

// ─── Type Definitions ───────────────────────────────────────
export interface VariableDefinition {
  name?: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date';
  label?: string;
  description?: string;
  required?: boolean;
  default?: any;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  options?: string[];
}

export interface VariablesSchema {
  [variableName: string]: VariableDefinition;
}

export interface InterpolationWarning {
  type: 'unused_variable' | 'missing_variable' | 'invalid_type';
  variable: string;
  message: string;
}

export interface InterpolationResult {
  interpolatedPrompt: string;
  warnings: InterpolationWarning[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// ─── Variable Validation ────────────────────────────────────
/**
 * Validate that user-provided variables conform to the schema
 */
export function validateVariables(
  data: Record<string, any>,
  schema?: VariablesSchema
): ValidationResult {
  const errors: string[] = [];

  if (!schema || typeof schema !== 'object') {
    return { isValid: true, errors: [] };
  }

  for (const [name, definition] of Object.entries(schema)) {
    const value = data?.[name];

    // Check required
    if (definition.required && (value === undefined || value === null || value === '')) {
      errors.push(`Variable "${name}" is required`);
      continue;
    }

    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Type checking
    switch (definition.type) {
      case 'text':
      case 'textarea':
        if (typeof value !== 'string') {
          errors.push(`Variable "${name}" must be a string, got ${typeof value}`);
        } else {
          if (definition.minLength && value.length < definition.minLength) {
            errors.push(
              `Variable "${name}" must be at least ${definition.minLength} characters`
            );
          }
          if (definition.maxLength && value.length > definition.maxLength) {
            errors.push(
              `Variable "${name}" must be at most ${definition.maxLength} characters`
            );
          }
          if (definition.pattern) {
            try {
              const regex = new RegExp(definition.pattern);
              if (!regex.test(value)) {
                errors.push(`Variable "${name}" does not match pattern ${definition.pattern}`);
              }
            } catch {
              errors.push(`Invalid regex pattern for variable "${name}"`);
            }
          }
        }
        break;

      case 'number':
        const numValue = Number(value);
        if (isNaN(numValue)) {
          errors.push(`Variable "${name}" must be a valid number`);
        } else {
          if (definition.minimum !== undefined && numValue < definition.minimum) {
            errors.push(`Variable "${name}" must be >= ${definition.minimum}`);
          }
          if (definition.maximum !== undefined && numValue > definition.maximum) {
            errors.push(`Variable "${name}" must be <= ${definition.maximum}`);
          }
        }
        break;

      case 'select':
        if (!definition.options?.includes(String(value))) {
          errors.push(
            `Variable "${name}" must be one of: ${definition.options?.join(', ')}`
          );
        }
        break;

      case 'checkbox':
        if (typeof value !== 'boolean') {
          errors.push(`Variable "${name}" must be a boolean`);
        }
        break;

      case 'date':
        if (!(value instanceof Date) && typeof value !== 'string') {
          errors.push(`Variable "${name}" must be a valid date`);
        }
        break;
    }
  }

  return { isValid: errors.length === 0, errors };
}

// ─── Template Interpolation ────────────────────────────────
/**
 * Replace {{variable}} placeholders with actual values
 * Returns interpolated prompt + warnings about unused/missing variables
 */
export function interpolateTemplate(
  prompt: string,
  variables: Record<string, any> = {},
  schema?: VariablesSchema
): InterpolationResult {
  const warnings: InterpolationWarning[] = [];
  let result = prompt;

  // Find all {{variable}} patterns
  const variableRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  const foundVariables = new Set<string>();
  let match;

  while ((match = variableRegex.exec(prompt)) !== null) {
    const varName = match[1];
    foundVariables.add(varName);

    if (!(varName in variables)) {
      warnings.push({
        type: 'missing_variable',
        variable: varName,
        message: `Variable "${varName}" used in prompt but not provided`,
      });
      // Replace with placeholder
      result = result.replace(
        new RegExp(`\\{\\{${varName}\\}\\}`, 'g'),
        `[${varName}]`
      );
    } else {
      const value = variables[varName];
      // Escape special regex characters in the replacement
      const escapedValue = String(value).replace(/[\\$&]/g, '\\$&');
      result = result.replace(
        new RegExp(`\\{\\{${varName}\\}\\}`, 'g'),
        escapedValue
      );
    }
  }

  // Check for unused variables
  if (schema) {
    for (const varName of Object.keys(schema)) {
      if (!foundVariables.has(varName) && varName in variables) {
        warnings.push({
          type: 'unused_variable',
          variable: varName,
          message: `Variable "${varName}" provided but not used in prompt`,
        });
      }
    }
  }

  return { interpolatedPrompt: result, warnings };
}

// ─── Variable Extraction ────────────────────────────────────
/**
 * Extract all {{variable}} names from a prompt
 */
export function extractVariablesFromPrompt(prompt: string): string[] {
  const variableRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  const variables = new Set<string>();
  let match;

  while ((match = variableRegex.exec(prompt)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables).sort();
}

// ─── Schema Validation ──────────────────────────────────────
/**
 * Validate that a variablesSchema object is well-formed
 */
export function validateVariablesSchema(schema?: any): ValidationResult {
  const errors: string[] = [];

  if (!schema || typeof schema !== 'object') {
    return { isValid: true, errors: [] };
  }

  const validTypes = ['text', 'textarea', 'number', 'select', 'checkbox', 'date'];

  for (const [name, definition] of Object.entries(schema)) {
    // Validate variable name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      errors.push(
        `Variable name "${name}" must match /^[a-zA-Z_][a-zA-Z0-9_]*$/`
      );
    }

    if (typeof definition !== 'object' || !definition) {
      errors.push(`Variable "${name}" definition must be an object`);
      continue;
    }

    const def = definition as any;

    if (!validTypes.includes(def.type)) {
      errors.push(`Variable "${name}" type must be one of: ${validTypes.join(', ')}`);
    }

    // Validate select options
    if (def.type === 'select') {
      if (!Array.isArray(def.options) || def.options.length === 0) {
        errors.push(
          `Variable "${name}" of type select must have non-empty options array`
        );
      }
    }

    // Validate pattern
    if (def.pattern && typeof def.pattern !== 'string') {
      errors.push(`Variable "${name}" pattern must be a string`);
    } else if (def.pattern) {
      try {
        new RegExp(def.pattern);
      } catch {
        errors.push(
          `Variable "${name}" pattern is not a valid regex: ${def.pattern}`
        );
      }
    }

    // Validate length constraints
    if (def.minLength !== undefined) {
      if (typeof def.minLength !== 'number' || def.minLength < 0) {
        errors.push(`Variable "${name}" minLength must be a non-negative number`);
      }
    }

    if (def.maxLength !== undefined) {
      if (typeof def.maxLength !== 'number' || def.maxLength < 0) {
        errors.push(`Variable "${name}" maxLength must be a non-negative number`);
      }
    }

    // Validate numeric constraints
    if (def.minimum !== undefined) {
      if (typeof def.minimum !== 'number') {
        errors.push(`Variable "${name}" minimum must be a number`);
      }
    }

    if (def.maximum !== undefined) {
      if (typeof def.maximum !== 'number') {
        errors.push(`Variable "${name}" maximum must be a number`);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}

// ─── Token Estimation ───────────────────────────────────────
/**
 * Simple client-side token estimation
 * Uses heuristic: ~1.3 tokens per word (reasonable approximation for English)
 * For accurate counts, use tiktoken library with actual model tokenizer
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  const words = text.trim().split(/\s+/).length;
  const estimatedTokens = Math.ceil(words * 1.3);

  // Estimate includes punctuation, special chars (rough +5%)
  return Math.ceil(estimatedTokens * 1.05);
}

// ─── Test Data Generation ───────────────────────────────────
/**
 * Generate sample data from schema for preview/testing
 */
export function generateTestData(schema?: VariablesSchema): Record<string, any> {
  const testData: Record<string, any> = {};

  if (!schema) return testData;

  for (const [name, definition] of Object.entries(schema)) {
    if (definition.default !== undefined) {
      testData[name] = definition.default;
    } else {
      switch (definition.type) {
        case 'text':
          testData[name] = `Sample ${name}`;
          break;
        case 'textarea':
          testData[name] = `Sample ${name}\nThis is a multi-line example.\nWith multiple sentences.`;
          break;
        case 'number':
          testData[name] = definition.minimum ?? 0;
          break;
        case 'select':
          testData[name] = definition.options?.[0] ?? '';
          break;
        case 'checkbox':
          testData[name] = true;
          break;
        case 'date':
          testData[name] = new Date().toISOString().split('T')[0];
          break;
      }
    }
  }

  return testData;
}

// ─── Schema Merging ────────────────────────────────────────
/**
 * Merge auto-detected variables with existing schema
 * Keeps existing definitions, adds new detected vars as text fields
 */
export function mergeVariablesSchema(
  detected: string[],
  existing?: VariablesSchema
): VariablesSchema {
  const merged = { ...existing } || {};

  for (const varName of detected) {
    if (!(varName in merged)) {
      merged[varName] = {
        type: 'text',
        required: true,
        description: `Auto-detected variable`,
      };
    }
  }

  return merged;
}

// ─── Schema Comparison ──────────────────────────────────────
/**
 * Check if a schema has been modified
 */
export function hasSchemaChanged(
  oldSchema?: VariablesSchema,
  newSchema?: VariablesSchema
): boolean {
  const oldJSON = JSON.stringify(oldSchema || {});
  const newJSON = JSON.stringify(newSchema || {});
  return oldJSON !== newJSON;
}

// ─── Export all for convenience ─────────────────────────────
export const templates = {
  validateVariables,
  interpolateTemplate,
  extractVariablesFromPrompt,
  validateVariablesSchema,
  estimateTokens,
  generateTestData,
  mergeVariablesSchema,
  hasSchemaChanged,
};
