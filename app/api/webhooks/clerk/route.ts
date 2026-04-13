import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import prisma from "@/lib/prisma";
import { auditLog } from "@/lib/audit";

const processedWebhooks = new Map<string, number>();
const MAX_CACHE_SIZE = 5000;

function isDuplicate(svixId: string): boolean {
  const now = Date.now();
  if (processedWebhooks.has(svixId)) return true;
  if (processedWebhooks.size >= MAX_CACHE_SIZE) {
    for (const [key, ts] of processedWebhooks) {
      if (now - ts > 300_000) processedWebhooks.delete(key);
    }
  }
  processedWebhooks.set(svixId, now);
  return false;
}

export async function POST(req: NextRequest) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();

  let event: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const { type, data } = event;

  if (isDuplicate(svixId)) {
    return NextResponse.json({ received: true });
  }

  if (type === "user.created" || type === "user.updated") {
    const clerkId = data.id as string;
    const emailObj = (data.email_addresses as Array<{ email_address: string }> | undefined)?.[0];
    const email = emailObj?.email_address ?? `${clerkId}@unknown`;
    const name =
      [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
    const avatarUrl = (data.image_url as string) ?? null;

    await prisma.user.upsert({
      where: { clerkId },
      update: { email, name, avatarUrl },
      create: { clerkId, email, name, avatarUrl },
    });

    await auditLog(`webhook.${type}`, { resourceType: "user", resourceId: clerkId });
  }

  if (type === "user.deleted") {
    const clerkId = data.id as string;
    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (user) {
      await auditLog("webhook.user.deleted", { resourceType: "user", resourceId: user.id });
      await prisma.user.deleteMany({ where: { clerkId } });
    }
  }

  return NextResponse.json({ received: true });
}
