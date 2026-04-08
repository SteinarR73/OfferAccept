'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileText, User, Send,
  ChevronRight, ChevronLeft, Check, FileCheck,
} from 'lucide-react';
import {
  createOffer,
  updateOffer,
  setRecipient as setOfferRecipient,
  sendOffer,
  ApiError,
} from '../../../../lib/offers-api';
import { FileUploadFlow } from '../../../../components/dashboard/FileUploadFlow';
import { TemplateSelector, DEAL_TEMPLATES, type DealTemplate } from '../../../../components/deals/TemplateSelector';
import { Card, CardHeader, CardSection } from '../../../../components/ui/Card';
import { Input } from '../../../../components/ui/Input';
import { Button } from '../../../../components/ui/Button';
import { Alert } from '../../../../components/ui/Alert';
import { cn } from '@/lib/cn';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WizardState {
  dealName: string;
  selectedTemplateId: string | null;
  customerEmail: string;
  customerName: string;
}

interface UploadedDoc {
  docId: string;
  filename: string;
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Name',       icon: FileText,  cta: 'Continue'    },
  { id: 2, label: 'Document',   icon: FileCheck, cta: 'Continue'    },
  { id: 3, label: 'Recipient',  icon: User,      cta: 'Review deal' },
  { id: 4, label: 'Review',     icon: Send,      cta: 'Send deal'   },
] as const;

// ─── NewDealWizardPage ─────────────────────────────────────────────────────────

export default function NewDealWizardPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({
    dealName: params.get('name') ? '' : 'Deal',
    selectedTemplateId: null,
    customerEmail: params.get('email') ?? '',
    customerName: params.get('name') ?? '',
  });

  const [draftOfferId, setDraftOfferId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [creatingDraft, setCreatingDraft] = useState(false);
  const [settingRecipient, setSettingRecipient] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<WizardState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  function handleTemplateSelect(tpl: DealTemplate | null) {
    update({
      selectedTemplateId: tpl?.id ?? null,
      dealName: tpl && !state.dealName.trim() ? tpl.title : state.dealName,
    });
  }

  function canAdvance(): boolean {
    if (step === 1) {
      const len = state.dealName.trim().length;
      return len > 0 && len <= 500; // mirrors server @MaxLength(500)
    }
    if (step === 2) return !isUploading;
    if (step === 3) {
      const e = state.customerEmail.trim();
      return e.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    }
    return true;
  }

  async function handleNext() {
    setError(null);
    if (step === 1) { await createDraft(); return; }
    if (step === 3) { await persistRecipient(); return; }
    if (step < 4) setStep((s) => s + 1);
  }

  function prevStep() {
    setError(null);
    if (step > 1) setStep((s) => s - 1);
  }

  async function createDraft() {
    setCreatingDraft(true);
    try {
      if (!draftOfferId) {
        const { offerId } = await createOffer({ title: state.dealName });
        setDraftOfferId(offerId);
        const template = state.selectedTemplateId
          ? DEAL_TEMPLATES.find((t) => t.id === state.selectedTemplateId)
          : undefined;
        if (template?.message) await updateOffer(offerId, { message: template.message });
      } else {
        await updateOffer(draftOfferId, { title: state.dealName });
        const template = state.selectedTemplateId
          ? DEAL_TEMPLATES.find((t) => t.id === state.selectedTemplateId)
          : undefined;
        if (template?.message) await updateOffer(draftOfferId, { message: template.message });
      }
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create draft. Please try again.');
    } finally {
      setCreatingDraft(false);
    }
  }

  async function persistRecipient() {
    if (!draftOfferId) return;
    setSettingRecipient(true);
    try {
      await setOfferRecipient(draftOfferId, {
        email: state.customerEmail,
        name: state.customerName || state.customerEmail,
      });
      setStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set recipient. Please try again.');
    } finally {
      setSettingRecipient(false);
    }
  }

  async function handleSend() {
    if (!draftOfferId) return;
    setSubmitting(true);
    setError(null);
    try {
      await sendOffer(draftOfferId);
      router.push(`/dashboard/deals/${draftOfferId}?sent=1`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT_EXCEEDED') {
        // Server message already says e.g. "Your free plan allows 5 deal(s) per month.
        // Upgrade your plan to send more deals." — surface it directly.
        setError(err.message);
      } else {
        // Generic: deal was saved as DRAFT so no work is lost; user can retry.
        const detail = err instanceof Error ? err.message : 'Please try again.';
        setError(`Your deal was saved but could not be sent — ${detail}`);
      }
      setSubmitting(false);
    }
  }

  const isLoading = creatingDraft || settingRecipient;

  return (
    <div className="max-w-xl mx-auto py-2">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-4"
        >
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          All deals
        </button>
        <h1 className="text-xl font-semibold text-gray-900">New deal</h1>
        <p className="text-sm text-gray-500 mt-0.5">Send your first deal in under 2 minutes.</p>
      </div>

      {/* ── Step indicator ─────────────────────────────────────────────────── */}
      <StepIndicator current={step} total={STEPS.length} label={STEPS[step - 1].label} />

      {/* ── Step content ───────────────────────────────────────────────────── */}
      <div className="mt-5">
        {error && (
          <Alert variant="error" dismissible className="mb-4" onDismiss={() => setError(null)}>
            {error}
            {draftOfferId && error.startsWith('Deal created') && (
              <>{' '}<a href={`/dashboard/deals/${draftOfferId}`} className="underline font-medium">Open deal →</a></>
            )}
          </Alert>
        )}

        {step === 1 && <StepDealName state={state} onChange={update} onNext={handleNext} />}
        {step === 2 && draftOfferId && (
          <StepDocument
            offerId={draftOfferId}
            state={state}
            onTemplateSelect={handleTemplateSelect}
            onUploaded={(id, name) => setUploadedDocs((prev) => [...prev, { docId: id, filename: name }])}
            onUploadingChange={setIsUploading}
          />
        )}
        {step === 3 && <StepRecipient state={state} onChange={update} onNext={handleNext} />}
        {step === 4 && <StepReview state={state} uploadedDocs={uploadedDocs} />}
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
        <Button
          variant="secondary"
          size="md"
          onClick={prevStep}
          disabled={step === 1 || isLoading || submitting}
          leftIcon={<ChevronLeft className="w-4 h-4" aria-hidden="true" />}
        >
          Back
        </Button>

        {step < 4 ? (
          <Button
            variant="primary"
            size="md"
            onClick={handleNext}
            disabled={!canAdvance()}
            loading={isLoading}
            rightIcon={isLoading ? undefined : <ChevronRight className="w-4 h-4" aria-hidden="true" />}
          >
            {STEPS[step - 1].cta}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            loading={submitting}
            onClick={handleSend}
            leftIcon={<Send className="w-4 h-4" aria-hidden="true" />}
          >
            Send deal
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── StepIndicator ─────────────────────────────────────────────────────────────
// "Step X / 4 — Label" with a simple progress bar.

function StepIndicator({ current, total, label }: { current: number; total: number; label: string }) {
  const pct = Math.round(((current - 1) / (total - 1)) * 100);
  return (
    <div aria-label={`Step ${current} of ${total}: ${label}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-[--color-accent]">
          Step {current} / {total}
        </span>
        <span className="text-xs text-[--color-text-muted]">{label}</span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
        <div
          className="h-full rounded-full animate-progress-bar"
          style={{
            width: `${Math.max(pct, 8)}%`,
            backgroundColor: 'var(--color-accent)',
            transition: 'width var(--transition-slow)',
          }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={1}
          aria-valuemax={total}
        />
      </div>
      {/* Step dots */}
      <div className="flex justify-between mt-1.5 px-0">
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <div key={n} className="flex flex-col items-center gap-0.5">
              <div
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border',
                  'transition-all',
                )}
                style={
                  done
                    ? { backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)', color: '#fff' }
                    : active
                    ? { backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-accent)', color: 'var(--color-accent)', boxShadow: '0 0 0 3px var(--color-accent-light)' }
                    : { backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }
                }
                aria-hidden="true"
              >
                {done ? <Check className="w-2.5 h-2.5" /> : n}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 1: Deal Name ─────────────────────────────────────────────────────────

function StepDealName({
  state, onChange, onNext,
}: {
  state: WizardState;
  onChange: (p: Partial<WizardState>) => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader title="Name your deal" description="Give this deal a clear, descriptive name." border />
      <CardSection>
        <Input
          label="Deal name"
          placeholder="e.g. Software Development Deal — Q2 2026"
          value={state.dealName}
          onChange={(e) => onChange({ dealName: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && state.dealName.trim()) onNext(); }}
          required
          autoFocus
          maxLength={500}
          hint={
            state.dealName.length > 450
              ? `${state.dealName.length}/500 characters`
              : 'Appears in the email and acceptance certificate.'
          }
        />
      </CardSection>
    </Card>
  );
}

// ─── Step 2: Document ──────────────────────────────────────────────────────────

interface StepDocumentProps {
  offerId: string;
  state: WizardState;
  onTemplateSelect: (tpl: DealTemplate | null) => void;
  onUploaded: (docId: string, filename: string) => void;
  onUploadingChange: (uploading: boolean) => void;
}

function StepDocument({ offerId, state, onTemplateSelect, onUploaded, onUploadingChange }: StepDocumentProps) {
  const selectedTemplate = state.selectedTemplateId
    ? DEAL_TEMPLATES.find((t) => t.id === state.selectedTemplateId)
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Use a template"
          description="Pick a pre-written template, or upload your own below."
          border
        />
        <CardSection>
          <TemplateSelector selected={state.selectedTemplateId} onSelect={onTemplateSelect} />
        </CardSection>
      </Card>

      {selectedTemplate ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5">
          <FileCheck className="w-4 h-4 text-green-600 flex-shrink-0" aria-hidden="true" />
          <p className="text-xs text-green-700">
            <span className="font-semibold">{selectedTemplate.title}</span> template applied.
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader
            title="Upload document"
            description="PDF or DOCX — optional. You can attach a document from the deal page after sending."
            border
          />
          <CardSection>
            <FileUploadFlow
              offerId={offerId}
              onUploaded={onUploaded}
              onUploadingChange={onUploadingChange}
            />
          </CardSection>
        </Card>
      )}
    </div>
  );
}

// ─── Step 3: Recipient ─────────────────────────────────────────────────────────

function StepRecipient({
  state, onChange, onNext,
}: {
  state: WizardState;
  onChange: (p: Partial<WizardState>) => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader title="Who is receiving this deal?" border />
      <CardSection>
        <div className="space-y-4">
          <Input
            label="Email address"
            type="email"
            placeholder="customer@company.com"
            value={state.customerEmail}
            onChange={(e) => onChange({ customerEmail: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const email = state.customerEmail.trim();
                if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) onNext();
              }
            }}
            required
            autoFocus
            hint="A secure deal link will be sent here."
          />
          <Input
            label="Recipient name"
            placeholder="Jane Smith"
            value={state.customerName}
            onChange={(e) => onChange({ customerName: e.target.value })}
            maxLength={200}
            hint="Optional — shown in the deal and certificate."
          />
        </div>
      </CardSection>
    </Card>
  );
}

// ─── Step 4: Review ────────────────────────────────────────────────────────────

function StepReview({ state, uploadedDocs }: { state: WizardState; uploadedDocs: UploadedDoc[] }) {
  const [showPreview, setShowPreview] = useState(false);

  const template = state.selectedTemplateId
    ? DEAL_TEMPLATES.find((t) => t.id === state.selectedTemplateId)
    : null;

  const docLabel = template
    ? template.title
    : uploadedDocs.length > 0
    ? uploadedDocs.map((d) => d.filename).join(', ')
    : 'No document — can add after sending';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Deal summary" border />
        <CardSection>
          <dl className="space-y-3">
            <ReviewRow label="Deal name" value={state.dealName} />
            <ReviewRow
              label="Recipient"
              value={
                state.customerName
                  ? `${state.customerName} (${state.customerEmail})`
                  : state.customerEmail
              }
            />
            <ReviewRow
              label="Document"
              value={docLabel}
              muted={!template && uploadedDocs.length === 0}
            />
          </dl>
        </CardSection>
      </Card>

      <button
        type="button"
        onClick={() => setShowPreview(true)}
        className="w-full text-left rounded-xl border border-dashed border-gray-300 px-4 py-3 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center gap-2"
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        Preview what your recipient will see
      </button>

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
        <p className="text-xs text-blue-700 font-medium">
          Clicking &ldquo;Send deal&rdquo; delivers a secure deal link to your recipient immediately.
        </p>
      </div>

      {showPreview && (
        <RecipientPreviewModal
          dealName={state.dealName}
          recipientName={state.customerName || state.customerEmail}
          templateMessage={template?.message ?? null}
          docLabel={docLabel}
          hasDoc={!!(template || uploadedDocs.length > 0)}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

// ─── Recipient preview modal ────────────────────────────────────────────────────
// Shows a representative view of what the recipient sees when they open the deal.
// Uses only data already in the wizard — no additional API calls.

function RecipientPreviewModal({
  dealName,
  recipientName,
  templateMessage,
  docLabel,
  hasDoc,
  onClose,
}: {
  dealName: string;
  recipientName: string;
  templateMessage: string | null;
  docLabel: string;
  hasDoc: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm px-4 py-10 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Recipient preview"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Recipient preview</span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-sm font-medium"
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>

        {/* Trust banner — mirrors the real acceptance page */}
        <div className="bg-green-50 border-b border-green-200 px-4 py-2 flex items-center justify-center gap-4 text-xs text-green-800">
          <span>🔒 Secure acceptance session</span>
          <span className="text-green-600">· Encrypted in transit (TLS)</span>
        </div>

        {/* Deal content */}
        <div className="px-6 py-5">
          {/* Platform introduction */}
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-600 leading-relaxed">
              You are viewing a deal sent via <span className="font-semibold text-gray-900">OfferAccept</span>.{' '}
              OfferAccept records verified deal acceptances and produces a certificate that proves the acceptance occurred.
            </p>
          </div>

          <p className="text-sm text-gray-400 mb-1">Deal from <span className="font-medium text-gray-700">your organization</span></p>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">{dealName || 'Your deal title'}</h2>

          {templateMessage && (
            <p className="text-sm text-gray-600 leading-relaxed mb-4 whitespace-pre-line line-clamp-4">
              {templateMessage}
            </p>
          )}

          {hasDoc && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Documents included in this deal</p>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                <span className="w-6 h-6 rounded bg-red-100 text-red-600 text-[9px] font-bold flex items-center justify-center flex-shrink-0">PDF</span>
                <span className="text-xs text-gray-700 truncate">{docLabel}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-5">
            <div className="flex-1 h-9 rounded-lg bg-[--color-accent] flex items-center justify-center text-xs text-white font-medium">
              Continue to accept
            </div>
            <div className="h-9 px-4 rounded-lg border border-gray-200 flex items-center justify-center text-xs text-gray-500">
              Decline
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-center">
          <p className="text-[10px] text-gray-400">
            This is a representative preview. The recipient will also verify their email via a one-time code before accepting.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({
  label, value, muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wider shrink-0">{label}</dt>
      <dd className={cn('text-sm text-right', muted ? 'text-gray-400 italic' : 'font-medium text-gray-900')}>
        {value}
      </dd>
    </div>
  );
}
