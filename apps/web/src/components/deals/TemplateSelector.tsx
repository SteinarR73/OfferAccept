'use client';

import { FileText, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

// ─── Template definitions ──────────────────────────────────────────────────────
// Static templates — no API call needed. These are pre-written agreement
// starters. The template `message` is applied to the deal at creation time.

export interface DealTemplate {
  id: string;
  title: string;
  description: string;
  /** Maps to wizard DealType */
  dealType: 'proposal' | 'quote' | 'offer' | 'onboarding';
  /** Category label shown in the UI */
  category: string;
  /** Pre-written agreement text set as the deal message */
  message: string;
}

export const DEAL_TEMPLATES: DealTemplate[] = [
  {
    id: 'tpl_consulting',
    title: 'Consulting Agreement',
    description: 'Standard consulting services agreement covering scope, fees, and IP ownership.',
    dealType: 'proposal',
    category: 'Services',
    message: `This Consulting Agreement sets out the terms under which consulting services will be provided.

Scope of Work
The consultant agrees to provide professional services as described in the accompanying proposal. All deliverables will be completed to a professional standard and within agreed timelines.

Fees & Payment
Fees are as quoted. Payment is due within 30 days of invoice. Late payments accrue interest at 1.5% per month.

Intellectual Property
All work product created specifically for this engagement becomes the client's property upon full payment. Pre-existing tools and methodologies remain the consultant's property.

Confidentiality
Both parties agree to keep confidential information shared during this engagement private and not to disclose it to third parties without prior written consent.

By accepting this agreement you confirm you have read, understood, and agree to these terms.`,
  },
  {
    id: 'tpl_sales_quote',
    title: 'Sales Quote Acceptance',
    description: 'Customer acceptance for a priced quote — confirms pricing, delivery, and payment terms.',
    dealType: 'quote',
    category: 'Sales',
    message: `This document confirms acceptance of the quoted pricing and terms.

Pricing & Scope
The prices listed in this quote are valid for 30 days from the issue date. Acceptance of this quote constitutes a binding order at the quoted price.

Delivery
Delivery timelines commence upon receipt of signed acceptance and any required deposit. We will notify you of any delays promptly.

Payment Terms
50% deposit is required to commence work. The remaining balance is due on delivery. Accepted payment methods: bank transfer, credit card.

Warranty
Products and services are covered by a 90-day satisfaction guarantee. Any defects or shortfalls will be remedied at no additional cost within this period.

By accepting this quote you agree to the pricing, scope, and payment terms described above.`,
  },
  {
    id: 'tpl_freelance',
    title: 'Freelance Agreement',
    description: 'Freelance work agreement covering project scope, ownership, and payment schedule.',
    dealType: 'offer',
    category: 'Freelance',
    message: `This Freelance Agreement is entered into between the client and the freelancer named in this deal.

Project Scope
The freelancer agrees to complete the project as described. Any scope changes must be agreed in writing and may affect timeline and pricing.

Ownership & Rights
Upon final payment, the client receives full ownership of all original work created for this project. The freelancer retains the right to display the work in their portfolio unless otherwise agreed.

Revisions
This agreement includes up to 3 rounds of revisions. Additional revision rounds will be quoted separately.

Payment Schedule
- 50% upfront to commence work
- 50% on project completion and delivery

Termination
Either party may terminate with 7 days written notice. The client pays for work completed to date; the freelancer delivers all work-in-progress upon termination.

By accepting this agreement you confirm you agree to the project scope and payment terms.`,
  },
  {
    id: 'tpl_nda',
    title: 'Non-Disclosure Agreement',
    description: 'Mutual NDA for sharing confidential information during business discussions.',
    dealType: 'offer',
    category: 'Legal',
    message: `This Non-Disclosure Agreement (NDA) governs the sharing of confidential information between the parties.

Definition of Confidential Information
Confidential information includes all non-public business, technical, financial, and operational information shared by either party in connection with the business relationship described in this deal.

Obligations
Each party agrees to:
- Keep all confidential information strictly private
- Use confidential information only for the purpose of evaluating or executing the described business relationship
- Not disclose confidential information to any third party without prior written consent
- Apply at least the same care to protect the other party's information as they apply to their own

Exceptions
These obligations do not apply to information that: (a) is or becomes publicly known through no breach of this agreement; (b) was already known to the recipient; (c) is received from a third party without restriction; or (d) is required to be disclosed by law.

Term
These confidentiality obligations remain in effect for 2 years from the date of acceptance.

By accepting this NDA you agree to the confidentiality obligations described above.`,
  },
];

// ─── TemplateSelector ─────────────────────────────────────────────────────────

interface TemplateSelectorProps {
  selected: string | null;
  onSelect: (template: DealTemplate | null) => void;
}

export function TemplateSelector({ selected, onSelect }: TemplateSelectorProps) {
  return (
    <div>
      <p className="text-xs text-[--color-text-muted] mb-3">
        Choose a template to pre-fill your deal — or leave blank to start from scratch.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {DEAL_TEMPLATES.map((tpl) => {
          const isSelected = selected === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(isSelected ? null : tpl)}
              className={cn(
                'text-left rounded-lg border p-3 transition-all cursor-pointer',
                'hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50',
              )}
              aria-pressed={isSelected}
            >
              <div className="flex items-start gap-2">
                <div
                  className={cn(
                    'w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5',
                    isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400',
                  )}
                  aria-hidden="true"
                >
                  {isSelected
                    ? <Check className="w-3 h-3" />
                    : <FileText className="w-3 h-3" />
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900 leading-tight">{tpl.title}</p>
                  <p className="text-[11px] text-[--color-text-muted] mt-0.5 leading-snug line-clamp-2">
                    {tpl.description}
                  </p>
                  <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                    {tpl.category}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
