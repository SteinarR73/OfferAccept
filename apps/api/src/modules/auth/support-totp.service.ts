import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { FieldCipher } from '../../common/crypto/field-cipher';

// ─── SupportTotpService ────────────────────────────────────────────────────────
// RFC 6238 TOTP for INTERNAL_SUPPORT MFA.
//
// Algorithm: HMAC-SHA1, 6 digits, 30-second window, 1-step drift tolerance.
// Secrets are 20 random bytes (160 bits), base32-encoded for authenticator apps.
// At rest they are encrypted with FieldCipher (AES-256-GCM via WEBHOOK_SECRET_KEY).
//
// When WEBHOOK_SECRET_KEY is absent (dev/test), secrets are stored unencrypted.
// Never set REQUIRE_SUPPORT_MFA=true without also setting WEBHOOK_SECRET_KEY.

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_MS = 30_000;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // accept codes ±1 step from current counter

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_CHARS[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string): Buffer {
  const s = str.toUpperCase().replace(/\s/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const idx = BASE32_CHARS.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function computeTotpCode(keyBytes: Buffer, counter: bigint): string {
  const counterBuf = Buffer.allocUnsafe(8);
  counterBuf.writeBigUInt64BE(counter);
  const hmac = crypto.createHmac('sha1', keyBytes).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (truncated % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

@Injectable()
export class SupportTotpService {
  private readonly cipher: FieldCipher | null;

  constructor(config: ConfigService) {
    const keyHex = config.get<string>('WEBHOOK_SECRET_KEY');
    this.cipher = keyHex ? new FieldCipher(keyHex) : null;
  }

  generateSecret(): { secretBase32: string; encryptedSecret: string } {
    const raw = crypto.randomBytes(20);
    const secretBase32 = base32Encode(raw);
    const encryptedSecret = this.encrypt(secretBase32);
    return { secretBase32, encryptedSecret };
  }

  otpauthUri(email: string, secretBase32: string): string {
    const issuer = 'OfferAccept';
    const account = encodeURIComponent(`${issuer}:${email}`);
    return (
      `otpauth://totp/${account}` +
      `?secret=${secretBase32}` +
      `&issuer=${encodeURIComponent(issuer)}` +
      `&algorithm=SHA1` +
      `&digits=${TOTP_DIGITS}` +
      `&period=${TOTP_STEP_MS / 1000}`
    );
  }

  verify(code: string, encryptedSecret: string): boolean {
    const secretBase32 = this.decrypt(encryptedSecret);
    let keyBytes: Buffer;
    try {
      keyBytes = base32Decode(secretBase32);
    } catch {
      return false;
    }
    const counter = BigInt(Math.floor(Date.now() / TOTP_STEP_MS));
    for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
      if (computeTotpCode(keyBytes, counter + BigInt(delta)) === code) {
        return true;
      }
    }
    return false;
  }

  private encrypt(plain: string): string {
    return this.cipher ? this.cipher.encrypt(plain) : plain;
  }

  private decrypt(stored: string): string {
    if (!this.cipher) return stored;
    return this.cipher.isEncrypted(stored) ? this.cipher.decrypt(stored) : stored;
  }
}
