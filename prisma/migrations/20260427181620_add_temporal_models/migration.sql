-- CreateTable
CREATE TABLE "temporal_jobs" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "workflow_type" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "temporal_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_queue" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "last_error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "manual_review" BOOLEAN NOT NULL DEFAULT true,
    "reviewed_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "temporal_jobs_workflow_id_key" ON "temporal_jobs"("workflow_id");

-- CreateIndex
CREATE INDEX "temporal_jobs_project_id_idx" ON "temporal_jobs"("project_id");

-- CreateIndex
CREATE INDEX "temporal_jobs_tenant_id_idx" ON "temporal_jobs"("tenant_id");

-- CreateIndex
CREATE INDEX "temporal_jobs_status_idx" ON "temporal_jobs"("status");

-- CreateIndex
CREATE INDEX "temporal_jobs_created_at_idx" ON "temporal_jobs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "dead_letter_queue_manual_review_idx" ON "dead_letter_queue"("manual_review");

-- CreateIndex
CREATE INDEX "dead_letter_queue_created_at_idx" ON "dead_letter_queue"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "temporal_jobs" ADD CONSTRAINT "temporal_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
