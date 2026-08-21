import { describe, expect, it } from "vitest";
import {
  buildSplitClaims,
  choiceGroup,
  choiceTotalUnits,
  choiceUnits,
  claimedUnits,
  isItemFullyClaimedByOthers,
  selectDefaultItemForParticipant,
  setClaimChoice,
  unitsTakenByOthers,
  type LocalClaims,
} from "./local-claims";
import type { EditableItem } from "./receipt/editable";

const pizza: EditableItem = {
  id: "i1",
  name: "Pizza",
  quantity: 2,
  unitPriceCents: 1000,
  state: "editado",
};

describe("choiceUnits", () => {
  it("half -> media unidad", () => {
    expect(choiceUnits(pizza, { mode: "half" })).toBe(0.5);
  });

  it("units -> N unidades, sin superar la cantidad disponible", () => {
    expect(choiceUnits(pizza, { mode: "units", count: 1 })).toBe(1);
    expect(choiceUnits(pizza, { mode: "units", count: 2 })).toBe(2);
    expect(
      choiceUnits({ ...pizza, quantity: 0.5 }, { mode: "units", count: 1 }),
    ).toBe(0.5);
  });

  it("units -> admite decimales", () => {
    expect(choiceUnits(pizza, { mode: "units", count: 0.25 })).toBe(0.25);
  });
});

describe("setClaimChoice", () => {
  it("añade una elección sin mutar el estado original", () => {
    const before: LocalClaims = {};
    const after = setClaimChoice(before, "p1", "i1", {
      mode: "units",
      count: 2,
    });
    expect(before).toEqual({});
    expect(after).toEqual({ p1: { i1: { mode: "units", count: 2 } } });
  });

  it("borra la elección al pasar null", () => {
    const withChoice: LocalClaims = { p1: { i1: { mode: "units", count: 2 } } };
    const after = setClaimChoice(withChoice, "p1", "i1", null);
    expect(after).toEqual({ p1: {} });
  });
});

describe("selectDefaultItemForParticipant", () => {
  it("marca una unidad de la primera línea disponible en un turno vacío", () => {
    const claims = selectDefaultItemForParticipant([pizza], {}, "p1");
    expect(claims).toEqual({ p1: { i1: { mode: "units", count: 1 } } });
  });

  it("salta líneas ya cubiertas y mantiene las elecciones existentes", () => {
    const pasta = { ...pizza, id: "i2", name: "Pasta", quantity: 1 };
    const coveredPizza: LocalClaims = {
      p2: { i1: { mode: "units", count: 2 } },
    };
    expect(selectDefaultItemForParticipant([pizza, pasta], coveredPizza, "p1"))
      .toEqual({
        p1: { i2: { mode: "units", count: 1 } },
        p2: { i1: { mode: "units", count: 2 } },
      });

    const existing: LocalClaims = { p1: { i1: { mode: "units", count: 2 } } };
    expect(selectDefaultItemForParticipant([pizza], existing, "p1")).toBe(
      existing,
    );
  });
});

describe("claimedUnits / unitsTakenByOthers", () => {
  const claims: LocalClaims = {
    p1: { i1: { mode: "units", count: 1 } },
    p2: { i1: { mode: "half" } },
  };

  it("devuelve 0 si la persona no ha marcado nada en esa línea", () => {
    expect(claimedUnits(pizza, claims, "p3")).toBe(0);
  });

  it("suma las unidades marcadas por el resto de participantes", () => {
    expect(unitsTakenByOthers(pizza, claims, "p1")).toBe(0.5);
    expect(unitsTakenByOthers(pizza, claims, "p3")).toBe(1.5);
  });
});

describe("isItemFullyClaimedByOthers", () => {
  it("es false mientras queden unidades sin marcar", () => {
    const claims: LocalClaims = { p1: { i1: { mode: "units", count: 1 } } };
    expect(isItemFullyClaimedByOthers(pizza, claims, "p2")).toBe(false);
  });

  it("es true cuando entre todos ya cubren la cantidad total", () => {
    const claims: LocalClaims = {
      p1: { i1: { mode: "units", count: 1 } },
      p2: { i1: { mode: "units", count: 1 } },
    };
    expect(isItemFullyClaimedByOthers(pizza, claims, "p3")).toBe(true);
  });

  it("es false para quien ya la tiene marcada (la está editando)", () => {
    const claims: LocalClaims = {
      p1: { i1: { mode: "units", count: 1 } },
      p2: { i1: { mode: "units", count: 1 } },
    };
    expect(isItemFullyClaimedByOthers(pizza, claims, "p1")).toBe(false);
  });
});

describe("buildSplitClaims", () => {
  it("omite entradas con 0 unidades y produce un claim por persona/línea marcada", () => {
    const claims: LocalClaims = {
      p1: { i1: { mode: "units", count: 2 } },
      p2: {},
    };
    expect(buildSplitClaims([pizza], ["p1", "p2"], claims)).toEqual([
      { itemId: "i1", participantId: "p1", units: 2 },
    ]);
  });
});

describe("elecciones compartidas (grupo)", () => {
  // Dos personas comparten 2 de las 2 unidades de la pizza (1 cada una).
  const shared: LocalClaims = {
    p1: { i1: { mode: "units", count: 2, group: ["p1", "p2"] } },
    p2: { i1: { mode: "units", count: 2, group: ["p1", "p2"] } },
  };

  it("choiceUnits reparte el total entre el grupo", () => {
    expect(choiceUnits(pizza, shared.p1.i1)).toBe(1);
    expect(choiceUnits(pizza, shared.p2.i1)).toBe(1);
  });

  it("choiceTotalUnits devuelve el total del grupo, no la parte de cada uno", () => {
    expect(choiceTotalUnits(pizza, shared.p1.i1)).toBe(2);
  });

  it("choiceGroup reconstruye con quién se compartió", () => {
    expect(choiceGroup("p1", shared.p1.i1)).toEqual(["p1", "p2"]);
  });

  it("reeditar sin cambios reproduce las mismas unidades por persona (no se dividen dos veces)", () => {
    // Al reabrir, el modal debería prellenar con choiceTotalUnits (2), y al
    // volver a confirmar con el mismo grupo, el resultado debe seguir siendo 1 c/u.
    const reconfirmed = setClaimChoice(shared, "p1", "i1", {
      mode: "units",
      count: choiceTotalUnits(pizza, shared.p1.i1),
      group: ["p1", "p2"],
    });
    expect(choiceUnits(pizza, reconfirmed.p1.i1)).toBe(1);
  });
});
