'use client';

import { useEffect, useState } from 'react';
import { Download, Link2, CheckCircle2, Shield } from 'lucide-react';
import { getCertificate, exportCertificate, type CertificateDetail } from '@/lib/offers-api';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';

// ─── CertificateShowcase ───────────────────────────────────────────────────────
// The "moment of completion" shown on deal detail when status = ACCEPTED.
// Full-card treatment with pulsing ring icon to signal a significant milestone.

interface Props {
  certificateId: string;
}

export function CertificateShowcase({ certificateId }: Props) {
  const [cert, setCert] = useState<CertificateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    getCertificate(certificateId)
      .then(setCert)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [certificateId]);

  function copyVerifyLink() {
    const url = `${window.location.origin}/verify/${certificateId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const data = await exportCertificate(certificateId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificate-${data.certificateId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — user can retry
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div
        className="rounded-2xl border border-green-200 bg-green-50/40 p-8 mb-5"
        aria-hidden="true"
      >
        <div className="flex flex-col items-center gap-4">
          <Skeleton circle className="w-20 h-20" />
          <div className="space-y-2 text-center">
            <Skeleton className="h-5 w-44 mx-auto" />
            <Skeleton className="h-3.5 w-64 mx-auto" />
          </div>
          <div className="flex gap-3 pt-1">
            <Skeleton className="h-8 w-36 rounded-lg" />
            <Skeleton className="h-8 w-40 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border-2 border-green-300 bg-gradient-to-b from-green-50 to-emerald-50/30 p-8 mb-5 animate-scale-in"
      role="region"
      aria-label="Acceptance certificate"
    >
      {/* ── Icon ──────────────────────────────────────────────────────────────── */}
      <div className="flex justify-center mb-5">
        <div
          className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center
                     ring-4 ring-green-200 animate-pulse-ring shadow-lg shadow-green-200/60"
          aria-hidden="true"
        >
          <Shield className="w-10 h-10 text-white" />
        </div>
      </div>

      {/* ── Heading ───────────────────────────────────────────────────────────── */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-1.5">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" aria-hidden="true" />
          <h2 className="text-xl font-bold text-green-800">Acceptance verified</h2>
        </div>
        <p className="text-sm text-green-700 max-w-sm mx-auto">
          This deal has been accepted and a tamper-proof certificate has been issued.
        </p>
      </div>

      {/* ── Certificate details ───────────────────────────────────────────────── */}
      {cert ? (
        <div className="max-w-md mx-auto rounded-xl border border-green-200 bg-white/70 divide-y divide-green-100 mb-6">
          <DetailRow label="Accepted by" value={cert.recipient.email} />
          <DetailRow
            label="Date"
            value={new Date(cert.issuedAt).toLocaleString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric',
              hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
            })}
          />
          <DetailRow label="Certificate ID" value={cert.certificateId} mono />
          <DetailRow label="SHA-256" value={`${cert.certificateHash.slice(0, 24)}…`} mono />
        </div>
      ) : (
        <p className="text-center text-sm text-green-700 mb-6">
          Certificate details are being processed.
        </p>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="primary"
          size="sm"
          loading={downloading}
          onClick={handleDownload}
          leftIcon={<Download className="w-3.5 h-3.5" aria-hidden="true" />}
          className="bg-green-600 hover:bg-green-700 focus:ring-green-500 border-green-600"
        >
          Download certificate
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={copyVerifyLink}
          leftIcon={
            copied
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" aria-hidden="true" />
              : <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
          }
          className="border-green-300 text-green-700 hover:bg-green-100 hover:border-green-400"
        >
          {copied ? 'Copied!' : 'Copy verification link'}
        </Button>
      </div>

      {/* ── Footnote ──────────────────────────────────────────────────────────── */}
      <p className="text-center text-[11px] text-green-600/60 mt-4">
        tamper-evident · cryptographically sealed · verifiable by any third party
      </p>
    </div>
  );
}

// ─── Detail row ────────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 px-4 py-2.5">
      <span className="text-[11px] font-semibold text-green-600/70 uppercase tracking-wider w-24 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <span className={`text-xs text-gray-800 break-all leading-relaxed ${mono ? 'font-mono' : 'font-medium'}`}>
        {value}
      </span>
    </div>
  );
}
