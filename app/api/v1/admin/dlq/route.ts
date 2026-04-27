/**
 * Dead Letter Queue Admin Endpoints
 * GET /api/v1/admin/dlq - List failed jobs
 * GET /api/v1/admin/dlq/[dlqId] - Get DLQ entry details
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: Add admin role check
    // if (auth.user.role !== 'admin') {
    //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    // }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const manualReview = url.searchParams.get('manualReview') !== 'false';

    // List DLQ entries
    const [entries, total] = await Promise.all([
      prisma.deadLetterQueue.findMany({
        where: {
          ...(manualReview && { manualReview: true }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.deadLetterQueue.count({
        where: {
          ...(manualReview && { manualReview: true }),
        },
      }),
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
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    console.error('[API] DLQ listing error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
