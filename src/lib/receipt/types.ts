// Shared types for the receipt line parser and its editable state.
// Every money amount is an integer number of cents, never a float.

export type ReceiptLineKind =
  "item" | "subtotal" | "total" | "tax" | "tip" | "service" | "discount";

/** How confident the parser is that an item line was read/interpreted correctly. */
export type ItemParseConfidence = "high" | "medium" | "low" | "very-low";

export interface ParsedItemLine {
  id: string;
  kind: "item";
  raw: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  confidence: ItemParseConfidence;
}

export interface ParsedSummaryLine {
  id: string;
  kind: Exclude<ReceiptLineKind, "item">;
  raw: string;
  amountCents: number;
}

export type ParsedLine = ParsedItemLine | ParsedSummaryLine;

export interface ParsedReceipt {
  items: ParsedItemLine[];
  summary: ParsedSummaryLine[];
  /** Lines that had no price token and could not be classified. */
  unmatchedLines: string[];
  /** Sum of every item's totalCents. */
  itemsSubtotalCents: number;
  /** Best-effort total the receipt claims to have (TOTAL line, if found). */
  detectedTotalCents: number | null;
  /** true when itemsSubtotalCents (+ extras) doesn't reconcile with detectedTotalCents. */
  mismatch: boolean;
  mismatchDeltaCents: number;
}
