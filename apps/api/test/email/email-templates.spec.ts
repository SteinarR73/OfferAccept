import {
  otpEmail,
  offerLinkEmail,
  acceptanceConfirmationSenderEmail,
  acceptanceConfirmationRecipientEmail,
  declineNotificationEmail,
} from '../../src/common/email/templates';

// ─── Email template tests ──────────────────────────────────────────────────────
// Tests cover:
//   1. All five template functions produce the expected content structure
//   2. HTML escaping prevents XSS from user-supplied content
//   3. OTP codes and signing URLs appear in the message body (they are required content)
//   4. Anti-phishing wording is present in the OTP email
//   5. Subjects match expected patterns

describe('Email templates', () => {
  // ── otpEmail ─────────────────────────────────────────────────────────────────

  describe('otpEmail', () => {
    const params = {
      to: 'bob@client.com',
      recipientName: 'Bob Client',
      code: '482916',
      offerTitle: 'Web Redesign Proposal',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    it('subject contains the offer title', () => {
      const { subject } = otpEmail(params);
      expect(subject).toContain('Web Redesign Proposal');
    });

    it('text body contains the OTP code', () => {
      const { text } = otpEmail(params);
      expect(text).toContain('482916');
    });

    it('HTML body contains the OTP code', () => {
      const { html } = otpEmail(params);
      expect(html).toContain('482916');
    });

    it('text body contains anti-phishing warning', () => {
      const { text } = otpEmail(params);
      expect(text.toLowerCase()).toContain('never ask you to share this code');
    });

    it('HTML body contains anti-phishing warning', () => {
      const { html } = otpEmail(params);
      expect(html.toLowerCase()).toContain('never ask you to share this code');
    });

    it('text body contains recipient name', () => {
      const { text } = otpEmail(params);
      expect(text).toContain('Bob Client');
    });

    it('HTML body contains recipient name (escaped)', () => {
      const { html } = otpEmail(params);
      expect(html).toContain('Bob Client');
    });

    it('HTML escapes XSS in recipient name', () => {
      const malicious = otpEmail({ ...params, recipientName: '<script>alert(1)</script>' });
      expect(malicious.html).not.toContain('<script>');
      expect(malicious.html).toContain('&lt;script&gt;');
    });

    it('HTML escapes XSS in offer title', () => {
      const malicious = otpEmail({ ...params, offerTitle: '<img onerror="evil()">' });
      expect(malicious.html).not.toContain('<img');
      expect(malicious.html).toContain('&lt;img');
    });

    it('includes expiry information', () => {
      const { text } = otpEmail(params);
      expect(text).toMatch(/expires in \d+ minute/i);
    });
  });

  // ── offerLinkEmail ───────────────────────────────────────────────────────────

  describe('offerLinkEmail', () => {
    const params = {
      to: 'bob@client.com',
      recipientName: 'Bob Client',
      offerTitle: 'Web Redesign Proposal',
      senderName: 'Alice Sender',
      signingUrl: 'https://app.offeracept.com/sign/oa_abc123',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    it('subject contains sender name and offer title', () => {
      const { subject } = offerLinkEmail(params);
      expect(subject).toContain('Alice Sender');
      expect(subject).toContain('Web Redesign Proposal');
    });

    it('text body contains the signing URL', () => {
      const { text } = offerLinkEmail(params);
      expect(text).toContain('https://app.offeracept.com/sign/oa_abc123');
    });

    it('HTML body contains the signing URL as an href', () => {
      const { html } = offerLinkEmail(params);
      expect(html).toContain('href="https://app.offeracept.com/sign/oa_abc123"');
    });

    it('HTML body also shows the URL as visible text for copy-paste', () => {
      const { html } = offerLinkEmail(params);
      // URL appears both in the href and as visible text
      const urlCount = (html.match(/oa_abc123/g) ?? []).length;
      expect(urlCount).toBeGreaterThanOrEqual(2);
    });

    it('HTML escapes XSS in offer title', () => {
      const malicious = offerLinkEmail({ ...params, offerTitle: '"><script>xss()</script>' });
      expect(malicious.html).not.toContain('<script>');
      expect(malicious.html).toContain('&lt;script&gt;');
    });

    it('HTML escapes XSS in sender name', () => {
      const malicious = offerLinkEmail({ ...params, senderName: '<b>Evil</b>' });
      expect(malicious.html).not.toContain('<b>Evil</b>');
      expect(malicious.html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
    });

    it('handles null expiresAt without crashing', () => {
      const { text, html } = offerLinkEmail({ ...params, expiresAt: null });
      expect(text).toBeDefined();
      expect(html).toBeDefined();
    });
  });

  // ── acceptanceConfirmationSenderEmail ─────────────────────────────────────────

  describe('acceptanceConfirmationSenderEmail', () => {
    const params = {
      to: 'alice@co.com',
      senderName: 'Alice Sender',
      offerTitle: 'Web Redesign Proposal',
      recipientName: 'Bob Client',
      recipientEmail: 'bob@client.com',
      acceptedAt: new Date('2024-06-01T12:00:00Z'),
      certificateId: 'cert-abc-123',
    };

    it('subject contains recipient name and offer title', () => {
      const { subject } = acceptanceConfirmationSenderEmail(params);
      expect(subject).toContain('Bob Client');
      expect(subject).toContain('Web Redesign Proposal');
    });

    it('text body contains certificate ID', () => {
      const { text } = acceptanceConfirmationSenderEmail(params);
      expect(text).toContain('cert-abc-123');
    });

    it('HTML body contains certificate ID', () => {
      const { html } = acceptanceConfirmationSenderEmail(params);
      expect(html).toContain('cert-abc-123');
    });

    it('text body contains recipient email', () => {
      const { text } = acceptanceConfirmationSenderEmail(params);
      expect(text).toContain('bob@client.com');
    });

    it('HTML escapes XSS in recipient name', () => {
      const malicious = acceptanceConfirmationSenderEmail({ ...params, recipientName: '<script>xss()</script>' });
      expect(malicious.html).not.toContain('<script>');
    });
  });

  // ── acceptanceConfirmationRecipientEmail ──────────────────────────────────────

  describe('acceptanceConfirmationRecipientEmail', () => {
    const params = {
      to: 'bob@client.com',
      recipientName: 'Bob Client',
      offerTitle: 'Web Redesign Proposal',
      senderName: 'Alice Sender',
      acceptedAt: new Date('2024-06-01T12:00:00Z'),
      certificateId: 'cert-abc-123',
    };

    it('subject contains offer title', () => {
      const { subject } = acceptanceConfirmationRecipientEmail(params);
      expect(subject).toContain('Web Redesign Proposal');
    });

    it('text body contains certificate ID and prompts record-keeping', () => {
      const { text } = acceptanceConfirmationRecipientEmail(params);
      expect(text).toContain('cert-abc-123');
      expect(text.toLowerCase()).toContain('records');
    });

    it('HTML body contains certificate ID', () => {
      const { html } = acceptanceConfirmationRecipientEmail(params);
      expect(html).toContain('cert-abc-123');
    });
  });

  // ── declineNotificationEmail ──────────────────────────────────────────────────

  describe('declineNotificationEmail', () => {
    const params = {
      to: 'alice@co.com',
      senderName: 'Alice Sender',
      offerTitle: 'Web Redesign Proposal',
      recipientName: 'Bob Client',
      recipientEmail: 'bob@client.com',
      declinedAt: new Date('2024-06-01T12:00:00Z'),
    };

    it('subject contains recipient name and offer title', () => {
      const { subject } = declineNotificationEmail(params);
      expect(subject).toContain('Bob Client');
      expect(subject).toContain('Web Redesign Proposal');
    });

    it('text body does not contain a certificate ID (no cert on decline)', () => {
      const { text } = declineNotificationEmail(params);
      expect(text.toLowerCase()).not.toContain('certificate');
    });

    it('text body contains the declined-at timestamp', () => {
      const { text } = declineNotificationEmail(params);
      // The date is formatted via toUTCString() — just check the year
      expect(text).toContain('2024');
    });

    it('HTML escapes XSS in recipient name', () => {
      const malicious = declineNotificationEmail({ ...params, recipientName: '<img src=x onerror=evil()>' });
      expect(malicious.html).not.toContain('<img');
      expect(malicious.html).toContain('&lt;img');
    });
  });

  // ── shared structure ──────────────────────────────────────────────────────────

  describe('all templates', () => {
    it('every template produces a non-empty subject, text, and HTML', () => {
      const templates = [
        otpEmail({ to: 'a@b.com', recipientName: 'A', code: '123456', offerTitle: 'T', expiresAt: new Date(Date.now() + 60_000) }),
        offerLinkEmail({ to: 'a@b.com', recipientName: 'A', offerTitle: 'T', senderName: 'S', signingUrl: 'https://x.com/sign/oa_test', expiresAt: null }),
        acceptanceConfirmationSenderEmail({ to: 'a@b.com', senderName: 'S', offerTitle: 'T', recipientName: 'R', recipientEmail: 'r@b.com', acceptedAt: new Date(), certificateId: 'c1' }),
        acceptanceConfirmationRecipientEmail({ to: 'a@b.com', recipientName: 'R', offerTitle: 'T', senderName: 'S', acceptedAt: new Date(), certificateId: 'c1' }),
        declineNotificationEmail({ to: 'a@b.com', senderName: 'S', offerTitle: 'T', recipientName: 'R', recipientEmail: 'r@b.com', declinedAt: new Date() }),
      ];

      for (const t of templates) {
        expect(t.subject.length).toBeGreaterThan(0);
        expect(t.text.length).toBeGreaterThan(0);
        expect(t.html.length).toBeGreaterThan(0);
      }
    });

    it('every HTML template contains the OfferAccept brand name', () => {
      const templates = [
        otpEmail({ to: 'a@b.com', recipientName: 'A', code: '123456', offerTitle: 'T', expiresAt: new Date(Date.now() + 60_000) }),
        offerLinkEmail({ to: 'a@b.com', recipientName: 'A', offerTitle: 'T', senderName: 'S', signingUrl: 'https://x.com/sign/oa_test', expiresAt: null }),
        acceptanceConfirmationSenderEmail({ to: 'a@b.com', senderName: 'S', offerTitle: 'T', recipientName: 'R', recipientEmail: 'r@b.com', acceptedAt: new Date(), certificateId: 'c1' }),
        acceptanceConfirmationRecipientEmail({ to: 'a@b.com', recipientName: 'R', offerTitle: 'T', senderName: 'S', acceptedAt: new Date(), certificateId: 'c1' }),
        declineNotificationEmail({ to: 'a@b.com', senderName: 'S', offerTitle: 'T', recipientName: 'R', recipientEmail: 'r@b.com', declinedAt: new Date() }),
      ];

      for (const t of templates) {
        expect(t.html).toContain('OfferAccept');
      }
    });
  });
});
