/**
 * Artifact Storage Activity Handler
 * Handles storing generation results to object storage (S3/GCS)
 */

import { storage } from '../../lib/storage';
import { prisma } from '../../lib/prisma';
import { ActivityResult, ArtifactStorageOptions } from '../../lib/workflow/activities';

export async function storeArtifactActivity(
  options: ArtifactStorageOptions
): Promise<ActivityResult<{ artifactId: string; url: string }>> {
  try {
    const startTime = Date.now();

    const fileName =
      options.fileName ||
      `artifact-${Date.now()}.${getMimeTypeExtension(options.mimeType)}`;

    const storagePath = `orgs/${options.projectId.split('-')[0]}/projects/${options.projectId}/artifacts/${options.generationId}/${fileName}`;

    // Upload to storage
    const uploadUrl = await storage.upload(storagePath, options.content, {
      contentType: options.mimeType,
    });

    // Create artifact record in DB
    const artifact = await prisma.artifact.create({
      data: {
        generationId: '', // Will be linked via Generation record
        projectId: options.projectId,
        orgId: options.projectId.split('-')[0], // Simplified; should come from context
        type: mimeTypeToArtifactType(options.mimeType),
        storageUrl: uploadUrl,
        fileName,
        sizeBytes: BigInt(
          typeof options.content === 'string'
            ? options.content.length
            : options.content.length
        ),
      },
    });

    return {
      success: true,
      data: {
        artifactId: artifact.id,
        url: uploadUrl,
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
 * Assemble PDF Activity (Stub)
 */
export async function assemblePdfActivity(
  artifactIds: string[]
): Promise<ActivityResult> {
  // Phase 2: Implement PDF assembly from multiple artifacts
  return {
    success: false,
    error: 'PDF assembly deferred to Phase 2',
  };
}

/**
 * Assemble HTML Activity
 */
export async function assembleHtmlActivity(
  spec: any,
  content: any[]
): Promise<ActivityResult> {
  try {
    // Phase 2: Implement HTML assembly from UI spec and content
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Generated Page</title>
</head>
<body>
  <h1>Generated Content</h1>
  <p>Content assembly placeholder</p>
</body>
</html>`;

    return {
      success: true,
      data: { html },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Helper functions
function getMimeTypeExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'text/plain': 'txt',
    'text/html': 'html',
    'application/json': 'json',
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
  };
  return map[mimeType] || 'bin';
}

function mimeTypeToArtifactType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/html') return 'html';
  if (mimeType.startsWith('text/')) return 'text';
  return 'text';
}
