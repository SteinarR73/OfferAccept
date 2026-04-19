'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardSection } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface QuoteData {
  description: string;
  lineItems: LineItem[];
}

// ─── QuoteSummary (editable) ──────────────────────────────────────────────────

interface QuoteSummaryProps {
  value: QuoteData;
  onChange: (data: QuoteData) => void;
}

function newLineItem(): LineItem {
  return { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 };
}

export function QuoteSummary({ value, onChange }: QuoteSummaryProps) {
  const [showLineItems, setShowLineItems] = useState(value.lineItems.length > 0);

  function updateDescription(description: string) {
    onChange({ ...value, description });
  }

  function addLineItem() {
    onChange({ ...value, lineItems: [...value.lineItems, newLineItem()] });
    setShowLineItems(true);
  }

  function updateLineItem(id: string, patch: Partial<LineItem>) {
    onChange({
      ...value,
      lineItems: value.lineItems.map((li) => (li.id === id ? { ...li, ...patch } : li)),
    });
  }

  function removeLineItem(id: string) {
    const updated = value.lineItems.filter((li) => li.id !== id);
    onChange({ ...value, lineItems: updated });
    if (updated.length === 0) setShowLineItems(false);
  }

  const total = value.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  return (
    <Card>
      <CardHeader
        title="Quote summary"
        description="Optional pricing and deal context"
        border
      />
      <CardSection>
        <div className="space-y-4">
          {/* Description textarea */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Deal description
              <span className="font-normal text-(--color-text-muted) ml-1">(optional)</span>
            </label>
            <textarea
              value={value.description}
              onChange={(e) => updateDescription(e.target.value)}
              placeholder="Describe what's included in this deal…"
              rows={3}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white',
                'placeholder:text-gray-400 text-gray-900',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                'resize-y min-h-[72px] transition-colors',
              )}
            />
          </div>

          {/* Line items */}
          {showLineItems && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Line items</p>
              <div className="space-y-2">
                {value.lineItems.map((li) => (
                  <div key={li.id} className="flex items-start gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder="Item description"
                        value={li.description}
                        onChange={(e) => updateLineItem(li.id, { description: e.target.value })}
                        aria-label="Item description"
                      />
                    </div>
                    <div className="w-16 flex-shrink-0">
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={li.quantity}
                        min={1}
                        onChange={(e) => updateLineItem(li.id, { quantity: Number(e.target.value) })}
                        aria-label="Quantity"
                      />
                    </div>
                    <div className="w-24 flex-shrink-0">
                      <Input
                        type="number"
                        placeholder="Price"
                        value={li.unitPrice}
                        min={0}
                        step={0.01}
                        onChange={(e) => updateLineItem(li.id, { unitPrice: Number(e.target.value) })}
                        aria-label="Unit price"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLineItem(li.id)}
                      className="mt-1.5 p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors focus-visible:ring-2 focus-visible:ring-red-400"
                      aria-label="Remove line item"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Total */}
              {value.lineItems.length > 0 && (
                <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">
                    Total:{' '}
                    <span className="tabular-nums">
                      {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Add line item toggle */}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addLineItem}
              leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Add line item
            </Button>
          </div>
        </div>
      </CardSection>
    </Card>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Serialise QuoteData into a string to embed in offer message field */
export function serializeQuote(description: string, quote: QuoteData): string {
  const parts: string[] = [];
  if (description.trim()) parts.push(description.trim());
  if (quote.description.trim()) parts.push(`\n${quote.description.trim()}`);
  if (quote.lineItems.length > 0) {
    parts.push('\n\nLine items:');
    for (const li of quote.lineItems) {
      if (li.description.trim()) {
        const subtotal = li.quantity * li.unitPrice;
        parts.push(`• ${li.description} × ${li.quantity} = ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
      }
    }
    const total = quote.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
    parts.push(`Total: ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
  }
  return parts.join('\n');
}
