import { PrismaClient } from '@prisma/client';

// Singleton pattern: reuse the same PrismaClient instance across hot reloads
// in development, and maintain a single connection pool in production.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export generated types so consumers import from this package,
// not directly from @prisma/client.
export type {
  Organization,
  User,
  Offer,
  OfferDocument,
  OfferSnapshot,
  OfferSnapshotDocument,
  OfferRecipient,
  SigningSession,
  SigningOtpChallenge,
  SigningEvent,
  AcceptanceRecord,
  AcceptanceCertificate,
  Subscription,
  // Enums
  UserRole,
  OfferStatus,
  RecipientStatus,
  SessionStatus,
  OtpChannel,
  OtpChallengeStatus,
  SigningEventType,
  SubscriptionPlan,
 } from '@prisma/client';

export { Prisma } from '@prisma/client';
