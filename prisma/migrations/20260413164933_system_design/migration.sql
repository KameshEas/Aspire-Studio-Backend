-- CreateIndex
CREATE INDEX "artifacts_org_id_idx" ON "artifacts"("org_id");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_created_at_idx" ON "audit_logs"("org_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "change_history_org_id_created_at_idx" ON "change_history"("org_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "change_history_actor_id_idx" ON "change_history"("actor_id");

-- CreateIndex
CREATE INDEX "generations_org_id_idx" ON "generations"("org_id");

-- CreateIndex
CREATE INDEX "generations_created_at_idx" ON "generations"("created_at" DESC);

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");
