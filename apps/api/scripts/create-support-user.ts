/**
 * Creates an OfferAccept staff user with role INTERNAL_SUPPORT.
 *
 * INTERNAL_SUPPORT must only ever be assigned by a database operator — there is
 * deliberately no customer-facing flow for it. This script is that operator path.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=postgresql://... \
 *   SUPPORT_USER_EMAIL=name@offeraccept.com SUPPORT_USER_NAME="Name" \
 *   SUPPORT_USER_PASSWORD='...'            # optional: a random one is generated and printed once
 *   pnpm exec ts-node --transpile-only scripts/create-support-user.ts
 *
 * The password is read from the environment, never from argv, so it does not end up
 * in shell history or the process list.
 *
 * Safety:
 *   - Refuses to touch an existing user. Promoting a customer account to
 *     INTERNAL_SUPPORT would give it cross-tenant read access.
 *   - Login requires a membership, so the user is added to an internal organization
 *     (created on first use). That organization must never hold customer data.
 */
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12; // keep in step with auth/password.service.ts
const INTERNAL_ORG_SLUG = 'offeraccept-internal';

async function main(): Promise<void> {
  const email = process.env.SUPPORT_USER_EMAIL?.trim().toLowerCase();
  const name = process.env.SUPPORT_USER_NAME?.trim();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('SUPPORT_USER_EMAIL must be a valid email address.');
  if (!name) throw new Error('SUPPORT_USER_NAME is required.');

  const generated = !process.env.SUPPORT_USER_PASSWORD;
  const password = process.env.SUPPORT_USER_PASSWORD ?? randomBytes(18).toString('base64url');
  if (password.length < 12) throw new Error('SUPPORT_USER_PASSWORD must be at least 12 characters.');

  const db = new PrismaClient();
  try {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (existing) {
      throw new Error(
        `A user with email ${email} already exists (role ${existing.role}). ` +
          'Refusing to modify it: never promote a customer account to INTERNAL_SUPPORT.',
      );
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await db.$transaction(async (tx) => {
      const org = await tx.organization.upsert({
        where: { slug: INTERNAL_ORG_SLUG },
        update: {},
        create: { name: 'OfferAccept (internal)', slug: INTERNAL_ORG_SLUG },
      });
      const created = await tx.user.create({
        data: { email, name, role: 'INTERNAL_SUPPORT', hashedPassword, emailVerified: true },
        select: { id: true },
      });
      await tx.membership.create({
        data: { userId: created.id, organizationId: org.id, role: 'ADMIN' },
      });
      return created;
    });

    console.log(`Created INTERNAL_SUPPORT user ${email} (id ${user.id}).`);
    if (generated) {
      console.log(`Generated password (shown once, store it in a password manager): ${password}`);
    }
    console.log(
      'Production support access is further restricted by SUPPORT_IP_ALLOWLIST, ' +
        'SUPPORT_SESSION_TTL_MINUTES and REQUIRE_SUPPORT_MFA — see docs/support.md.',
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
