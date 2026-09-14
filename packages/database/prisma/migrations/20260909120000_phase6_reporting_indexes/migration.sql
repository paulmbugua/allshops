-- Phase 6 read-model indexes. Reporting remains derived from transactional
-- tables; no competing summary or materialized data is introduced.
CREATE INDEX "sales_organizationId_branchId_status_completedAt_idx"
ON "sales"("organizationId", "branchId", "status", "completedAt");

CREATE INDEX "sales_organizationId_createdBy_status_completedAt_idx"
ON "sales"("organizationId", "createdBy", "status", "completedAt");

CREATE INDEX "payments_organizationId_method_status_recordedAt_idx"
ON "payments"("organizationId", "method", "status", "recordedAt");
