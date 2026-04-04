import { NextResponse } from "next/server";
import { listAllModels } from "@/lib/providers";
import { handler } from "@/lib/auth";

/** GET /api/v1/models — list all available AI models */
export const GET = handler(async () => {
  const models = listAllModels();
  return NextResponse.json(models);
});
