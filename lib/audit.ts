import prisma from "./prisma";

export async function auditLog(
  action: string,
  opts: {
    actorId?: string | null;
    orgId?: string | null;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        actorId: opts.actorId ?? null,
        orgId: opts.orgId ?? null,
        resourceType: opts.resourceType ?? null,
        resourceId: opts.resourceId ?? null,
        details: opts.details ?? undefined,
      },
    });
  } catch (err) {
    console.error("[AUDIT] Failed to write audit log:", err);
  }
}
