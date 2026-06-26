/*
  Warnings:

  - Added the required column `updated_at` to the `artifacts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `template_versions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "artifacts" ADD COLUMN     "parent_artifact_id" TEXT,
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- AlterTable
ALTER TABLE "template_versions" ADD COLUMN     "generation_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "system_prompt" TEXT,
ADD COLUMN     "test_data" JSONB,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "current_version_id" TEXT,
ADD COLUMN     "is_archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "artifacts_status_idx" ON "artifacts"("status");

-- CreateIndex
CREATE INDEX "artifacts_created_at_idx" ON "artifacts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "template_versions_template_id_is_active_idx" ON "template_versions"("template_id", "is_active");

-- CreateIndex
CREATE INDEX "template_versions_template_id_created_at_idx" ON "template_versions"("template_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "templates_tags_idx" ON "templates"("tags");

-- CreateIndex
CREATE INDEX "templates_is_archived_idx" ON "templates"("is_archived");

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_parent_artifact_id_fkey" FOREIGN KEY ("parent_artifact_id") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
