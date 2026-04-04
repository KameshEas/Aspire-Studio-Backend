/**
 * Local storage file-serve route for development.
 * GET /api/v1/storage/[...key] — serve a stored artifact as a binary response.
 *
 * In production (S3), this route is never hit — signed URLs point to S3 directly.
 */
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { LocalStorageAdapter } from "@/lib/storage";

const MIME_MAP: Record<string, string> = {
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  json: "application/json",
  html: "text/html",
  pdf: "application/pdf",
  zip: "application/zip",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> }
) {
  const { key } = await ctx.params;
  const storageKey = key.join("/");

  // Security: prevent path traversal
  const normalized = path.normalize(storageKey);
  if (normalized.startsWith("..") || normalized.includes("/../")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adapter = new LocalStorageAdapter();
  const data = adapter.readFile(storageKey);

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = storageKey.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_MAP[ext] ?? "application/octet-stream";

  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(data.length),
    },
  });
}
