import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { CORS_HEADERS, SECURITY_HEADERS } from "./lib/cors";

export default clerkMiddleware((auth, req: NextRequest) => {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: { ...CORS_HEADERS, ...SECURITY_HEADERS },
    });
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
