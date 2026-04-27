import { NextRequest, NextResponse } from "next/server";
import { orchestrationManager } from "@/lib/orchestration";

/**
 * GET /api/v1/workflows/agents
 * Get list of available agents
 */
export async function GET(request: NextRequest) {
  try {
    const agents = orchestrationManager.getAvailableAgents();

    return NextResponse.json({
      agents,
      count: agents.length,
      description: "List of available agents for workflow orchestration",
    });
  } catch (error) {
    console.error("[Agents API] GET error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
