import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

// ─── PasswordService ───────────────────────────────────────────────────────────
// Centralises bcrypt hashing/comparison with a hardened cost factor.
//
// BCRYPT_ROUNDS = 12 (up from the common default of 10). At rounds=12, bcrypt
// takes ~300ms on modern hardware — expensive enough to resist offline brute-force
// while still acceptable for interactive login latency.
//
// verifyPassword() always runs bcrypt.compare(), even when no user is found,
// to prevent username-enumeration via timing side-channel.

const BCRYPT_ROUNDS = 12;

// A dummy hash pre-computed at rounds=12 so verifyPassword() always takes the same
// time regardless of whether the user exists. Generated once, never changes.
// Value: bcrypt.hashSync('__dummy__', 12)
const DUMMY_HASH = '$2a$12$eXNNX9lfpBhCfzS4uiY9MOi.XMaDgJ8t3cFCfLpzpILGhOQTlXPIa';

@Injectable()
export class PasswordService {
  // Hash a raw password with bcrypt at BCRYPT_ROUNDS.
  async hash(rawPassword: string): Promise<string> {
    return bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
  }

  // Compare a raw password to a stored bcrypt hash.
  // Always executes bcrypt work even when storedHash is null (anti-timing).
  async verify(rawPassword: string, storedHash: string | null): Promise<boolean> {
    const hash = storedHash ?? DUMMY_HASH;
    const match = await bcrypt.compare(rawPassword, hash);
    // If storedHash was null we ran compare purely for timing — result is irrelevant.
    return storedHash !== null && match;
  }
}
