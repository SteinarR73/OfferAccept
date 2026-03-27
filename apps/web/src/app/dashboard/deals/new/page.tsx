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
  { id: 1, label: 'Deal name',  icon: FileText },
  { id: 2, label: 'Document',   icon: FileCheck },
  { id: 3, label: 'Recipient',  icon: User     },
  { id: 4, label: 'Review',     icon: Send     },
] as const;

// ─── NewDealWizardPage ─────────────────────────────────────────────────────────

export default function NewDealWizardPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({
    dealName: params.get('name') ? '' : 'Agreement',
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
      router.push(`/dashboard/offers/${draftOfferId}?sent=1`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT_EXCEEDED') {
        // Server message already says e.g. "Your free plan allows 5 offer(s) per month.
        // Upgrade your plan to send more offers." — surface it directly.
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
        <p className="text-sm text-gray-500 mt-0.5">Send your first agreement in under 2 minutes.</p>
      </div>

      {/* ── Step indicator ─────────────────────────────────────────────────── */}
      <StepIndicator current={step} total={STEPS.length} label={STEPS[step - 1].label} />

      {/* ── Step content ───────────────────────────────────────────────────── */}
      <div className="mt-5">
        {error && (
          <Alert variant="error" dismissible className="mb-4" onDismiss={() => setError(null)}>
            {error}
            {draftOfferId && error.startsWith('Deal created') && (
              <>{' '}<a href={`/dashboard/offers/${draftOfferId}`} className="underline font-medium">Open deal →</a></>
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
            {step === 3 ? 'Review' : 'Continue'}
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
        <span className="text-xs font-semibold text-blue-600">
          Step {current} / {total}
        </span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${Math.max(pct, 8)}%` }}
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
                  'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border transition-all',
                  done   ? 'bg-blue-600 border-blue-600 text-white'
                  : active ? 'bg-white border-blue-500 text-blue-600 ring-2 ring-blue-100'
                           : 'bg-white border-gray-200 text-gray-400',
                )}
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
          placeholder="e.g. Software Development Proposal — Q2 2026"
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
          description="Pick a pre-written agreement, or upload your own below."
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
            description="PDF or DOCX — or skip and add later from the deal page."
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
            hint="A secure signing link will be sent here."
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

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
        <p className="text-xs text-blue-700 font-medium">
          Clicking &ldquo;Send deal&rdquo; delivers a secure signing link to your recipient immediately.
        </p>
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
