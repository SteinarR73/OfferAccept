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
} from '../../../../lib/offers-api';
import { FileUploadFlow } from '../../../../components/dashboard/FileUploadFlow';
import { TemplateSelector, DEAL_TEMPLATES, type DealTemplate } from '../../../../components/deals/TemplateSelector';
import { PageHeader } from '../../../../components/ui/PageHeader';
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

interface StepDef {
  id: number;
  label: string;
  icon: React.ElementType;
}

const STEPS: StepDef[] = [
  { id: 1, label: 'Deal name',  icon: FileText },
  { id: 2, label: 'Document',   icon: FileCheck },
  { id: 3, label: 'Recipient',  icon: User     },
  { id: 4, label: 'Review',     icon: Send     },
];

// ─── NewDealWizardPage ─────────────────────────────────────────────────────────

export default function NewDealWizardPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({
    dealName: '',
    selectedTemplateId: null,
    customerEmail: params.get('email') ?? '',
    customerName: params.get('name') ?? '',
  });

  // Draft created on Step 1→2 advance
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
    if (tpl) {
      update({
        selectedTemplateId: tpl.id,
        dealName: state.dealName.trim() ? state.dealName : tpl.title,
      });
    } else {
      update({ selectedTemplateId: null });
    }
  }

  function canAdvance(): boolean {
    if (step === 1) return state.dealName.trim().length > 0;
    if (step === 2) return !isUploading;
    if (step === 3) return state.customerEmail.trim().length > 0;
    return true;
  }

  async function handleNext() {
    setError(null);
    if (step === 1) {
      await createDraft();
      return;
    }
    if (step === 3) {
      await persistRecipient();
      return;
    }
    if (step < 4) setStep((s) => s + 1);
  }

  function prevStep() {
    setError(null);
    if (step > 1) setStep((s) => s - 1);
  }

  // Creates the draft on Step 1→2. If the user goes back and returns,
  // update the existing draft title instead.
  async function createDraft() {
    setCreatingDraft(true);
    try {
      if (!draftOfferId) {
        const { offerId } = await createOffer({ title: state.dealName });
        setDraftOfferId(offerId);

        // Apply template message immediately if a template is pre-selected
        const template = state.selectedTemplateId
          ? DEAL_TEMPLATES.find((t) => t.id === state.selectedTemplateId)
          : undefined;
        if (template?.message) {
          await updateOffer(offerId, { message: template.message });
        }
      } else {
        await updateOffer(draftOfferId, { title: state.dealName });
        const template = state.selectedTemplateId
          ? DEAL_TEMPLATES.find((t) => t.id === state.selectedTemplateId)
          : undefined;
        if (template?.message) {
          await updateOffer(draftOfferId, { message: template.message });
        }
      }
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create draft. Please try again.');
    } finally {
      setCreatingDraft(false);
    }
  }

  // Persists the recipient on Step 3→4 advance.
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

  function handleDocUploaded(docId: string, filename: string) {
    setUploadedDocs((prev) => [...prev, { docId, filename }]);
  }

  async function handleSend() {
    if (!draftOfferId) return;
    setSubmitting(true);
    setError(null);
    try {
      await sendOffer(draftOfferId);
      router.push(`/dashboard/offers/${draftOfferId}`);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Please try again.';
      setError(`Deal created but sending failed — ${detail}`);
      setSubmitting(false);
    }
  }

  const isLoading = creatingDraft || settingRecipient;

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="New deal"
        description="Create a deal to send to a customer"
        backHref="/dashboard/deals"
        backLabel="All deals"
      />

      {/* ── Step indicator ───────────────────────────────────────────────────── */}
      <StepIndicator current={step} steps={STEPS} />

      {/* ── Step content ─────────────────────────────────────────────────────── */}
      <div className="mt-6">
        {error && (
          <Alert variant="error" dismissible className="mb-4">
            {error}
            {draftOfferId && error.startsWith('Deal created') && (
              <>{' '}<a href={`/dashboard/offers/${draftOfferId}`} className="underline font-medium">Open deal →</a></>
            )}
          </Alert>
        )}

        {step === 1 && <StepDealName state={state} onChange={update} />}
        {step === 2 && draftOfferId && (
          <StepDocument
            offerId={draftOfferId}
            state={state}
            onTemplateSelect={handleTemplateSelect}
            onUploaded={handleDocUploaded}
            onUploadingChange={setIsUploading}
          />
        )}
        {step === 3 && <StepRecipient state={state} onChange={update} />}
        {step === 4 && <StepReview state={state} uploadedDocs={uploadedDocs} />}
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
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
            {step === 3 ? 'Review deal' : 'Continue'}
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

// ─── Step components ──────────────────────────────────────────────────────────

function StepDealName({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
  return (
    <Card>
      <CardHeader title="Name your deal" description="Give this deal a descriptive name." border />
      <CardSection>
        <Input
          label="Deal name"
          placeholder="e.g. Software Development Proposal — Q2 2026"
          value={state.dealName}
          onChange={(e) => onChange({ dealName: e.target.value })}
          required
          autoFocus
          hint="This appears in the email and acceptance certificate."
        />
      </CardSection>
    </Card>
  );
}

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
          description="Pick a pre-written agreement, or skip and upload your own document below."
          border
        />
        <CardSection>
          <TemplateSelector
            selected={state.selectedTemplateId}
            onSelect={onTemplateSelect}
          />
        </CardSection>
      </Card>

      {selectedTemplate ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5">
          <FileCheck className="w-4 h-4 text-green-600 flex-shrink-0" aria-hidden="true" />
          <p className="text-xs text-green-700">
            <span className="font-semibold">{selectedTemplate.title}</span> template applied —
            pre-written agreement terms will be included.
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader
            title="Upload document"
            description="Attach PDF or DOCX files — optional, you can add them later from the deal page."
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

function StepRecipient({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
  return (
    <Card>
      <CardHeader title="Recipient" description="Who is receiving this deal?" border />
      <CardSection>
        <div className="space-y-4">
          <Input
            label="Email address"
            type="email"
            placeholder="customer@company.com"
            value={state.customerEmail}
            onChange={(e) => onChange({ customerEmail: e.target.value })}
            required
            autoFocus
            hint="A secure signing link will be sent to this address."
          />
          <Input
            label="Recipient name"
            placeholder="Jane Smith"
            value={state.customerName}
            onChange={(e) => onChange({ customerName: e.target.value })}
            hint="Optional — shown in the deal and certificate."
          />
        </div>
      </CardSection>
    </Card>
  );
}

interface StepReviewProps {
  state: WizardState;
  uploadedDocs: UploadedDoc[];
}

function StepReview({ state, uploadedDocs }: StepReviewProps) {
  const template = state.selectedTemplateId
    ? DEAL_TEMPLATES.find((t) => t.id === state.selectedTemplateId)
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Deal summary" border />
        <CardSection>
          <dl className="space-y-3">
            <div className="flex items-center justify-between">
              <dt className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider">Deal name</dt>
              <dd className="text-sm font-medium text-gray-900">{state.dealName}</dd>
            </div>
            {state.customerEmail && (
              <div className="flex items-center justify-between">
                <dt className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider">Recipient</dt>
                <dd className="text-sm text-gray-700">
                  {state.customerName ? `${state.customerName} (${state.customerEmail})` : state.customerEmail}
                </dd>
              </div>
            )}
          </dl>
        </CardSection>
      </Card>

      {template ? (
        <Card>
          <CardHeader title="Agreement template" border />
          <CardSection>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <FileCheck className="w-4 h-4 text-green-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{template.title}</p>
                <p className="text-xs text-[--color-text-muted] mt-0.5">{template.description}</p>
              </div>
            </div>
          </CardSection>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Documents" border />
          <CardSection>
            {uploadedDocs.length === 0 ? (
              <p className="text-xs text-[--color-text-muted]">
                No documents attached. You can add them from the deal page after sending.
              </p>
            ) : (
              <ul className="space-y-2">
                {uploadedDocs.map(({ docId, filename }) => (
                  <li key={docId} className="flex items-center gap-2 text-sm text-gray-700">
                    <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" />
                    <span className="flex-1 truncate">{filename}</span>
                    <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" aria-label="Uploaded" />
                  </li>
                ))}
              </ul>
            )}
          </CardSection>
        </Card>
      )}

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
        <p className="text-xs text-blue-700 font-medium">
          Clicking &ldquo;Send deal&rdquo; will deliver a secure signing link to your recipient immediately.
        </p>
      </div>
    </div>
  );
}

// ─── StepIndicator ────────────────────────────────────────────────────────────

interface StepIndicatorProps {
  current: number;
  steps: StepDef[];
}

function StepIndicator({ current, steps }: StepIndicatorProps) {
  return (
    <nav aria-label="Wizard steps">
      <ol className="flex items-center gap-0">
        {steps.map((s, i) => {
          const done   = s.id < current;
          const active = s.id === current;
          const Icon   = s.icon;
          const isLast = i === steps.length - 1;

          return (
            <li key={s.id} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
                    done   ? 'bg-blue-600 border-blue-600 text-white'
                    : active ? 'bg-white border-blue-500 text-blue-600'
                             : 'bg-white border-gray-200 text-gray-400',
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  {done
                    ? <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    : <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  }
                </div>
                <span
                  className={cn(
                    'mt-1 text-[10px] font-medium whitespace-nowrap',
                    active ? 'text-blue-600' : done ? 'text-gray-500' : 'text-gray-400',
                  )}
                >
                  {s.label}
                </span>
              </div>

              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-1 mb-4',
                    done ? 'bg-blue-500' : 'bg-gray-200',
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
