'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Briefcase, User, FileText, DollarSign, Send,
  ChevronRight, ChevronLeft, Check, FileCheck,
} from 'lucide-react';
import {
  createOffer,
  updateOffer,
  setRecipient as setOfferRecipient,
  sendOffer,
} from '../../../../lib/offers-api';
import { serializeQuote, QuoteSummary, type QuoteData } from '../../../../components/deals/QuoteSummary';
import { QuoteSummaryCard } from '../../../../components/deals/QuoteSummaryCard';
import { DealTypeBadge, type DealType } from '../../../../components/ui/DealTypeBadge';
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
  // Step 1 — Deal basics
  dealName: string;
  dealType: DealType;
  /** Set when user picks a template; null = upload own document */
  selectedTemplateId: string | null;
  // Step 2 — Customer
  customerEmail: string;
  customerName: string;
  company: string;
  // Step 4 — Quote
  quote: QuoteData;
}

interface UploadedDoc {
  docId: string;
  filename: string;
}

const EMPTY_QUOTE: QuoteData = { description: '', lineItems: [] };

// ─── Step definitions ─────────────────────────────────────────────────────────

interface StepDef {
  id: number;
  label: string;
  icon: React.ElementType;
}

const STEPS: StepDef[] = [
  { id: 1, label: 'Basics',    icon: Briefcase  },
  { id: 2, label: 'Customer',  icon: User       },
  { id: 3, label: 'Documents', icon: FileText   },
  { id: 4, label: 'Quote',     icon: DollarSign },
  { id: 5, label: 'Review',    icon: Send       },
];

// ─── NewDealWizardPage ─────────────────────────────────────────────────────────

export default function NewDealWizardPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({
    dealName: '',
    dealType: 'offer',
    selectedTemplateId: null,
    customerEmail: params.get('email') ?? '',
    customerName: params.get('name') ?? '',
    company: '',
    quote: EMPTY_QUOTE,
  });

  // Draft lifecycle — created lazily when advancing from step 2
  const [draftOfferId, setDraftOfferId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Loading / error
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<WizardState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  function handleTemplateSelect(tpl: DealTemplate | null) {
    if (tpl) {
      update({
        selectedTemplateId: tpl.id,
        // Pre-fill name if the user hasn't typed one yet
        dealName: state.dealName.trim() ? state.dealName : tpl.title,
        dealType: tpl.dealType,
      });
    } else {
      update({ selectedTemplateId: null });
    }
  }

  const usingTemplate = state.selectedTemplateId !== null;

  function canAdvance(): boolean {
    if (step === 1) return state.dealName.trim().length > 0;
    if (step === 2) return state.customerEmail.trim().length > 0;
    // Block advancing from documents step while any file is still in-flight
    if (step === 3) return !isUploading;
    return true;
  }

  async function handleNext() {
    setError(null);
    if (step === 2) {
      // Create (or refresh) the draft before showing the upload step
      await ensureDraft();
      return;
    }
    if (step < 5) setStep((s) => s + 1);
  }

  function prevStep() {
    setError(null);
    if (step > 1) setStep((s) => s - 1);
  }

  // Creates the draft offer on first call; on subsequent calls (user went back
  // and changed title / recipient) it updates the existing draft instead.
  // When a template is selected, the template message is applied and step 3 is skipped.
  async function ensureDraft() {
    setCreatingDraft(true);
    try {
      const recipient = state.customerEmail
        ? { email: state.customerEmail, name: state.customerName || state.customerEmail }
        : undefined;

      const template = usingTemplate
        ? DEAL_TEMPLATES.find((t) => t.id === state.selectedTemplateId)
        : undefined;

      if (!draftOfferId) {
        const { offerId } = await createOffer({ title: state.dealName, recipient });
        setDraftOfferId(offerId);

        // Apply template message immediately after creation
        if (template?.message) {
          await updateOffer(offerId, { message: template.message });
        }
      } else {
        // Sync any edits the user made while backtracking
        await updateOffer(draftOfferId, { title: state.dealName });
        if (recipient) {
          await setOfferRecipient(draftOfferId, recipient);
        }
        // Re-apply template message if template is (still) selected
        if (template?.message) {
          await updateOffer(draftOfferId, { message: template.message });
        }
      }

      // Skip the Documents upload step when a template is active
      setStep(usingTemplate ? 4 : 3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to prepare deal. Please try again.');
    } finally {
      setCreatingDraft(false);
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
      // Persist the quote as the deal message — but don't overwrite a template message
      // unless the user actually entered quote content.
      const quoteText = serializeQuote('', state.quote);
      if (quoteText && !usingTemplate) {
        await updateOffer(draftOfferId, { message: quoteText });
      } else if (quoteText && usingTemplate) {
        // Append quote below the template body
        const template = DEAL_TEMPLATES.find((t) => t.id === state.selectedTemplateId);
        const combined = [template?.message, quoteText].filter(Boolean).join('\n\n---\n\n');
        await updateOffer(draftOfferId, { message: combined });
      }
      await sendOffer(draftOfferId);
      router.push(`/dashboard/offers/${draftOfferId}`);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Please try again.';
      setError(`Deal created but sending failed — ${detail}`);
      setSubmitting(false);
    }
  }

  // When a template is active, step 3 label in the indicator shows as "Template"
  const visibleSteps = usingTemplate
    ? STEPS.map((s) => s.id === 3 ? { ...s, label: 'Template', icon: FileCheck } : s)
    : STEPS;

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="New deal"
        description="Create a deal to send to a customer"
        backHref="/dashboard/deals"
        backLabel="All deals"
      />

      {/* ── Step indicator ───────────────────────────────────────────────────── */}
      <StepIndicator current={step} steps={visibleSteps} />

      {/* ── Step content ─────────────────────────────────────────────────────── */}
      <div className="mt-6">
        {error && (
          <Alert variant="error" dismissible className="mb-4">
            {error}
            {/* If the deal exists but sending failed, offer a direct link */}
            {draftOfferId && error.startsWith('Deal created') && (
              <>{' '}<a href={`/dashboard/offers/${draftOfferId}`} className="underline font-medium">Open deal →</a></>
            )}
          </Alert>
        )}

        {step === 1 && <StepBasics state={state} onChange={update} onTemplateSelect={handleTemplateSelect} />}
        {step === 2 && <StepCustomer state={state} onChange={update} />}
        {step === 3 && draftOfferId && (
          <StepDocuments
            offerId={draftOfferId}
            onUploaded={handleDocUploaded}
            onUploadingChange={setIsUploading}
          />
        )}
        {step === 4 && (
          <QuoteSummary value={state.quote} onChange={(quote) => update({ quote })} />
        )}
        {step === 5 && (
          <StepReview state={state} uploadedDocs={uploadedDocs} />
        )}
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
        <Button
          variant="secondary"
          size="md"
          onClick={prevStep}
          disabled={step === 1 || creatingDraft || submitting}
          leftIcon={<ChevronLeft className="w-4 h-4" aria-hidden="true" />}
        >
          Back
        </Button>

        {step < 5 ? (
          <Button
            variant="primary"
            size="md"
            onClick={handleNext}
            disabled={!canAdvance()}
            loading={creatingDraft}
            rightIcon={creatingDraft ? undefined : <ChevronRight className="w-4 h-4" aria-hidden="true" />}
          >
            {step === 4 ? 'Review deal' : 'Continue'}
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

const DEAL_TYPE_OPTIONS: Array<{ value: DealType; label: string; desc: string }> = [
  { value: 'proposal',   label: 'Proposal',   desc: 'A detailed proposal for a project or service'  },
  { value: 'quote',      label: 'Quote',      desc: 'A priced quote for products or services'       },
  { value: 'offer',      label: 'Offer',      desc: 'A general offer letter or agreement'           },
  { value: 'onboarding', label: 'Onboarding', desc: 'A welcome package or onboarding agreement'    },
];

interface StepBasicsProps {
  state: WizardState;
  onChange: (p: Partial<WizardState>) => void;
  onTemplateSelect: (tpl: DealTemplate | null) => void;
}

function StepBasics({ state, onChange, onTemplateSelect }: StepBasicsProps) {
  return (
    <div className="space-y-4">
      {/* Template selector */}
      <Card>
        <CardHeader
          title="Start from a template"
          description="Pick a pre-written agreement — or skip and fill in your own details below."
          border
        />
        <CardSection>
          <TemplateSelector
            selected={state.selectedTemplateId}
            onSelect={onTemplateSelect}
          />
        </CardSection>
      </Card>

      {/* Deal details */}
      <Card>
        <CardHeader title="Deal basics" description="Name and categorize this deal." border />
        <CardSection>
          <div className="space-y-5">
            <Input
              label="Deal name"
              placeholder="e.g. Software Development Proposal — Q2 2026"
              value={state.dealName}
              onChange={(e) => onChange({ dealName: e.target.value })}
              required
              autoFocus={!state.selectedTemplateId}
              hint="This appears in the email and acceptance certificate."
            />

            <fieldset>
              <legend className="block text-xs font-semibold text-gray-700 mb-2">
                Deal type
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {DEAL_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-all',
                      'hover:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500',
                      state.dealType === opt.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white',
                    )}
                  >
                    <input
                      type="radio"
                      name="dealType"
                      value={opt.value}
                      checked={state.dealType === opt.value}
                      onChange={() => onChange({ dealType: opt.value })}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                      <p className="text-xs text-[--color-text-muted] mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </CardSection>
      </Card>

      {/* Template applied indicator */}
      {state.selectedTemplateId && (() => {
        const tpl = DEAL_TEMPLATES.find((t) => t.id === state.selectedTemplateId);
        return tpl ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5">
            <FileCheck className="w-4 h-4 text-green-600 flex-shrink-0" aria-hidden="true" />
            <p className="text-xs text-green-700">
              <span className="font-semibold">{tpl.title}</span> template applied —
              pre-written agreement terms will be included in your deal.
              The Documents upload step will be skipped.
            </p>
          </div>
        ) : null;
      })()}
    </div>
  );
}

function StepCustomer({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
  return (
    <Card>
      <CardHeader title="Customer" description="Who is receiving this deal?" border />
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
            label="Customer name"
            placeholder="Jane Smith"
            value={state.customerName}
            onChange={(e) => onChange({ customerName: e.target.value })}
            hint="Optional — shown in the deal and certificate."
          />
          <Input
            label="Company"
            placeholder="Acme Ltd"
            value={state.company}
            onChange={(e) => onChange({ company: e.target.value })}
            hint="Optional — for your reference only."
          />
        </div>
      </CardSection>
    </Card>
  );
}

interface StepDocumentsProps {
  offerId: string;
  onUploaded: (docId: string, filename: string) => void;
  onUploadingChange: (uploading: boolean) => void;
}

function StepDocuments({ offerId, onUploaded, onUploadingChange }: StepDocumentsProps) {
  return (
    <Card>
      <CardHeader
        title="Documents"
        description="Attach PDF or DOCX files — optional, you can skip and add later"
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
  );
}

interface StepReviewProps {
  state: WizardState;
  uploadedDocs: UploadedDoc[];
}

function StepReview({ state, uploadedDocs }: StepReviewProps) {
  const hasQuote = state.quote.description.trim() || state.quote.lineItems.length > 0;
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
            <div className="flex items-center justify-between">
              <dt className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider">Type</dt>
              <dd><DealTypeBadge type={state.dealType} /></dd>
            </div>
            {state.customerEmail && (
              <div className="flex items-center justify-between">
                <dt className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider">Customer</dt>
                <dd className="text-sm text-gray-700">
                  {state.customerName ? `${state.customerName} (${state.customerEmail})` : state.customerEmail}
                </dd>
              </div>
            )}
            {state.company && (
              <div className="flex items-center justify-between">
                <dt className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider">Company</dt>
                <dd className="text-sm text-gray-700">{state.company}</dd>
              </div>
            )}
          </dl>
        </CardSection>
      </Card>

      {/* Template applied */}
      {template && (
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
      )}

      {/* Documents attached in step 3 (only when no template) */}
      {!template && (
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

      {hasQuote && (
        <QuoteSummaryCard
          description={state.quote.description}
          lineItems={state.quote.lineItems}
        />
      )}

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
        <p className="text-xs text-blue-700 font-medium">
          Clicking &ldquo;Send deal&rdquo; will deliver a secure signing link to your customer immediately.
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
