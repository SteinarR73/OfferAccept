'use client';

import { CheckCircle2, Clock, Send, FileText, XCircle, RotateCcw } from 'lucide-react';
import type { OfferStatusValue } from '@offeraccept/types';
import { Card, CardHeader, CardSection } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepState = 'done' | 'active' | 'pending';

interface Step {
  id: string;
  label: string;
  sublabel?: string;
  state: StepState;
  icon: React.ReactNode;
}

export function buildSteps(status: OfferStatusValue): Step[] {
  const isDraft   = status === 'DRAFT';
  const isSent    = status === 'SENT';
  const accepted  = status === 'ACCEPTED';
  const declined  = status === 'DECLINED';
  const revoked   = status === 'REVOKED';
  const expired   = status === 'EXPIRED';

  const terminal = accepted || declined || revoked || expired;
  const sent = !isDraft;

  const steps: Step[] = [
    {
      id: 'created',
      label: 'Deal created',
      sublabel: 'Draft saved',
      state: 'done',
      icon: <FileText className="w-3.5 h-3.5" aria-hidden="true" />,
    },
    {
      id: 'sent',
      label: 'Sent to customer',
      sublabel: sent ? 'Secure link delivered' : 'Not yet sent',
      state: sent ? 'done' : 'active',
      icon: <Send className="w-3.5 h-3.5" aria-hidden="true" />,
    },
    {
      id: 'awaiting',
      label: terminal ? (accepted ? 'Accepted' : 'Closed') : 'Awaiting acceptance',
      sublabel: accepted
        ? 'Customer confirmed acceptance'
        : declined
        ? 'Customer declined'
        : revoked
        ? 'Deal revoked'
        : expired
        ? 'Deal expired'
        : isSent
        ? 'Waiting for customer action'
        : undefined,
      state: terminal ? (accepted ? 'done' : 'active') : isSent ? 'active' : 'pending',
      icon: terminal
        ? (accepted
            ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            : <XCircle className="w-3.5 h-3.5" aria-hidden="true" />)
        : isSent
        ? <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        : <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />,
    },
  ];

  if (accepted) {
    steps.push({
      id: 'certificate',
      label: 'Certificate issued',
      sublabel: 'Tamper-proof acceptance record',
      state: 'done',
      icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />,
    });
  }

  return steps;
}

// ─── AcceptanceStatusCard ─────────────────────────────────────────────────────

interface AcceptanceStatusCardProps {
  status: OfferStatusValue;
}

export function AcceptanceStatusCard({ status }: AcceptanceStatusCardProps) {
  const steps = buildSteps(status);

  return (
    <Card>
      <CardHeader title="Acceptance status" border />
      <CardSection>
        <ol aria-label="Deal workflow steps" className="flex flex-col gap-0">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1;
            return (
              <li key={step.id} className="flex items-start gap-3">
                {/* Line + dot */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ring-2 transition-colors',
                      step.state === 'done'
                        ? 'bg-green-500 text-white ring-green-100'
                        : step.state === 'active'
                        ? 'bg-blue-600 text-white ring-blue-100'
                        : 'bg-gray-100 text-gray-400 ring-gray-50',
                    )}
                  >
                    {step.icon}
                  </div>
                  {!isLast && (
                    <div
                      className={cn(
                        'w-0.5 flex-1 min-h-[20px] mt-1 mb-1 rounded-full',
                        step.state === 'done' ? 'bg-green-200' : 'bg-gray-100',
                      )}
                      aria-hidden="true"
                    />
                  )}
                </div>

                {/* Content */}
                <div className={cn('pb-4', isLast && 'pb-0')}>
                  <p
                    className={cn(
                      'text-xs font-semibold',
                      step.state === 'done'
                        ? 'text-gray-900'
                        : step.state === 'active'
                        ? 'text-blue-700'
                        : 'text-gray-400',
                    )}
                  >
                    {step.label}
                  </p>
                  {step.sublabel && (
                    <p className="text-[11px] text-[--color-text-muted] mt-0.5">{step.sublabel}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardSection>
    </Card>
  );
}
