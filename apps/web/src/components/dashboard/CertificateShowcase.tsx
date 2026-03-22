'use client';

import { useEffect, useState } from 'react';
import { Download, Link2, CheckCircle2, Shield } from 'lucide-react';
import { getCertificate, exportCertificate, type CertificateDetail } from '@/lib/offers-api';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';

// ─── CertificateShowcase ───────────────────────────────────────────────────────
// The "moment of completion" — shown on offer detail when status = ACCEPTED.
// Scale-in + fade-in animation emphasises the achievement.

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
      <div className="rounded-xl border border-green-200 bg-green-50/40 p-6 mb-4" aria-hidden="true">
        <div className="flex items-start gap-4">
          <Skeleton circle className="w-14 h-14 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-green-300 bg-gradient-to-br from-green-50 to-emerald-50/60 p-6 mb-4 animate-scale-in">
      <div className="flex flex-col sm:flex-row items-start gap-4">
        {/* Icon */}
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 ring-4 ring-green-200/60">
          <Shield className="w-7 h-7 text-green-600" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-green-800">Acceptance verified</h3>
          </div>

          {cert ? (
            <>
              <p className="text-xs text-green-700 mb-1">
                Accepted by <span className="font-medium">{cert.recipient.email}</span>
                {' · '}
                {new Date(cert.issuedAt).toLocaleString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
                })}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mt-0.5">
                <p className="text-[11px] font-mono text-green-600/80 truncate">
                  ID: {cert.certificateId}
                </p>
                <p className="text-[11px] font-mono text-green-600/70 truncate hidden sm:block">
                  · SHA-256: {cert.certificateHash.slice(0, 16)}…
                </p>
              </div>
            </>
          ) : (
            <p className="text-xs text-green-700">Certificate is being processed.</p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button
              variant="secondary"
              size="sm"
              loading={downloading}
              onClick={handleDownload}
              leftIcon={<Download className="w-3.5 h-3.5" aria-hidden="true" />}
              className="border-green-300 hover:bg-green-100 text-green-700"
            >
              Download certificate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyVerifyLink}
              leftIcon={
                copied
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" aria-hidden="true" />
                  : <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
              }
              className="text-green-700 hover:bg-green-100"
            >
              {copied ? 'Link copied!' : 'Copy verification link'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
