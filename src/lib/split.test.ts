import { describe, expect, it } from "vitest";
import { computeSplit } from "./split";

const participants = [
  { id: "a", name: "Ana" },
  { id: "b", name: "Bea" },
  { id: "c", name: "Cris" },
];

describe("computeSplit", () => {
  it("reparte un ítem compartido entre 3 personas cuadrando al céntimo", () => {
    // 10.00€ entre 3 no es exacto (333.33...), el resto mayor decide quién paga el céntimo extra.
    const result = computeSplit({
      items: [{ id: "i1", name: "Pizza", quantity: 1, unitPriceCents: 1000 }],
      claims: [
        { itemId: "i1", participantId: "a", units: 1 },
        { itemId: "i1", participantId: "b", units: 1 },
        { itemId: "i1", participantId: "c", units: 1 },
      ],
      participants,
      extras: { taxCents: 0, tipCents: 0, discountCents: 0 },
    });

    const totals = result.people.map((p) => p.totalCents);
    expect(totals.reduce((s, v) => s + v, 0)).toBe(1000);
    expect(totals.sort((x, y) => x - y)).toEqual([333, 333, 334]);
    expect(result.unclaimedItemIds).toEqual([]);
  });

  it("prorratea una propina del 10% proporcionalmente al consumo", () => {
    const result = computeSplit({
      items: [
        { id: "i1", name: "Plato caro", quantity: 1, unitPriceCents: 3000 },
        { id: "i2", name: "Plato barato", quantity: 1, unitPriceCents: 1000 },
      ],
      claims: [
        { itemId: "i1", participantId: "a", units: 1 },
        { itemId: "i2", participantId: "b", units: 1 },
      ],
      participants: participants.slice(0, 2),
      extras: { taxCents: 0, tipCents: 400, discountCents: 0 }, // 10% de 4000
    });

    const ana = result.people.find((p) => p.participantId === "a")!;
    const bea = result.people.find((p) => p.participantId === "b")!;
    expect(ana.tipCents).toBe(300);
    expect(bea.tipCents).toBe(100);
    expect(ana.totalCents).toBe(3300);
    expect(bea.totalCents).toBe(1100);
    expect(result.grandTotalCents).toBe(4400);
  });

  it("prorratea un descuento fijo proporcionalmente al consumo", () => {
    const result = computeSplit({
      items: [
        { id: "i1", name: "Plato caro", quantity: 1, unitPriceCents: 3000 },
        { id: "i2", name: "Plato barato", quantity: 1, unitPriceCents: 1000 },
      ],
      claims: [
        { itemId: "i1", participantId: "a", units: 1 },
        { itemId: "i2", participantId: "b", units: 1 },
      ],
      participants: participants.slice(0, 2),
      extras: { taxCents: 0, tipCents: 0, discountCents: 400 },
    });

    const ana = result.people.find((p) => p.participantId === "a")!;
    const bea = result.people.find((p) => p.participantId === "b")!;
    expect(ana.discountCents).toBe(300);
    expect(bea.discountCents).toBe(100);
    expect(ana.totalCents).toBe(2700);
    expect(bea.totalCents).toBe(900);
    expect(result.grandTotalCents).toBe(3600);
  });

  it("reparte un ítem sin reclamar entre todos y lo marca como tal", () => {
    const result = computeSplit({
      items: [
        { id: "i1", name: "Reclamado", quantity: 1, unitPriceCents: 900 },
        { id: "i2", name: "Sin reclamar", quantity: 1, unitPriceCents: 300 },
      ],
      claims: [{ itemId: "i1", participantId: "a", units: 1 }],
      participants: participants.slice(0, 3),
      extras: { taxCents: 0, tipCents: 0, discountCents: 0 },
    });

    expect(result.unclaimedItemIds).toEqual(["i2"]);
    const totals = result.people.map((p) => p.totalCents);
    expect(totals.reduce((s, v) => s + v, 0)).toBe(1200);
    // i2 (300c) se reparte 100/100/100 entre los tres; i1 (900c) es todo de "a".
    const ana = result.people.find((p) => p.participantId === "a")!;
    const bea = result.people.find((p) => p.participantId === "b")!;
    const cris = result.people.find((p) => p.participantId === "c")!;
    expect(ana.totalCents).toBe(1000);
    expect(bea.totalCents).toBe(100);
    expect(cris.totalCents).toBe(100);
  });

  it("no reparte nada a quien no participa cuando no hay ítems sin reclamar", () => {
    const result = computeSplit({
      items: [{ id: "i1", name: "Café", quantity: 1, unitPriceCents: 150 }],
      claims: [{ itemId: "i1", participantId: "a", units: 1 }],
      participants,
      extras: { taxCents: 0, tipCents: 0, discountCents: 0 },
    });

    const bea = result.people.find((p) => p.participantId === "b")!;
    const cris = result.people.find((p) => p.participantId === "c")!;
    expect(bea.totalCents).toBe(0);
    expect(cris.totalCents).toBe(0);
    expect(bea.items).toEqual([]);
  });
});
