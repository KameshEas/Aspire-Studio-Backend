/**
 * Dead Letter Queue Admin Endpoints (platform admins only)
 * GET /api/v1/admin/dlq - List failed jobs
 * GET /api/v1/admin/dlq/[dlqId] - Get DLQ entry details
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePlatformAdmin, handler } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireAuth(req);
  await requirePlatformAdmin(userId);

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const manualReview = url.searchParams.get('manualReview') !== 'false';

  const where = manualReview ? { manualReview: true } : {};
  const [entries, total] = await Promise.all([
    prisma.deadLetterQueue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.deadLetterQueue.count({ where }),
  ]);

  return NextResponse.json({
    entries: entries.map((entry) => ({
      id: entry.id,
      jobId: entry.jobId,
      reason: entry.reason,
      lastError: entry.lastError,
      retryCount: entry.retryCount,
      manualReview: entry.manualReview,
      reviewedAt: entry.reviewedAt,
      createdAt: entry.createdAt,
    })),
    pagination: { limit, offset, total },
  });
});
