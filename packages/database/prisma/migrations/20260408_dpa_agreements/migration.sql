-- CreateTable: dpa_agreements
-- Append-only record of DPA execution events per organisation.

CREATE TABLE "dpa_agreements" (
  "id"               TEXT         NOT NULL,
  "organizationId"   TEXT         NOT NULL,
  "dpaVersion"       VARCHAR(20)  NOT NULL,
  "acceptedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedByUserId" TEXT         NOT NULL,
  "ipAddress"        VARCHAR(45)  NOT NULL,
  "userAgent"        VARCHAR(500) NOT NULL,
  "artifactKey"      TEXT,

  CONSTRAINT "dpa_agreements_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "dpa_agreements"
  ADD CONSTRAINT "dpa_agreements_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "dpa_agreements_organizationId_idx"
  ON "dpa_agreements"("organizationId");

CREATE INDEX "dpa_agreements_organizationId_dpaVersion_idx"
  ON "dpa_agreements"("organizationId", "dpaVersion");
