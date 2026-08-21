// Editable state for the receipt editor: a plain, serializable shape decoupled
// from the OCR/parser output so manually added rows look the same as parsed ones.

import type { ItemParseConfidence } from "@/lib/receipt/types";

/** State of a product item in the receipt. */
export type ItemState = "probable" | "revisa" | "editado";

export interface EditableItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  /** Current state of the item: probable (medium confidence), revisa (needs review), or editado (manually edited). */
  state: ItemState;
  /** Set only for lines that came from the OCR parser; absent for manual rows. */
  confidence?: ItemParseConfidence;
}

export interface EditableExtras {
  taxCents: number;
  tipCents: number;
  serviceCents: number;
  discountCents: number;
  /** TOTAL line detected on the receipt, if any; used only to show the mismatch check. */
  detectedTotalCents: number | null;
}

export const EMPTY_EXTRAS: EditableExtras = {
  taxCents: 0,
  tipCents: 0,
  serviceCents: 0,
  discountCents: 0,
  detectedTotalCents: null,
};

/** Determine item state based on parse confidence: high/medium scored
 * items are "probable", low/very-low ones need review ("revisa"). */
export function getItemState(confidence?: ItemParseConfidence): ItemState {
  if (!confidence) return "editado";
  return confidence === "high" || confidence === "medium"
    ? "probable"
    : "revisa";
}

export function itemTotalCents(item: EditableItem): number {
  return item.quantity * item.unitPriceCents;
}

export function editorSubtotalCents(items: EditableItem[]): number {
  return items.reduce((sum, item) => sum + itemTotalCents(item), 0);
}

export function editorGrandTotalCents(
  items: EditableItem[],
  extras: EditableExtras,
): number {
  return (
    editorSubtotalCents(items) +
    extras.taxCents +
    extras.tipCents +
    extras.serviceCents -
    extras.discountCents
  );
}

let counter = 0;
export function newItemId(): string {
  counter += 1;
  return `new-${Date.now()}-${counter}`;
}
