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
//   4. The text does NOT contain a timestamp (acceptedAt is stored separately).
//   5. Special characters in inputs do not alter the structure.

const PARAMS = {
  recipientName: 'Alice Johnson',
  offerTitle: 'Consulting Agreement v2',
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

  it('does NOT embed a timestamp — acceptedAt is stored separately in AcceptanceRecord', () => {
    const stmt = buildAcceptanceStatement(PARAMS);
    // These patterns indicate a date was embedded
    expect(stmt).not.toMatch(/\d{4}-\d{2}-\d{2}/);          // ISO date
    expect(stmt).not.toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/); // UTC weekday
    expect(stmt).not.toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/); // month
  });

  it('output differs when any input differs', () => {
    const base = buildAcceptanceStatement(PARAMS);

    expect(buildAcceptanceStatement({ ...PARAMS, recipientName: 'Carol Doe' })).not.toBe(base);
    expect(buildAcceptanceStatement({ ...PARAMS, offerTitle: 'Different Title' })).not.toBe(base);
    expect(buildAcceptanceStatement({ ...PARAMS, senderName: 'Different Sender' })).not.toBe(base);
    expect(buildAcceptanceStatement({ ...PARAMS, senderEmail: 'other@example.com' })).not.toBe(base);
  });

  it('handles special characters without structural breakage', () => {
    const stmt = buildAcceptanceStatement({
      recipientName: 'O\'Brien & Associates',
      offerTitle: 'Agreement "2024" <Special>',
      senderName: 'Sender & Co.',
      senderEmail: 'sender+tag@example.com',
    });
    // Statement still exists and contains the key fields
    expect(stmt).toContain("O'Brien & Associates");
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
    const snapshotSenderName = 'Acme Corp';
    const snapshotSenderEmail = 'legal@acme.com';
    const recipientName = 'Dana Lee';

    // Display call (signing-flow.service.ts → getOfferContext)
    const displayStatement = buildAcceptanceStatement({
      recipientName,
      offerTitle: snapshotTitle,
      senderName: snapshotSenderName,
      senderEmail: snapshotSenderEmail,
    });

    // Storage call (acceptance.service.ts → accept)
    const storedStatement = buildAcceptanceStatement({
      recipientName,
      offerTitle: snapshotTitle,
      senderName: snapshotSenderName,
      senderEmail: snapshotSenderEmail,
    });

    expect(displayStatement).toBe(storedStatement);
  });
});
