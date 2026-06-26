/**
 * Code Generation Workflow
 * Orchestrates: component code generation → linting → build → preview package
 *
 * Task Queue: light-worker for code generation (LLM), build-worker for build/lint
 * Timeout: 15 minutes
 * Retries: Per-activity (via Bull queue retry logic)
 */

import { WorkflowInput, WorkflowOutput } from '../../lib/workflow/engine';
import {
  batchGenerateComponentsActivity,
  lintCodeActivity,
  buildComponentsActivity,
  generatePreviewPackageActivity,
  generateComponentTestsActivity,
} from '../activities/code-generation';
import { storeArtifactActivity } from '../activities/storage';
import type { ComponentSpec } from '../activities/ui-generation';

export async function codeGenerateWorkflow(
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

    // Step 2: Extract component specifications from payload
    const { components = [] } = input.payload || {};

    if (!Array.isArray(components) || components.length === 0) {
      throw new Error('No components provided in payload');
    }

    const typedComponents: ComponentSpec[] = components as ComponentSpec[];

    // Step 3: Generate component code for all components
    console.log(`[codeGenerateWorkflow] Generating code for ${typedComponents.length} components...`);
    const codegenResult = await batchGenerateComponentsActivity({
      components: typedComponents,
      includeIndex: true,
    });

    if (!codegenResult.success || !codegenResult.data) {
      errors.push({
        activity: 'batchGenerateComponentsActivity',
        message: codegenResult.error || 'Component code generation failed',
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Code generation failed: ${codegenResult.error}`);
    }

    const generatedCodes = codegenResult.data;
    console.log(`[codeGenerateWorkflow] Generated ${generatedCodes.length} code files`);

    // Step 4: Lint each component
    console.log('[codeGenerateWorkflow] Linting components...');
    const lintIssues: Record<string, Record<string, any>> = {};

    for (const codeFile of generatedCodes) {
      const lintResult = await lintCodeActivity({
        code: codeFile.code,
        rules: {
          maxLineLength: 100,
          requireJsDoc: true,
          requireTypeAnnotations: true,
        },
      });

      if (!lintResult.success) {
        console.warn(`[codeGenerateWorkflow] Linting warnings for ${codeFile.componentName}:`, lintResult.data);
        lintIssues[codeFile.componentName] = lintResult.data?.issues || [];
      }
    }

    // Step 5: Build components
    console.log('[codeGenerateWorkflow] Building components...');
    const buildResult = await buildComponentsActivity({
      componentCodes: generatedCodes,
      minify: true,
      sourceMaps: false,
    });

    if (!buildResult.success || !buildResult.data) {
      errors.push({
        activity: 'buildComponentsActivity',
        message: buildResult.error || 'Build failed',
        timestamp: new Date().toISOString(),
      });
      // Continue - build warnings don't stop the workflow
    } else {
      console.log(
        `[codeGenerateWorkflow] Build successful: ${buildResult.data.bundleSize} bytes, ${buildResult.data.buildTime.toFixed(0)}ms`,
      );

      // Store build stats
      if (buildResult.data.warnings.length > 0) {
        console.warn('[codeGenerateWorkflow] Build warnings:', buildResult.data.warnings);
      }
    }

    // Step 6: Store generated component files as artifacts
    console.log('[codeGenerateWorkflow] Storing component artifacts...');

    for (const codeFile of generatedCodes) {
      try {
        const storageResult = await storeArtifactActivity({
          content: codeFile.code,
          mimeType: 'text/plain',
          projectId: input.projectId,
          generationId: input.generationId || `code-gen-${Date.now()}`,
          fileName: `${codeFile.componentName}.${codeFile.language}`,
        });

        if (storageResult.success) {
          artifacts.push({
            id: storageResult.data?.artifactId || '',
            name: codeFile.componentName,
            type: 'code',
            url: storageResult.data?.url || '',
            mimeType: `text/${codeFile.language}`,
            metadata: {
              dependencies: codeFile.dependencies,
              language: codeFile.language,
            },
          });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push({
          activity: 'storeArtifactActivity',
          message: `Failed to store ${codeFile.componentName}: ${errMsg}`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Step 7: Generate package.json with all dependencies
    console.log('[codeGenerateWorkflow] Generating package.json...');
    const allDependencies = new Set<string>();
    for (const code of generatedCodes) {
      code.dependencies.forEach((dep) => allDependencies.add(dep));
    }

    const packageJson = {
      name: 'generated-components',
      version: '1.0.0',
      description: 'Components generated by Aspire Studio',
      dependencies: Array.from(allDependencies).reduce(
        (acc, dep) => {
          acc[dep] = '^latest';
          return acc;
        },
        {} as Record<string, string>,
      ),
      devDependencies: {
        typescript: '^5.0.0',
        react: '^18.0.0',
        'react-dom': '^18.0.0',
      },
      scripts: {
        build: 'tsc',
        test: 'vitest',
      },
    };

    const packageJsonResult = await storeArtifactActivity({
      content: JSON.stringify(packageJson, null, 2),
      mimeType: 'application/json',
      projectId: input.projectId,
      generationId: input.generationId || `code-gen-${Date.now()}`,
      fileName: 'package.json',
    });

    if (packageJsonResult.success) {
      artifacts.push({
        id: packageJsonResult.data?.artifactId || '',
        name: 'package.json',
        type: 'config',
        url: packageJsonResult.data?.url || '',
        mimeType: 'application/json',
      });
    }

    // Step 8: Generate test files for first 3 components (to avoid explosion)
    console.log('[codeGenerateWorkflow] Generating tests for components...');
    const testFilesToGenerate = generatedCodes.slice(0, Math.min(3, generatedCodes.length));

    for (const codeFile of testFilesToGenerate) {
      try {
        const testResult = await generateComponentTestsActivity({
          componentCode: codeFile,
        });

        if (testResult.success && testResult.data) {
          const testStorageResult = await storeArtifactActivity({
            content: testResult.data.testCode,
            mimeType: 'text/plain',
            projectId: input.projectId,
            generationId: input.generationId || `code-gen-${Date.now()}`,
            fileName: `${codeFile.componentName}.test.${codeFile.language}`,
          });

          if (testStorageResult.success) {
            artifacts.push({
              id: testStorageResult.data?.artifactId || '',
              name: `${codeFile.componentName} Tests`,
              type: 'test',
              url: testStorageResult.data?.url || '',
              mimeType: 'text/plain',
            });
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[codeGenerateWorkflow] Failed to generate tests for ${codeFile.componentName}:`, errMsg);
      }
    }

    // Step 9: Generate preview package (zip)
    console.log('[codeGenerateWorkflow] Generating preview package...');
    const packageResult = await generatePreviewPackageActivity({
      componentCodes: generatedCodes,
      packageName: `components-${input.projectId}`,
      projectId: input.projectId,
    });

    if (packageResult.success && packageResult.data) {
      const packageStorageResult = await storeArtifactActivity({
        content: Buffer.from(packageResult.data.zipBase64, 'base64'),
        mimeType: packageResult.data.mimeType,
        projectId: input.projectId,
        generationId: input.generationId || `code-gen-${Date.now()}`,
        fileName: packageResult.data.fileName,
      });

      if (packageStorageResult.success) {
        artifacts.push({
          id: packageStorageResult.data?.artifactId || '',
          name: 'Preview Package',
          type: 'package',
          url: packageStorageResult.data?.url || '',
          mimeType: packageResult.data.mimeType,
        });
      }
    }

    // Step 10: Store build report
    if (buildResult.data) {
      const buildReport = {
        timestamp: new Date().toISOString(),
        success: buildResult.data.success,
        bundleSize: buildResult.data.bundleSize,
        buildTime: buildResult.data.buildTime,
        warnings: buildResult.data.warnings,
        errors: buildResult.data.errors,
        componentCount: generatedCodes.length,
        lintIssues,
      };

      const reportResult = await storeArtifactActivity({
        content: JSON.stringify(buildReport, null, 2),
        mimeType: 'application/json',
        projectId: input.projectId,
        generationId: input.generationId || `code-gen-${Date.now()}`,
        fileName: 'build-report.json',
      });

      if (reportResult.success) {
        artifacts.push({
          id: reportResult.data?.artifactId || '',
          name: 'Build Report',
          type: 'report',
          url: reportResult.data?.url || '',
          mimeType: 'application/json',
        });
      }
    }

    console.log(`[codeGenerateWorkflow] Complete: ${artifacts.length} artifacts generated`);

    return {
      artifacts,
      errors,
      metrics: {
        totalDurationMs: Date.now() - startTime,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        componentCount: generatedCodes.length,
        artifactCount: artifacts.length,
        bundleSize: buildResult.data?.bundleSize || 0,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[codeGenerateWorkflow] Fatal error:', errorMsg);

    return {
      artifacts,
      errors: [
        ...errors,
        {
          activity: 'codeGenerateWorkflow',
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
