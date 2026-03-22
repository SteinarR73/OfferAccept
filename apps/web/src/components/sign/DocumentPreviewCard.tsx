import { FileText } from 'lucide-react';
import { cn } from '@/lib/cn';

// ─── DocumentPreviewCard ───────────────────────────────────────────────────────
// Emphasises what the recipient is about to sign.
// Used in the signing flow's OfferView — no interactivity needed here
// (preview opens in new tab if a downloadUrl is provided).

interface DocumentPreviewCardProps {
  filename: string;
  sizeBytes: number;
  mimeType?: string;
  downloadUrl?: string;
}

function mimeLabel(mimeType: string): { label: string; color: string } {
  if (mimeType === 'application/pdf')
    return { label: 'PDF', color: 'bg-red-100 text-red-700' };
  if (mimeType.includes('word') || mimeType.includes('docx'))
    return { label: 'DOCX', color: 'bg-blue-100 text-blue-700' };
  return { label: 'DOC', color: 'bg-gray-100 text-gray-600' };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentPreviewCard({
  filename,
  sizeBytes,
  mimeType = 'application/pdf',
  downloadUrl,
}: DocumentPreviewCardProps) {
  const { label, color } = mimeLabel(mimeType);

  const inner = (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3',
        'transition-shadow duration-200',
        downloadUrl ? 'hover:shadow-md hover:border-blue-200 cursor-pointer' : '',
      )}
    >
      {/* File type badge + icon */}
      <div className="relative flex-shrink-0">
        <div className="w-10 h-12 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
          <FileText className="w-5 h-5 text-gray-400" aria-hidden="true" />
        </div>
        <span className={cn(
          'absolute -bottom-1 -right-1 text-[9px] font-bold px-1 py-0.5 rounded',
          color,
        )}>
          {label}
        </span>
      </div>

      {/* Name + size */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{filename}</p>
        <p className="text-xs text-gray-400 mt-0.5">{formatBytes(sizeBytes)}</p>
      </div>

      {/* CTA hint */}
      {downloadUrl && (
        <span className="flex-shrink-0 text-xs font-medium text-blue-600 hidden sm:block">
          Preview →
        </span>
      )}
    </div>
  );

  if (downloadUrl) {
    return (
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Preview document: ${filename}`}
      >
        {inner}
      </a>
    );
  }

  return inner;
}
