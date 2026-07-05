import { buildAcceptanceStatement } from '../../src/modules/signing/domain/acceptance-statement';

// ─── Acceptance Statement Consistency Tests ────────────────────────────────────
//
// The acceptance statement is shown to the recipient BEFORE they accept, and the
// identical text is stored in AcceptanceRecord.acceptanceStatement afterward.
//
// If these two texts diverge, a recipient could dispute that what they agreed to
// is different from what appears in the certificate. This test suite ensures:
//
//   1. A single function produces both the display and stored text.
//   2. The output is deterministic for the same inputs.
//   3. The text contains all required identifying fields.
//   4. The function never reads the live clock — offerDate is a static, frozen
//      value, but the LIVE acceptance timestamp (acceptedAt) is intentionally
//      never a parameter and never appears in the output.
//   5. Special characters in inputs do not alter the structure.

const PARAMS = {
  recipientName: 'Alice Johnson',
  recipientEmail: 'alice.johnson@example.com',
  offerTitle: 'Consulting Agreement v2',
  offerVersion: 1,
  offerDate: new Date('2024-05-15T00:00:00.000Z'),
  senderName: 'Bob Smith',
  senderEmail: 'bob@example.com',
};

describe('buildAcceptanceStatement (single source of truth)', () => {
  it('produces identical output on two independent calls with the same inputs', () => {
    const first = buildAcceptanceStatement(PARAMS);
    const second = buildAcceptanceStatement(PARAMS);
    expect(first).toBe(second);
  });

  it('contains the recipient name', () => {
    const stmt = buildAcceptanceStatement(PARAMS);
    expect(stmt).toContain(PARAMS.recipientName);
  });

  it('contains the offer title', () => {
    const stmt = buildAcceptanceStatement(PARAMS);
    expect(stmt).toContain(PARAMS.offerTitle);
  });

  it('contains the sender name', () => {
    const stmt = buildAcceptanceStatement(PARAMS);
    expect(stmt).toContain(PARAMS.senderName);
  });

  it('contains the sender email', () => {
    const stmt = buildAcceptanceStatement(PARAMS);
    expect(stmt).toContain(PARAMS.senderEmail);
  });

  it('contains the recipient email', () => {
    const stmt = buildAcceptanceStatement(PARAMS);
    expect(stmt).toContain(PARAMS.recipientEmail);
  });

  it('contains the offer version', () => {
    const stmt = buildAcceptanceStatement(PARAMS);
    expect(stmt).toContain(`version ${PARAMS.offerVersion}`);
  });

  it('contains the formatted offer date, and no other/different full date', () => {
    const stmt = buildAcceptanceStatement(PARAMS);
    expect(stmt).toContain('15 May 2024');
    // A "day Month year" pattern should appear exactly once — the offerDate.
    // Guards against a second, unexpected full date (e.g. a live timestamp)
    // sneaking in. (Doesn't just count 4-digit years, since e.g. "eIDAS...
    // 910/2014" legitimately contains a bare year with no day/month attached.)
    const fullDateMatches = stmt.match(
      /\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/g,
    ) ?? [];
    expect(fullDateMatches).toEqual(['15 May 2024']);
  });

  it('contains the authority-to-bind clause', () => {
    const stmt = buildAcceptanceStatement(PARAMS);
    expect(stmt).toContain('authority to bind myself');
  });

  it('contains the Norwegian ehandelsloven / eIDAS disclaimer', () => {
    const stmt = buildAcceptanceStatement(PARAMS);
    expect(stmt).toContain('ehandelsloven');
    expect(stmt).toContain('eIDAS');
  });

  it('references the certificate for the exact acceptance timestamp, without embedding a live timestamp itself', () => {
    const stmt = buildAcceptanceStatement(PARAMS);
    expect(stmt).toContain('recorded in the certificate issued for this acceptance');
    // No time-of-day pattern (hours:minutes) appears anywhere — only a date, never a live clock reading
    expect(stmt).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('never reads the live clock — identical inputs produce identical output regardless of when called', async () => {
    const first = buildAcceptanceStatement(PARAMS);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = buildAcceptanceStatement(PARAMS);
    expect(first).toBe(second);
  });

  it('output differs when any input differs', () => {
    const base = buildAcceptanceStatement(PARAMS);

    expect(buildAcceptanceStatement({ ...PARAMS, recipientName: 'Carol Doe' })).not.toBe(base);
    expect(buildAcceptanceStatement({ ...PARAMS, recipientEmail: 'carol@example.com' })).not.toBe(base);
    expect(buildAcceptanceStatement({ ...PARAMS, offerTitle: 'Different Title' })).not.toBe(base);
    expect(buildAcceptanceStatement({ ...PARAMS, offerVersion: 2 })).not.toBe(base);
    expect(buildAcceptanceStatement({ ...PARAMS, offerDate: new Date('2024-06-01T00:00:00.000Z') })).not.toBe(base);
    expect(buildAcceptanceStatement({ ...PARAMS, senderName: 'Different Sender' })).not.toBe(base);
    expect(buildAcceptanceStatement({ ...PARAMS, senderEmail: 'other@example.com' })).not.toBe(base);
  });

  it('handles special characters without structural breakage', () => {
    const stmt = buildAcceptanceStatement({
      recipientName: 'O\'Brien & Associates',
      recipientEmail: 'obrien+tag@example.com',
      offerTitle: 'Agreement "2024" <Special>',
      offerVersion: 1,
      offerDate: new Date('2024-05-15T00:00:00.000Z'),
      senderName: 'Sender & Co.',
      senderEmail: 'sender+tag@example.com',
    });
    // Statement still exists and contains the key fields
    expect(stmt).toContain("O'Brien & Associates");
    expect(stmt).toContain('obrien+tag@example.com');
    expect(stmt).toContain('Agreement "2024" <Special>');
    expect(stmt).toContain('Sender & Co.');
    expect(stmt).toContain('sender+tag@example.com');
  });

  // ── Display vs. stored path equivalence ─────────────────────────────────────
  //
  // This test simulates the two call sites:
  //   - getOfferContext (display): called before the user accepts
  //   - AcceptanceService.accept (stored): called when the user accepts
  //
  // Both must produce the same string for the same snapshot/recipient data.

  it('display path and storage path produce identical text for the same inputs', () => {
    // Simulate inputs as derived from OfferSnapshot + OfferRecipient
    const snapshotTitle = 'Service Agreement';
    const snapshotVersion = 1;
    const snapshotDate = new Date('2024-05-15T00:00:00.000Z');
    const snapshotSenderName = 'Acme Corp';
    const snapshotSenderEmail = 'legal@acme.com';
    const recipientName = 'Dana Lee';
    const recipientEmail = 'dana.lee@example.com';

    // Display call (signing-flow.service.ts → getOfferContext)
    const displayStatement = buildAcceptanceStatement({
      recipientName,
      recipientEmail,
      offerTitle: snapshotTitle,
      offerVersion: snapshotVersion,
      offerDate: snapshotDate,
      senderName: snapshotSenderName,
      senderEmail: snapshotSenderEmail,
    });

    // Storage call (acceptance.service.ts → accept)
    const storedStatement = buildAcceptanceStatement({
      recipientName,
      recipientEmail,
      offerTitle: snapshotTitle,
      offerVersion: snapshotVersion,
      offerDate: snapshotDate,
      senderName: snapshotSenderName,
      senderEmail: snapshotSenderEmail,
    });

    expect(displayStatement).toBe(storedStatement);
  });
});
