-- CreateTable: user_packages
-- Records packages activated by a user.
-- packageType is a free-form VARCHAR validated at the application layer.
-- Rows are append-only; not updated or deleted.

CREATE TABLE "user_packages" (
    "id"          TEXT         NOT NULL,
    "userId"      TEXT         NOT NULL,
    "packageType" VARCHAR(100) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_packages_pkey" PRIMARY KEY ("id")
);

-- FK: every UserPackage must reference an existing User row
ALTER TABLE "user_packages"
    ADD CONSTRAINT "user_packages_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index: list all packages for a user
CREATE INDEX "user_packages_userId_idx" ON "user_packages"("userId");
