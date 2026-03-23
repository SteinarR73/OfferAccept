'use client';

import { DollarSign, FileText } from 'lucide-react';
import { Card, CardHeader, CardSection } from '@/components/ui/Card';

// ─── QuoteSummaryCard (read-only) ──────────────────────────────────────────────

interface LineItemDisplay {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface QuoteSummaryCardProps {
  description?: string | null;
  lineItems?: LineItemDisplay[];
}

export function QuoteSummaryCard({ description, lineItems = [] }: QuoteSummaryCardProps) {
  // Render nothing if no meaningful content
  if (!description?.trim() && lineItems.length === 0) return null;

  const total = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  return (
    <Card>
      <CardHeader
        title="Quote summary"
        border
        action={
          lineItems.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
              <DollarSign className="w-3 h-3 text-gray-400" aria-hidden="true" />
              {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          ) : undefined
        }
      />
      <CardSection>
        {description?.trim() && (
          <div className="flex items-start gap-2 mb-4 last:mb-0">
            <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{description.trim()}</p>
          </div>
        )}

        {lineItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider mb-2">
              Line items
            </p>
            <table className="w-full text-sm" aria-label="Quote line items">
              <thead>
                <tr className="border-b border-gray-100">
                  <th scope="col" className="py-1.5 text-left text-xs font-semibold text-gray-500">Item</th>
                  <th scope="col" className="py-1.5 text-right text-xs font-semibold text-gray-500 w-12">Qty</th>
                  <th scope="col" className="py-1.5 text-right text-xs font-semibold text-gray-500 w-24">Price</th>
                  <th scope="col" className="py-1.5 text-right text-xs font-semibold text-gray-500 w-24">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lineItems.map((li, i) => (
                  <tr key={i}>
                    <td className="py-2 text-gray-900">{li.description}</td>
                    <td className="py-2 text-right text-gray-600 tabular-nums">{li.quantity}</td>
                    <td className="py-2 text-right text-gray-600 tabular-nums">
                      {li.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900 tabular-nums">
                      {(li.quantity * li.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={3} className="pt-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</td>
                  <td className="pt-2 text-right font-bold text-gray-900 tabular-nums">
                    {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardSection>
    </Card>
  );
}
