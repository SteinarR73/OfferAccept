-- AddIndex
-- Supports cursor-based list pagination: WHERE organizationId = ? ORDER BY createdAt DESC, id DESC
-- Makes the cursor position lookup O(log n) instead of a full table scan.
CREATE INDEX "offers_org_created_id_idx" ON "offers"("organizationId", "createdAt" DESC, "id" DESC);
