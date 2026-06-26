import { NextRequest, NextResponse } from "next/server";
import { CORS_HEADERS, SECURITY_HEADERS } from "./cors";
import prisma from "./prisma";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

function getClientKey(req: NextRequest): string {
  return req.headers.get("authorization")?.slice(0, 50) || req.headers.get("x-forwarded-for") || "anonymous";
}

export function rateLimit(limit: number, windowMs: number) {
  return function <T extends (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>>(fn: T): T {
    return (async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
      cleanup();
      const key = `${getClientKey(req)}:${req.nextUrl.pathname}`;
      const now = Date.now();
      const entry = store.get(key);

      if (entry && entry.resetAt > now) {
        if (entry.count >= limit) {
          const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
          return NextResponse.json(
            { error: "Rate limit exceeded" },
            {
              status: 429,
              headers: {
                ...CORS_HEADERS,
                ...SECURITY_HEADERS,
                "Retry-After": String(retryAfter),
              },
            },
          );
        }
        entry.count++;
      } else {
        store.set(key, { count: 1, resetAt: now + windowMs });
      }

      return fn(req, ctx);
    }) as T;
  };
}

// ─── Token Budget Management ────────────────────────────────

export interface TokenBudgetStatus {
  monthlyUsed: number;
  monthlyQuota: number;
  monthlyRemaining: number;
  monthlyPercentage: number;
  dailyProjectUsed?: number;
  dailyProjectQuota?: number;
  dailyProjectRemaining?: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
  status?: TokenBudgetStatus;
}

/**
 * Check if organization can make a generation request based on token budget
 * Requires database access - should be called from API route, not middleware
 */
export async function checkTokenBudget(
  orgId: string,
  projectId: string,
  userId: string,
  estimatedTokens: number
): Promise<BudgetCheckResult> {
  try {
    // Get org subscription plan
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        subscriptions: {
          where: { status: 'active' },
          include: { plan: true },
          take: 1,
        },
      },
    });

    if (!org || !org.subscriptions[0]) {
      return {
        allowed: false,
        reason: 'No active subscription found for organization',
      };
    }

    const plan = org.subscriptions[0].plan;
    const monthlyQuota =
      ((plan.features as any)?.monthlyTokens as number) || 1000000;

    // Get monthly usage (this month)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyUsage = await prisma.usageRecord.aggregate({
      where: {
        orgId,
        recordedAt: { gte: monthStart },
      },
      _sum: { tokensIn: true, tokensOut: true },
    });

    const totalUsed =
      (monthlyUsage._sum.tokensIn || 0) + (monthlyUsage._sum.tokensOut || 0);

    // Check monthly budget
    if (totalUsed + estimatedTokens > monthlyQuota) {
      return {
        allowed: false,
        reason: `Monthly token quota exceeded. Used: ${totalUsed}/${monthlyQuota}, Requested: ${estimatedTokens}`,
        status: {
          monthlyUsed: totalUsed,
          monthlyQuota,
          monthlyRemaining: Math.max(0, monthlyQuota - totalUsed),
          monthlyPercentage: (totalUsed / monthlyQuota) * 100,
        },
      };
    }

    // Check project daily quota (if set)
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    const dailyQuota = (project?.settings as any)?.dailyTokenQuota as
      | number
      | undefined;

    if (dailyQuota) {
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);

      const dailyUsage = await prisma.usageRecord.aggregate({
        where: {
          projectId,
          recordedAt: { gte: dayStart },
        },
        _sum: { tokensIn: true, tokensOut: true },
      });

      const dailyUsed =
        (dailyUsage._sum.tokensIn || 0) + (dailyUsage._sum.tokensOut || 0);

      if (dailyUsed + estimatedTokens > dailyQuota) {
        return {
          allowed: false,
          reason: `Daily project quota exceeded for today. Used: ${dailyUsed}/${dailyQuota}`,
          retryAfter: 86400,
        };
      }
    }

    return {
      allowed: true,
      status: {
        monthlyUsed: totalUsed,
        monthlyQuota,
        monthlyRemaining: monthlyQuota - totalUsed,
        monthlyPercentage: (totalUsed / monthlyQuota) * 100,
        dailyProjectQuota: dailyQuota,
      },
    };
  } catch (error) {
    console.error('Error checking token budget:', error);
    // On error, allow the request to proceed (fail open)
    return { allowed: true };
  }
}

/**
 * Record token usage after a generation
 */
export async function recordUsage(
  orgId: string,
  projectId: string,
  generationId: string,
  model: string,
  provider: string,
  tokensIn: number,
  tokensOut: number,
  costUsd: number
) {
  await prisma.usageRecord.create({
    data: {
      orgId,
      projectId,
      generationId,
      modelProvider: provider,
      modelName: model,
      tokensIn,
      tokensOut,
      costCents: Math.round(costUsd * 100),
    },
  });
}
