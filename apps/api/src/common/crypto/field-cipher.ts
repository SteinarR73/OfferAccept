import * as crypto from 'crypto';

// ─── FieldCipher ──────────────────────────────────────────────────────────────
// AES-256-GCM encryption for sensitive database columns (e.g. webhook secrets).
//
// Wire format: "enc:v1:<base64(iv || ciphertext || authTag)>"
//   - iv:       16 random bytes  (128-bit — standard for GCM mode)
//   - ciphertext: variable length (same length as plaintext)
//   - authTag:  16 bytes         (128-bit GCM authentication tag)
//
// The "enc:v1:" prefix lets the service detect unencrypted legacy values that
// predate the encryption migration and handle them gracefully.
//
// Key derivation: the caller provides a 32-byte (256-bit) key as a hex string
// (64 hex chars). Generate one with: openssl rand -hex 32

const PREFIX = 'enc:v1:';
const IV_BYTES = 16;
const TAG_BYTES = 16;

export class FieldCipher {
  private readonly key: Buffer;

  constructor(keyHex: string) {
    if (keyHex.length !== 64) {
      throw new Error(
        'FieldCipher: WEBHOOK_SECRET_KEY must be exactly 64 hex characters (32 bytes / 256 bits). ' +
        `Got ${keyHex.length} characters. Generate one with: openssl rand -hex 32`,
      );
    }
    this.key = Buffer.from(keyHex, 'hex');
  }

  /** Encrypt a plaintext string. Returns the wire-format ciphertext. */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const payload = Buffer.concat([iv, ciphertext, tag]);
    return PREFIX + payload.toString('base64');
  }

  /** Decrypt a wire-format ciphertext. Returns plaintext. */
  decrypt(encoded: string): string {
    if (!encoded.startsWith(PREFIX)) {
      throw new Error('FieldCipher.decrypt: value is not in enc:v1: format.');
    }
    const payload = Buffer.from(encoded.slice(PREFIX.length), 'base64');

    if (payload.length < IV_BYTES + TAG_BYTES) {
      throw new Error('FieldCipher.decrypt: payload too short — data is corrupt.');
    }

    const iv         = payload.subarray(0, IV_BYTES);
    const tag        = payload.subarray(payload.length - TAG_BYTES);
    const ciphertext = payload.subarray(IV_BYTES, payload.length - TAG_BYTES);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Returns true when the value is in encrypted wire format. */
  isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }
}
