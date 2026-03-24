'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { getDocumentUploadUrl, addDocument } from '@/lib/offers-api';

// ─── Types ─────────────────────────────────────────────────────────────────────

type UploadStatus = 'idle' | 'hashing' | 'uploading' | 'confirming' | 'done' | 'error';

interface UploadedFile {
  name: string;
  size: number;
  status: UploadStatus;
  progress: number; // 0–100
  error?: string;
  docId?: string;
}

interface Props {
  offerId: string;
  onUploaded?: (docId: string, filename: string) => void;
  /** Called whenever any upload transitions between in-progress and settled. */
  onUploadingChange?: (uploading: boolean) => void;
  /** Accepted MIME types. Default: PDF + DOCX */
  accept?: string;
  /** Max file size in bytes. Default: 25 MB */
  maxBytes?: number;
  disabled?: boolean;
}

const DEFAULT_ACCEPT = 'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// ─── SHA-256 via Web Crypto ─────────────────────────────────────────────────────

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── FileUploadFlow ─────────────────────────────────────────────────────────────

export function FileUploadFlow({
  offerId,
  onUploaded,
  onUploadingChange,
  accept = DEFAULT_ACCEPT,
  maxBytes = DEFAULT_MAX_BYTES,
  disabled = false,
}: Props) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Notify parent whenever the in-progress count changes.
  useEffect(() => {
    const active = files.some(
      (f) => f.status === 'hashing' || f.status === 'uploading' || f.status === 'confirming',
    );
    onUploadingChange?.(active);
  }, [files, onUploadingChange]);

  const setFileState = useCallback((name: string, patch: Partial<UploadedFile>) => {
    setFiles((prev) => prev.map((f) => (f.name === name ? { ...f, ...patch } : f)));
  }, []);

  async function processFile(raw: File) {
    // Validate
    if (raw.size > maxBytes) {
      setFiles((prev) => [
        ...prev,
        { name: raw.name, size: raw.size, status: 'error', progress: 0, error: `File too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)` },
      ]);
      return;
    }

    setFiles((prev) => [
      ...prev,
      { name: raw.name, size: raw.size, status: 'hashing', progress: 0 },
    ]);

    try {
      // Step 1: SHA-256
      const hash = await sha256Hex(raw);
      setFileState(raw.name, { status: 'uploading', progress: 5 });

      // Step 2: Get presigned URL
      const { uploadUrl, storageKey } = await getDocumentUploadUrl(offerId, raw.name, raw.type || 'application/octet-stream');
      setFileState(raw.name, { progress: 10 });

      // Step 3: Upload directly to S3 (XHR for progress events)
      await uploadWithProgress(uploadUrl, raw, (pct) => {
        setFileState(raw.name, { progress: 10 + Math.round(pct * 0.85) });
      });
      setFileState(raw.name, { status: 'confirming', progress: 95 });

      // Step 4: Confirm document with API
      const doc = await addDocument(offerId, {
        filename: raw.name,
        mimeType: raw.type || 'application/octet-stream',
        sizeBytes: raw.size,
        storageKey,
        sha256Hash: hash,
      });

      setFileState(raw.name, { status: 'done', progress: 100, docId: doc?.id });
      onUploaded?.(doc?.id ?? storageKey, raw.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setFileState(raw.name, { status: 'error', error: msg });
    }
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    Array.from(fileList).forEach(processFile);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!disabled) handleFiles(e.dataTransfer.files);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }

  function onDragLeave() {
    setDragging(false);
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Upload document — click or drag and drop a file"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          'relative flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl border-2 border-dashed transition-colors cursor-pointer',
          'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
          dragging
            ? 'border-blue-400 bg-blue-50'
            : disabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
            : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40',
        )}
      >
        {/* Upload icon */}
        <svg
          className={cn('w-8 h-8', dragging ? 'text-blue-500' : 'text-gray-400')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>

        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            {dragging ? 'Drop file here' : 'Click to upload or drag & drop'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            PDF or DOCX · up to {Math.round(maxBytes / 1024 / 1024)} MB
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept}
          multiple
          tabIndex={-1}
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled}
          aria-hidden="true"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Uploaded files">
          {files.map((f) => (
            <FileRow key={f.name} file={f} onRemove={() => removeFile(f.name)} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── FileRow ─────────────────────────────────────────────────────────────────────

function FileRow({ file, onRemove }: { file: UploadedFile; onRemove: () => void }) {
  const isActive = file.status === 'hashing' || file.status === 'uploading' || file.status === 'confirming';

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 bg-white">
      {/* Icon */}
      <FileTypeIcon mimeType={file.name.endsWith('.pdf') ? 'pdf' : 'docx'} />

      {/* Name + progress */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
        {isActive && (
          <div className="mt-1.5">
            <div
              role="progressbar"
              aria-valuenow={file.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Uploading ${file.name}: ${file.progress}%`}
              className="h-1 bg-gray-100 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${file.progress}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
              {STATUS_LABEL[file.status]} · {file.progress}%
            </p>
          </div>
        )}
        {file.status === 'error' && (
          <p className="text-xs text-red-500 mt-0.5">{file.error ?? 'Upload failed'}</p>
        )}
        {file.status === 'done' && (
          <p className="text-xs text-green-600 mt-0.5 font-medium">Uploaded</p>
        )}
      </div>

      {/* Status icon / remove */}
      {file.status === 'done' ? (
        <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-label="Upload complete">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15 3.293 9.879a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : file.status === 'error' ? (
        <button
          onClick={onRemove}
          aria-label={`Remove ${file.name}`}
          className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-red-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <div className="flex-shrink-0 w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" aria-hidden="true" />
      )}
    </li>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<UploadStatus, string> = {
  idle: '',
  hashing: 'Computing checksum',
  uploading: 'Uploading',
  confirming: 'Confirming',
  done: 'Done',
  error: 'Error',
};

function FileTypeIcon({ mimeType }: { mimeType: 'pdf' | 'docx' }) {
  return (
    <div
      className={cn(
        'flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold uppercase',
        mimeType === 'pdf' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600',
      )}
      aria-hidden="true"
    >
      {mimeType}
    </div>
  );
}

/** XHR-based upload to S3 with progress events. */
function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 upload failed: HTTP ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload aborted'));

    xhr.send(file);
  });
}
