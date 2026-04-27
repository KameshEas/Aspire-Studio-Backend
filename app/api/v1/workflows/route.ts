import { NextRequest, NextResponse } from "next/server";
import { orchestrationManager, WorkflowExecution } from "@/lib/orchestration";
import { CoordinatorInput } from "@/lib/agents";

/**
 * GET /api/v1/workflows
 * Get all workflow executions or status of specific execution
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get("executionId");

    if (executionId) {
      // Get specific execution
      const execution = orchestrationManager.getExecutionStatus(executionId);
      if (!execution) {
        return NextResponse.json({ error: "Execution not found" }, { status: 404 });
      }
      return NextResponse.json(execution);
    }

    // Get all executions
    const executions = orchestrationManager.getAllExecutions();
    return NextResponse.json({ executions, total: executions.length });
  } catch (error) {
    console.error("[Workflows API] GET error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/v1/workflows
 * Create and execute a new workflow
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CoordinatorInput;

    // Validate input
    if (!body.taskType) {
      return NextResponse.json({ error: "taskType is required" }, { status: 400 });
    }

    // For multi-step workflows, dependencies are required
    if (body.taskType === "multi-step" && (!body.dependencies || body.dependencies.length === 0)) {
      return NextResponse.json(
        { error: "dependencies array is required for multi-step workflows" },
        { status: 400 }
      );
    }

    // Execute workflow (returns immediately with execution ID)
    const executionId = await orchestrationManager.executeWorkflow(body);

    return NextResponse.json(
      {
        executionId,
        status: "pending",
        message: "Workflow execution started",
      },
      { status: 202 } // 202 Accepted - async processing
    );
  } catch (error) {
    console.error("[Workflows API] POST error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/**
 * GET /api/v1/workflows/agents
 * Get available agents
 */
export async function GET_AGENTS(request: NextRequest) {
  try {
    const agents = orchestrationManager.getAvailableAgents();
    return NextResponse.json({ agents });
  } catch (error) {
    console.error("[Workflows API] GET_AGENTS error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
