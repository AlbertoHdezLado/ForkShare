// Formatting helpers for integer-cent amounts. All arithmetic on money must
// stay in cents; this module is the only place that turns cents into text.

import { useEffect, useState } from "react";

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function inputToCents(value: string): number {
  const normalized = value.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

// Reduce numerator/denominator to lowest terms so the UI can show the exact
// ratio behind a proportional split (e.g. "3/8 del subtotal") without ever
// falling back to floating point.
export function simplifyFraction(
  numerator: number,
  denominator: number,
): string | null {
  if (denominator <= 0 || numerator <= 0) return null;
  const divisor = gcd(numerator, denominator);
  const num = numerator / divisor;
  const den = denominator / divisor;
  if (num === den) return null;
  return `${num}/${den}`;
}

// Money <input> fields must not re-format their text on every keystroke:
// snapping the value to `centsToInput(cents)` after each change fights the
// user (e.g. typing "12.5" gets reformatted to "12.00" as soon as a single
// digit lands, so the third character never has anywhere valid to go).
// This hook keeps the field's own text while it's focused and only
// re-syncs it from the canonical `cents` value on blur/prop change.
export interface MoneyFieldProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function useMoneyField(
  cents: number,
  onCommit: (cents: number) => void,
): MoneyFieldProps {
  const [text, setText] = useState(() => centsToInput(cents));
  const [focused, setFocused] = useState(false);

  // Genuinely needs to re-sync from an external prop (e.g. editing unit
  // price recomputes the total shown in a sibling field), so this effect
  // intentionally sets state instead of computing it during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    if (!focused) setText(centsToInput(cents));
  }, [cents, focused]);

  return {
    value: text,
    onFocus: () => setFocused(true),
    onChange: (e) => {
      setText(e.target.value);
      onCommit(inputToCents(e.target.value));
    },
    onBlur: () => {
      setFocused(false);
      setText(centsToInput(cents));
    },
  };
}
