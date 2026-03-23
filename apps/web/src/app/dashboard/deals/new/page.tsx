'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Briefcase, User, FileText, DollarSign, Send,
  ChevronRight, ChevronLeft, Check,
} from 'lucide-react';
import { createOffer } from '../../../../lib/offers-api';
import { serializeQuote, QuoteSummary, type QuoteData } from '../../../../components/deals/QuoteSummary';
import { QuoteSummaryCard } from '../../../../components/deals/QuoteSummaryCard';
import { DealTypeBadge, type DealType } from '../../../../components/ui/DealTypeBadge';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Card, CardHeader, CardSection } from '../../../../components/ui/Card';
import { Input } from '../../../../components/ui/Input';
import { Button } from '../../../../components/ui/Button';
import { Alert } from '../../../../components/ui/Alert';
import { cn } from '@/lib/cn';

// ─── Wizard state ──────────────────────────────────────────────────────────────

interface WizardState {
  // Step 1 — Deal basics
  dealName: string;
  dealType: DealType;
  // Step 2 — Customer
  customerEmail: string;
  customerName: string;
  company: string;
  // Step 4 — Quote
  quote: QuoteData;
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

// ─── NewDealWizard ─────────────────────────────────────────────────────────────

export default function NewDealWizardPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<WizardState>({
    dealName: '',
    dealType: 'offer',
    customerEmail: params.get('email') ?? '',
    customerName: params.get('name') ?? '',
    company: '',
    quote: EMPTY_QUOTE,
  });

  function update(patch: Partial<WizardState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  function canAdvance(): boolean {
    if (step === 1) return state.dealName.trim().length > 0;
    if (step === 2) return state.customerEmail.trim().length > 0;
    return true;
  }

  function nextStep() {
    if (step < 5) setStep((s) => s + 1);
  }

  function prevStep() {
    if (step > 1) setStep((s) => s - 1);
  }

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      const message = serializeQuote('', state.quote);
      const { offerId } = await createOffer({
        title: state.dealName,
        message: message || undefined,
        recipient: state.customerEmail
          ? { email: state.customerEmail, name: state.customerName || state.customerEmail }
          : undefined,
      });
      router.push(`/dashboard/offers/${offerId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create deal. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="New deal"
        description="Create a deal to send to a customer"
        backHref="/dashboard/deals"
        backLabel="All deals"
      />

      {/* ── Step indicator ────────────────────────────────────────────────────── */}
      <StepIndicator current={step} steps={STEPS} />

      {/* ── Step content ─────────────────────────────────────────────────────── */}
      <div className="mt-6">
        {error && <Alert variant="error" dismissible className="mb-4">{error}</Alert>}

        {step === 1 && (
          <StepBasics state={state} onChange={update} />
        )}
        {step === 2 && (
          <StepCustomer state={state} onChange={update} />
        )}
        {step === 3 && (
          <StepDocuments />
        )}
        {step === 4 && (
          <QuoteSummary
            value={state.quote}
            onChange={(quote) => update({ quote })}
          />
        )}
        {step === 5 && (
          <StepReview state={state} />
        )}
      </div>

      {/* ── Navigation buttons ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
        <Button
          variant="secondary"
          size="md"
          onClick={prevStep}
          disabled={step === 1 || submitting}
          leftIcon={<ChevronLeft className="w-4 h-4" aria-hidden="true" />}
        >
          Back
        </Button>

        {step < 5 ? (
          <Button
            variant="primary"
            size="md"
            onClick={nextStep}
            disabled={!canAdvance()}
            rightIcon={<ChevronRight className="w-4 h-4" aria-hidden="true" />}
          >
            {step === 4 ? 'Review deal' : 'Continue'}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            loading={submitting}
            onClick={handleCreate}
            leftIcon={<Send className="w-4 h-4" aria-hidden="true" />}
          >
            Create deal
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Step components ──────────────────────────────────────────────────────────

const DEAL_TYPE_OPTIONS: Array<{ value: DealType; label: string; desc: string }> = [
  { value: 'proposal',   label: 'Proposal',   desc: 'A detailed proposal for a project or service'        },
  { value: 'quote',      label: 'Quote',      desc: 'A priced quote for products or services'             },
  { value: 'offer',      label: 'Offer',      desc: 'A general offer letter or agreement'                 },
  { value: 'onboarding', label: 'Onboarding', desc: 'A welcome package or onboarding agreement'           },
];

function StepBasics({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
  return (
    <Card>
      <CardHeader title="Deal basics" description="What kind of deal are you creating?" border />
      <CardSection>
        <div className="space-y-5">
          <Input
            label="Deal name"
            placeholder="e.g. Software Development Proposal — Q2 2026"
            value={state.dealName}
            onChange={(e) => onChange({ dealName: e.target.value })}
            required
            autoFocus
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

function StepDocuments() {
  return (
    <Card>
      <CardHeader title="Documents" description="Attach files to this deal" border />
      <CardSection>
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
          <FileText className="w-8 h-8 text-gray-300 mb-3" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-700">Documents are added after deal creation</p>
          <p className="text-xs text-[--color-text-muted] mt-1 max-w-sm">
            Create the deal first, then upload PDF or DOCX attachments on the deal detail page.
            The recipient will see all documents before signing.
          </p>
        </div>
      </CardSection>
    </Card>
  );
}

function StepReview({ state }: { state: WizardState }) {
  const hasQuote = state.quote.description.trim() || state.quote.lineItems.length > 0;

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

      {hasQuote && (
        <QuoteSummaryCard
          description={state.quote.description}
          lineItems={state.quote.lineItems}
        />
      )}

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
        <p className="text-xs text-blue-700 font-medium">
          Clicking &ldquo;Create deal&rdquo; will save a draft. You can then add documents and send when ready.
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
          const done    = s.id < current;
          const active  = s.id === current;
          const Icon    = s.icon;
          const isLast  = i === steps.length - 1;

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
