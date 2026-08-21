// Modo local "pasa el móvil": cada participante marca, en su turno, qué ha tomado
// de cada línea del ticket. Se guarda la *elección* (todo / una unidad / una
// parte) y no las unidades ya calculadas, para poder editarla después.

import type { EditableItem } from "@/lib/receipt/editable";
import type { SplitClaimInput } from "@/lib/split";

export type ClaimChoice =
  | { mode: "half" }
  // `count` es el TOTAL de unidades que consume el grupo entero (no la
  // parte de cada persona); `group` son las claves de todos los que la
  // comparten (incluida esta persona). Sin `group` equivale a un grupo de 1
  // (elección en solitario). Todas las personas del grupo guardan la misma
  // elección, para poder reconstruir el reparto al reeditarla.
  | { mode: "units"; count: number; group?: readonly string[] };

export type ClaimMode = ClaimChoice["mode"] | "none";

/** clave de participante -> id de línea -> elección */
export type LocalClaims = Record<string, Record<string, ClaimChoice>>;

/** Unidades totales (antes de repartir) que representa una elección. */
export function choiceTotalUnits(
  item: EditableItem,
  choice: ClaimChoice,
): number {
  switch (choice.mode) {
    case "half":
      return 0.5;
    case "units":
      return Math.min(Math.max(choice.count, 0), item.quantity);
  }
}

/** Personas (incluida la propia) que comparten una elección; [] si no hay elección. */
export function choiceGroup(
  participantKey: string,
  choice: ClaimChoice | null | undefined,
): readonly string[] {
  if (!choice) return [];
  if (choice.mode === "units" && choice.group) return choice.group;
  return [participantKey];
}

export function choiceUnits(item: EditableItem, choice: ClaimChoice): number {
  switch (choice.mode) {
    case "half":
      return 0.5;
    case "units": {
      const divisor = Math.max(choice.group?.length ?? 1, 1);
      return choiceTotalUnits(item, choice) / divisor;
    }
  }
}

export function claimedUnits(
  item: EditableItem,
  claims: LocalClaims,
  participantKey: string,
): number {
  const choice = claims[participantKey]?.[item.id];
  return choice ? choiceUnits(item, choice) : 0;
}

/** Unidades de una línea ya marcadas por el resto de participantes. */
export function unitsTakenByOthers(
  item: EditableItem,
  claims: LocalClaims,
  participantKey: string,
): number {
  let total = 0;
  for (const key of Object.keys(claims)) {
    if (key === participantKey) continue;
    total += claimedUnits(item, claims, key);
  }
  return total;
}

export function setClaimChoice(
  claims: LocalClaims,
  participantKey: string,
  itemId: string,
  choice: ClaimChoice | null,
): LocalClaims {
  const forPerson = { ...(claims[participantKey] ?? {}) };
  if (choice === null) delete forPerson[itemId];
  else forPerson[itemId] = choice;
  return { ...claims, [participantKey]: forPerson };
}

/** Marca una unidad de la primera línea disponible al iniciar un turno vacío. */
export function selectDefaultItemForParticipant(
  items: readonly EditableItem[],
  claims: LocalClaims,
  participantKey: string,
): LocalClaims {
  if (Object.keys(claims[participantKey] ?? {}).length > 0) return claims;

  const item = items.find(
    (candidate) => candidate.quantity - unitsTakenByAll(candidate, claims) >= 1,
  );
  return item
    ? setClaimChoice(claims, participantKey, item.id, {
        mode: "units",
        count: 1,
      })
    : claims;
}

/** Unidades de una línea ya marcadas por cualquier participante (incluida esta persona). */
export function unitsTakenByAll(
  item: EditableItem,
  claims: LocalClaims,
): number {
  let total = 0;
  for (const key of Object.keys(claims)) {
    total += claimedUnits(item, claims, key);
  }
  return total;
}

/**
 * Una línea deja de mostrarse a un participante cuando entre todos ya han marcado
 * todas sus unidades, salvo que sea quien la está editando (para poder
 * corregir su propia selección).
 */
export function isItemFullyClaimedByOthers(
  item: EditableItem,
  claims: LocalClaims,
  participantKey: string,
): boolean {
  if (claims[participantKey]?.[item.id]) return false;
  return unitsTakenByAll(item, claims) >= item.quantity;
}

export function buildSplitClaims(
  items: EditableItem[],
  participantKeys: string[],
  claims: LocalClaims,
): SplitClaimInput[] {
  const result: SplitClaimInput[] = [];
  for (const item of items) {
    for (const participantId of participantKeys) {
      const units = claimedUnits(item, claims, participantId);
      if (units > 0) result.push({ itemId: item.id, participantId, units });
    }
  }
  return result;
}
