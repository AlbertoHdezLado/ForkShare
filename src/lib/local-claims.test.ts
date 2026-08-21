import { describe, expect, it } from "vitest";
import {
  buildSplitClaims,
  choiceGroup,
  choiceTotalUnits,
  choiceUnits,
  claimedUnits,
  isItemFullyClaimedByOthers,
  ownChoice,
  removeParticipantClaims,
  selectDefaultItemForParticipant,
  setClaimChoice,
  unitsTakenByOthers,
  unitsTakenExcludingOwner,
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

/** Atajo: elección en solitario de `key` sobre la línea i1. */
function solo(key: string, count: number): LocalClaims[string] {
  return { i1: [{ owner: key, choice: { mode: "units", count } }] };
}

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
    const after = setClaimChoice(before, "p1", "i1", "p1", {
      mode: "units",
      count: 2,
    });
    expect(before).toEqual({});
    expect(after).toEqual({
      p1: { i1: [{ owner: "p1", choice: { mode: "units", count: 2 } }] },
    });
  });

  it("borra solo la elección de ese autor al pasar null", () => {
    const withChoice: LocalClaims = { p1: solo("p1", 2) };
    expect(setClaimChoice(withChoice, "p1", "i1", "p1", null)).toEqual({
      p1: {},
    });
  });

  it("reemplaza la elección previa del mismo autor, no la de otros", () => {
    const otherEntry = {
      owner: "p2",
      choice: { mode: "units", count: 1, group: ["p2", "p1"] },
    } as const;
    const mixed: LocalClaims = {
      p1: {
        i1: [{ owner: "p1", choice: { mode: "units", count: 1 } }, otherEntry],
      },
    };
    const after = setClaimChoice(mixed, "p1", "i1", "p1", {
      mode: "units",
      count: 0.5,
    });
    expect(after.p1.i1).toEqual([
      otherEntry,
      { owner: "p1", choice: { mode: "units", count: 0.5 } },
    ]);
  });
});

describe("selectDefaultItemForParticipant", () => {
  it("no marca ninguna línea por defecto al entrar en un turno vacío", () => {
    const claims: LocalClaims = {};
    expect(selectDefaultItemForParticipant([pizza], claims, "p1")).toBe(claims);
  });

  it("mantiene las elecciones existentes y no añade ninguna por defecto", () => {
    const pasta = { ...pizza, id: "i2", name: "Pasta", quantity: 1 };
    const coveredPizza: LocalClaims = { p2: solo("p2", 2) };
    expect(
      selectDefaultItemForParticipant([pizza, pasta], coveredPizza, "p1"),
    ).toBe(coveredPizza);

    const existing: LocalClaims = { p1: solo("p1", 2) };
    expect(selectDefaultItemForParticipant([pizza], existing, "p1")).toBe(
      existing,
    );
  });
});

describe("claimedUnits / unitsTakenByOthers", () => {
  const claims: LocalClaims = {
    p1: solo("p1", 1),
    p2: { i1: [{ owner: "p2", choice: { mode: "half" } }] },
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
    const claims: LocalClaims = { p1: solo("p1", 1) };
    expect(isItemFullyClaimedByOthers(pizza, claims, "p2")).toBe(false);
  });

  it("es true cuando entre todos ya cubren la cantidad total", () => {
    const claims: LocalClaims = { p1: solo("p1", 1), p2: solo("p2", 1) };
    expect(isItemFullyClaimedByOthers(pizza, claims, "p3")).toBe(true);
  });

  it("es false para quien ya la tiene marcada (la está editando)", () => {
    const claims: LocalClaims = { p1: solo("p1", 1), p2: solo("p2", 1) };
    expect(isItemFullyClaimedByOthers(pizza, claims, "p1")).toBe(false);
  });
});

describe("buildSplitClaims", () => {
  it("omite entradas con 0 unidades y produce un claim por persona/línea marcada", () => {
    const claims: LocalClaims = { p1: solo("p1", 2), p2: {} };
    expect(buildSplitClaims([pizza], ["p1", "p2"], claims)).toEqual([
      { itemId: "i1", participantId: "p1", units: 2 },
    ]);
  });
});

describe("elecciones compartidas (grupo)", () => {
  // p1 comparte con p2 las 2 unidades de la pizza (1 cada uno).
  const groupChoice = {
    mode: "units",
    count: 2,
    group: ["p1", "p2"],
  } as const;
  const shared: LocalClaims = {
    p1: { i1: [{ owner: "p1", choice: groupChoice }] },
    p2: { i1: [{ owner: "p1", choice: groupChoice }] },
  };

  it("reparte el total entre el grupo", () => {
    expect(claimedUnits(pizza, shared, "p1")).toBe(1);
    expect(claimedUnits(pizza, shared, "p2")).toBe(1);
  });

  it("choiceTotalUnits devuelve el total del grupo, no la parte de cada uno", () => {
    expect(choiceTotalUnits(pizza, groupChoice)).toBe(2);
  });

  it("choiceGroup reconstruye con quién se compartió", () => {
    expect(choiceGroup("p1", ownChoice(shared, "p1", "i1"))).toEqual([
      "p1",
      "p2",
    ]);
  });

  it("solo el autor puede reeditar la elección compartida", () => {
    expect(ownChoice(shared, "p1", "i1")).toEqual(groupChoice);
    expect(ownChoice(shared, "p2", "i1")).toBeNull();
  });

  it("reeditar sin cambios reproduce las mismas unidades por persona", () => {
    const reconfirmed = setClaimChoice(shared, "p1", "i1", "p1", {
      mode: "units",
      count: choiceTotalUnits(pizza, groupChoice),
      group: ["p1", "p2"],
    });
    expect(claimedUnits(pizza, reconfirmed, "p1")).toBe(1);
  });
});

describe("elección propia + compartida por otro en la misma línea", () => {
  const cuatro = { ...pizza, quantity: 4 };
  // p1 marca 1 unidad para sí; después p2 comparte otra unidad con p1.
  const sharedChoice = {
    mode: "units",
    count: 1,
    group: ["p2", "p1"],
  } as const;
  const withShare = ["p2", "p1"].reduce<LocalClaims>(
    (acc, key) => setClaimChoice(acc, key, "i1", "p2", sharedChoice),
    { p1: solo("p1", 1) },
  );

  it("no pisa la elección en solitario de la otra persona", () => {
    expect(ownChoice(withShare, "p1", "i1")).toEqual({
      mode: "units",
      count: 1,
    });
  });

  it("suma la parte propia y la compartida", () => {
    expect(claimedUnits(cuatro, withShare, "p1")).toBe(1.5);
    expect(claimedUnits(cuatro, withShare, "p2")).toBe(0.5);
  });

  it("al reeditar solo se liberan las unidades del propio autor", () => {
    expect(unitsTakenExcludingOwner(cuatro, withShare, "p2")).toBe(1);
    expect(unitsTakenExcludingOwner(cuatro, withShare, "p1")).toBe(1);
  });
});

describe("removeParticipantClaims", () => {
  it("borra sus elecciones y le saca de los grupos del resto", () => {
    const sharedChoice = {
      mode: "units",
      count: 2,
      group: ["p1", "p2"],
    } as const;
    const claims: LocalClaims = {
      p1: { i1: [{ owner: "p1", choice: sharedChoice }] },
      p2: {
        i1: [
          { owner: "p1", choice: sharedChoice },
          { owner: "p2", choice: { mode: "units", count: 1 } },
        ],
      },
    };
    const after = removeParticipantClaims(claims, "p1");
    expect(after.p1).toBeUndefined();
    expect(after.p2.i1).toEqual([
      { owner: "p2", choice: { mode: "units", count: 1 } },
    ]);
  });
});
