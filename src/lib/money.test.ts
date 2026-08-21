import { describe, expect, it } from "vitest";
import {
  centsToInput,
  formatCents,
  inputToCents,
  simplifyFraction,
} from "./money";

describe("centsToInput", () => {
  it("formats cents as a fixed 2-decimal string", () => {
    expect(centsToInput(0)).toBe("0.00");
    expect(centsToInput(150)).toBe("1.50");
    expect(centsToInput(999)).toBe("9.99");
  });
});

describe("inputToCents", () => {
  it("parses dot-decimal input", () => {
    expect(inputToCents("1.50")).toBe(150);
  });

  it("parses comma-decimal input", () => {
    expect(inputToCents("1,5")).toBe(150);
  });

  it("rounds to the nearest cent", () => {
    // 1.005 isn't exactly representable in floating point (~1.00499999...),
    // so it rounds down to the nearest cent instead of up.
    expect(inputToCents("1.005")).toBe(100);
  });

  it("returns 0 for empty or invalid input", () => {
    expect(inputToCents("")).toBe(0);
    expect(inputToCents("abc")).toBe(0);
  });
});

describe("formatCents", () => {
  it("formats cents as EUR currency by default", () => {
    expect(formatCents(150)).toContain("1,50");
    expect(formatCents(150)).toContain("€");
  });

  it("respects an explicit currency code", () => {
    expect(formatCents(150, "USD")).toContain("1,50");
  });
});

describe("simplifyFraction", () => {
  it("reduces a fraction to its lowest terms", () => {
    expect(simplifyFraction(6, 8)).toBe("3/4");
  });

  it("returns null when numerator equals denominator", () => {
    expect(simplifyFraction(4, 4)).toBeNull();
  });

  it("returns null for non-positive inputs", () => {
    expect(simplifyFraction(0, 4)).toBeNull();
    expect(simplifyFraction(4, 0)).toBeNull();
    expect(simplifyFraction(-1, 4)).toBeNull();
  });
});
