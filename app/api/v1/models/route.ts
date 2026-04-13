import { NextRequest, NextResponse } from "next/server";
import { listAllModels } from "@/lib/providers";
import { handler, requireAuth } from "@/lib/auth";

/** GET /api/v1/models — list all available AI models */
export const GET = handler(async (req: NextRequest) => {
  await requireAuth(req);
  const models = listAllModels();
  return NextResponse.json(models);
});
