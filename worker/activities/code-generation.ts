/**
 * Code Generation Activities
 * Handles component code generation, linting, build, and preview
 */

import { groq } from '../../lib/providers/groq';
import type { ActivityResult } from '../../lib/workflow/activities';
import type { ComponentSpec } from './ui-generation';

export interface GeneratedCode {
  componentName: string;
  code: string;
  language: 'typescript' | 'javascript' | 'tsx' | 'jsx';
  dependencies: string[];
}

export interface BuildResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  bundleSize: number;
  buildTime: number;
}

/**
 * Generate React component code from specification
 * Uses LLM to create production-ready component implementations
 */
export async function generateComponentCodeActivity(options: {
  componentSpec: ComponentSpec;
  template?: 'functional' | 'class' | 'hook';
  includeTests?: boolean;
  includeStories?: boolean;
}): Promise<ActivityResult<GeneratedCode>> {
  try {
    const template = options.template || 'functional';
    const componentJson = JSON.stringify(options.componentSpec, null, 2);

    const prompt = `
Generate a production-ready React component (TypeScript/TSX) based on this specification:

${componentJson}

Requirements:
1. Use ${template} component pattern
2. Include proper TypeScript types for all props
3. Use Tailwind CSS for styling (from the component spec styling field)
4. Include error boundaries and loading states where appropriate
5. Make the component accessible (ARIA attributes)
6. Add JSDoc comments for documentation
${options.includeTests ? '7. Include unit test suggestions as comments' : ''}
${options.includeStories ? '7. Include Storybook story suggestions as comments' : ''}

Return ONLY the TSX code, no markdown or explanations.

Start with imports, then interfaces/types, then the component.`;

    const response = await groq.generateText({
      prompt,
      model: 'mixtral-8x7b-32768',
      maxTokens: 3000,
      temperature: 0.5, // Lower temp for code generation
    });

    // Extract dependencies from generated code
    const dependencies = extractDependencies(response.text);

    return {
      success: true,
      data: {
        componentName: options.componentSpec.name,
        code: response.text,
        language: 'tsx',
        dependencies,
      },
      duration: 0,
    };
  } catch (error) {
    console.error('[generateComponentCodeActivity] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: 0,
    };
  }
}

/**
 * Generate batch component code from multiple specs
 * Used to generate entire UI component library
 */
export async function batchGenerateComponentsActivity(options: {
  components: ComponentSpec[];
  includeIndex?: boolean;
}): Promise<ActivityResult<GeneratedCode[]>> {
  try {
    const results: GeneratedCode[] = [];
    const errors: string[] = [];

    for (const componentSpec of options.components) {
      try {
        const result = await generateComponentCodeActivity({
          componentSpec,
          template: 'functional',
          includeTests: false,
          includeStories: false,
        });

        if (result.success && result.data) {
          results.push(result.data);
        } else {
          errors.push(`${componentSpec.name}: ${result.error}`);
        }
      } catch (err) {
        errors.push(`${componentSpec.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Generate index.ts if requested
    if (options.includeIndex && results.length > 0) {
      const exportStatements = results
        .map((comp) => `export { default as ${comp.componentName} } from './${comp.componentName}';`)
        .join('\n');

      results.push({
        componentName: 'index',
        code: exportStatements,
        language: 'typescript',
        dependencies: [],
      });
    }

    if (results.length === 0) {
      return {
        success: false,
        error: `Batch component generation failed: ${errors.join('; ')}`,
        duration: 0,
      };
    }

    return {
      success: true,
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
 * Lint generated code using ESLint rules
 * Validates code quality and style compliance
 */
export async function lintCodeActivity(options: {
  code: string;
  rules?: {
    maxLineLength?: number;
    requireJsDoc?: boolean;
    requireTypeAnnotations?: boolean;
  };
}): Promise<ActivityResult<{ issues: Array<{ line: number; message: string; severity: 'error' | 'warn' }> }>> {
  try {
    const issues: Array<{ line: number; message: string; severity: 'error' | 'warn' }> = [];
    const lines = options.code.split('\n');

    const maxLineLength = options.rules?.maxLineLength || 100;
    const requireJsDoc = options.rules?.requireJsDoc !== false;
    const requireTypeAnnotations = options.rules?.requireTypeAnnotations !== false;

    // Basic linting rules
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check line length
      if (line.length > maxLineLength) {
        issues.push({
          line: lineNum,
          message: `Line length ${line.length} exceeds ${maxLineLength}`,
          severity: 'warn',
        });
      }

      // Check for console statements
      if (/^\s*console\.(log|warn|error)/.test(line)) {
        issues.push({
          line: lineNum,
          message: 'Remove console statements in production code',
          severity: 'warn',
        });
      }

      // Check for function definitions without JSDoc
      if (requireJsDoc && /^\s*(export\s+)?function\s+\w+/.test(line)) {
        if (i > 0 && !lines[i - 1].includes('/**')) {
          issues.push({
            line: lineNum,
            message: 'Function should have JSDoc comment',
            severity: 'warn',
          });
        }
      }

      // Check for untyped variables
      if (requireTypeAnnotations && /const\s+\w+\s*=/.test(line) && !line.includes(':')) {
        issues.push({
          line: lineNum,
          message: 'Variable should have explicit type annotation',
          severity: 'warn',
        });
      }
    }

    return {
      success: issues.filter((i) => i.severity === 'error').length === 0,
      data: { issues },
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
 * Mock build activity
 * In production, would run actual build tools (webpack, esbuild, vite)
 */
export async function buildComponentsActivity(options: {
  componentCodes: GeneratedCode[];
  minify?: boolean;
  sourceMaps?: boolean;
}): Promise<ActivityResult<BuildResult>> {
  try {
    // Simulate build process
    let totalSize = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const component of options.componentCodes) {
      // Basic validation
      if (!component.code.includes('export')) {
        errors.push(`${component.componentName}: Missing export statement`);
      }

      // Calculate approximate bundle size
      const codeSize = options.minify
        ? Math.floor(component.code.length * 0.4) // ~60% reduction with minification
        : component.code.length;

      totalSize += codeSize;

      // Check for common issues
      if (component.code.includes('console.')) {
        warnings.push(`${component.componentName}: Contains console statements`);
      }
      if (component.code.length > 10000) {
        warnings.push(`${component.componentName}: Component is large (${component.code.length} bytes)`);
      }
    }

    // Calculate final bundle size with overhead
    const finalBundleSize = totalSize + (options.minify ? 2000 : 5000);

    return {
      success: errors.length === 0,
      data: {
        success: errors.length === 0,
        errors,
        warnings,
        bundleSize: finalBundleSize,
        buildTime: Math.random() * 5000 + 1000, // 1-6 seconds
      },
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
 * Generate preview package (zip) with all components
 * Creates downloadable artifact with component code, README, and example usage
 */
export async function generatePreviewPackageActivity(options: {
  componentCodes: GeneratedCode[];
  packageName: string;
  projectId: string;
}): Promise<ActivityResult<{ zipBase64: string; fileName: string; mimeType: string }>> {
  try {
    // In production, would create actual zip file
    // For now, create a JSON representation of the package
    const packageContent = {
      name: options.packageName,
      version: '1.0.0',
      description: 'Generated components from Aspire Studio',
      components: options.componentCodes.map((c) => ({
        name: c.componentName,
        language: c.language,
        size: c.code.length,
        dependencies: c.dependencies,
      })),
      generatedAt: new Date().toISOString(),
    };

    const jsonStr = JSON.stringify(packageContent, null, 2);
    const base64 = Buffer.from(jsonStr).toString('base64');

    return {
      success: true,
      data: {
        zipBase64: base64,
        fileName: `${options.packageName}-${Date.now()}.json`,
        mimeType: 'application/json',
      },
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
 * Generate test file for component
 * Creates unit test boilerplate using Vitest/Jest conventions
 */
export async function generateComponentTestsActivity(options: {
  componentCode: GeneratedCode;
}): Promise<ActivityResult<{ testCode: string }>> {
  try {
    const prompt = `
Generate a Vitest unit test file for this React component:

${options.componentCode.code}

Requirements:
1. Use Vitest syntax
2. Include tests for:
   - Component rendering
   - Props rendering
   - User interactions (if applicable)
   - Error states
3. Use React Testing Library
4. Mock external dependencies
5. Include snapshots (if appropriate)

Return ONLY the test code, no markdown.`;

    const response = await groq.generateText({
      prompt,
      model: 'mixtral-8x7b-32768',
      maxTokens: 2000,
      temperature: 0.5,
    });

    return {
      success: true,
      data: { testCode: response.text },
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

// Helper: Extract dependencies from generated code
function extractDependencies(code: string): string[] {
  const deps = new Set<string>();

  // Match import statements
  const importRegex = /import\s+(?:.*?\s+)?from\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[1];
    // Extract package name (ignore relative imports)
    if (!importPath.startsWith('.')) {
      const pkgName = importPath.split('/')[0];
      deps.add(pkgName);
    }
  }

  return Array.from(deps);
}
