"use client";

// Turno de un participante: se muestran las líneas como tarjetas centradas. Al
// tocar una se abre un modal para elegir "Solo" (una cantidad de unidades) o
// "Compartir" (con qué otros participantes y cuántas unidades entre todos). Al
// verificar se vuelve a la lista. Las líneas que ya cubren todas sus unidades
// entre el resto de participantes dejan de mostrarse (salvo que sea la propia
// elección la que se esté editando).

import { useState } from "react";
import { formatCents } from "@/lib/money";
import type { EditableItem } from "@/lib/receipt/editable";
import {
  choiceGroup,
  choiceTotalUnits,
  choiceUnits,
  isItemFullyClaimedByOthers,
  unitsTakenByOthers,
  type ClaimChoice,
  type LocalClaims,
} from "@/lib/local-claims";

interface Participant {
  readonly key: string;
  readonly name: string;
}

interface PersonClaimStepProps {
  readonly participantKey: string;
  readonly participantName: string;
  readonly participants: readonly Participant[];
  readonly items: readonly EditableItem[];
  readonly claims: LocalClaims;
  readonly onChange: (
    itemId: string,
    participantKeys: readonly string[],
    choice: ClaimChoice | null,
  ) => void;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}

export function PersonClaimStep({
  participantKey,
  participantName,
  participants,
  items,
  claims,
  onChange,
  onConfirm,
  onBack,
}: PersonClaimStepProps) {
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const own = claims[participantKey] ?? {};

  const selectedCents = items.reduce((sum, item) => {
    const choice = own[item.id];
    if (!choice) return sum;
    return sum + Math.round(choiceUnits(item, choice) * item.unitPriceCents);
  }, 0);

  const visibleItems = items.filter(
    (item) => !isItemFullyClaimedByOthers(item, claims, participantKey),
  );

  const openItem = visibleItems.find((item) => item.id === openItemId) ?? null;
  const others = participants.filter((p) => p.key !== participantKey);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xl font-bold text-accent">
        {participantName}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visibleItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            choice={own[item.id] ?? null}
            onClick={() => setOpenItemId(item.id)}
          />
        ))}
      </div>

      {visibleItems.length === 0 && (
        <p className="text-xs text-zinc-500">
          No quedan líneas por marcar: todas están ya cubiertas.
        </p>
      )}

      <p className="text-sm">
        Tu selección:{" "}
        <span className="font-semibold tabular-nums">
          {formatCents(selectedCents)}
        </span>
        <span className="text-xs text-zinc-500">
          {" "}
          (sin impuestos ni propina)
        </span>
      </p>

      <button
        type="button"
        onClick={onConfirm}
        className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
      >
        Verificar y pasar el móvil
      </button>
      <button
        type="button"
        onClick={onBack}
        className="rounded-full border border-accent px-5 py-2 text-sm font-medium text-accent hover:bg-accent/10"
      >
        Volver a la lista
      </button>

      {openItem && (
        <ItemClaimModal
          item={openItem}
          choice={own[openItem.id] ?? null}
          others={others}
          remainingUnits={unitsTakenByOthers(openItem, claims, participantKey)}
          selfKey={participantKey}
          onClose={() => setOpenItemId(null)}
          onApply={(participantKeys, choice) => {
            // Si el grupo cambia (p. ej. se quita a alguien), su elección
            // anterior queda obsoleta y hay que borrarla explícitamente.
            const previousGroup = choiceGroup(participantKey, own[openItem.id]);
            const staleKeys = previousGroup.filter(
              (key) => key !== participantKey && !participantKeys.includes(key),
            );
            if (staleKeys.length > 0) onChange(openItem.id, staleKeys, null);
            onChange(openItem.id, participantKeys, choice);
            setOpenItemId(null);
          }}
        />
      )}
    </div>
  );
}

interface ItemCardProps {
  readonly item: EditableItem;
  readonly choice: ClaimChoice | null;
  readonly onClick: () => void;
}

function ItemCard({ item, choice, onClick }: ItemCardProps) {
  const units = choice ? choiceUnits(item, choice) : 0;
  const hasChoice = choice !== null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center ${
        hasChoice
          ? "border-primary bg-primary/25"
          : "border-primary/20 bg-primary/10 dark:border-primary/25"
      }`}
    >
      <span className="flex min-h-10 w-full items-center justify-center">
        <span className="line-clamp-2 text-sm font-medium">
          {item.name || "(sin nombre)"}
        </span>
      </span>
      <span className="tabular-nums text-xs text-zinc-500">
        {formatUnits(item.quantity)} × {formatCents(item.unitPriceCents)}
      </span>
      <span
        className={`mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          hasChoice
            ? "bg-primary text-primary-foreground"
            : "border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700"
        }`}
      >
        {hasChoice ? `${formatUnits(units)} uds.` : "Sin marcar"}
      </span>
    </button>
  );
}

type ModalStage = "units" | "shared-people";

interface ItemClaimModalProps {
  readonly item: EditableItem;
  readonly choice: ClaimChoice | null;
  readonly others: readonly Participant[];
  /** Unidades ya tomadas por el resto de participantes (no disponibles para esta persona). */
  readonly remainingUnits: number;
  readonly selfKey: string;
  readonly onClose: () => void;
  readonly onApply: (
    participantKeys: readonly string[],
    choice: ClaimChoice | null,
  ) => void;
}

function ItemClaimModal({
  item,
  choice,
  others,
  remainingUnits,
  selfKey,
  onClose,
  onApply,
}: ItemClaimModalProps) {
  const existingGroup = choiceGroup(selfKey, choice).filter(
    (key) => key !== selfKey,
  );
  const [stage, setStage] = useState<ModalStage>("units");
  const [sharedWith, setSharedWith] = useState<string[]>(existingGroup);

  const takenByOthers = remainingUnits;
  // Unidades que ya tenía el resto del grupo (si esta elección era compartida):
  // hay que "liberarlas" también, porque al reeditar se puede rehacer el grupo.
  const currentPersonUnits = choice ? choiceUnits(item, choice) : 0;
  const currentGroupUnits = choice ? choiceTotalUnits(item, choice) : 0;
  const otherGroupMembersUnits = currentGroupUnits - currentPersonUnits;
  // Máximo que esta persona puede llegar a marcar: lo que aún no ha cogido
  // nadie más (fuera de su propio grupo), más lo que su grupo ya tenía marcado.
  const available = Math.max(
    item.quantity - takenByOthers + otherGroupMembersUnits,
    0,
  );

  const [text, setText] = useState(
    currentGroupUnits > 0 ? formatUnits(currentGroupUnits) : "",
  );
  const parsed = parseUnitsInput(text);
  const units = parsed === null ? null : clamp(parsed, 0, available);

  function setUnits(next: number) {
    setText(formatUnits(clamp(next, 0, available)));
  }

  function toggleShared(key: string) {
    setSharedWith((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />
      <div className="relative flex w-full max-w-sm flex-col gap-3 rounded-lg border border-accent/30 bg-background p-4 shadow-2xl">
        <div className="flex flex-col items-center gap-0.5 text-center">
          <p className="text-lg font-bold text-accent">
            {item.name || "(sin nombre)"}
          </p>
          <p className="text-xs text-zinc-500">
            {formatUnits(Math.max(available - (units ?? 0), 0))}/
            {formatUnits(item.quantity)} disponibles
          </p>
        </div>

        {stage === "units" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setUnits((units ?? 0) - 1)}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-xl font-semibold dark:border-zinc-700"
              >
                −
              </button>
              <input
                type="text"
                inputMode="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => {
                  if (text.trim() === "") setText("0");
                }}
                placeholder="0"
                className="w-20 rounded border border-zinc-300 bg-transparent px-2 py-2 text-center text-lg tabular-nums outline-none dark:border-zinc-700"
              />
              <button
                type="button"
                onClick={() => setUnits((units ?? 0) + 1)}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-xl font-semibold dark:border-zinc-700"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={() => setUnits(available)}
              className="self-center rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Seleccionar todo
            </button>

            {others.length > 0 && (
              <button
                type="button"
                disabled={units === null || units <= 0}
                onClick={() => setStage("shared-people")}
                className="mt-3 rounded-full border border-accent px-4 py-2.5 text-sm font-medium text-accent disabled:opacity-50"
              >
                Compartir
              </button>
            )}

            <button
              type="button"
              disabled={units === null || units <= 0}
              onClick={() =>
                onApply([selfKey], { mode: "units", count: units ?? 0 })
              }
              className="rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              Confirmar
            </button>

            {choice && (
              <button
                type="button"
                onClick={() => onApply([selfKey], null)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                Quitar mi selección
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm text-zinc-500"
            >
              Cancelar
            </button>
          </div>
        )}

        {stage === "shared-people" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-zinc-500">
              ¿Con quién has compartido {formatUnits(units ?? 0)} uds.?
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {others.map((person) => {
                const isSelected = sharedWith.includes(person.key);
                return (
                  <button
                    key={person.key}
                    type="button"
                    onClick={() => toggleShared(person.key)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {person.name || "(sin nombre)"}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setSharedWith(others.map((p) => p.key))}
              className="self-center rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Seleccionar todos
            </button>
            <button
              type="button"
              disabled={sharedWith.length === 0}
              onClick={() =>
                onApply([selfKey, ...sharedWith], {
                  mode: "units",
                  count: units ?? 0,
                  group: [selfKey, ...sharedWith],
                })
              }
              className="rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setStage("units")}
              className="rounded-full px-4 py-2 text-sm text-zinc-500"
            >
              Atrás
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function parseUnitsInput(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  // Fracción mixta o simple: "1 1/2", "3/4"...
  const fractionMatch = trimmed.match(/^(\d+\s+)?(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const whole = fractionMatch[1] ? Number.parseInt(fractionMatch[1], 10) : 0;
    const numerator = Number.parseInt(fractionMatch[2], 10);
    const denominator = Number.parseInt(fractionMatch[3], 10);
    if (denominator === 0) return null;
    return whole + numerator / denominator;
  }

  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Aproxima un decimal a la fracción n/d más sencilla con d <= maxDenominator. */
function toFraction(
  value: number,
  maxDenominator = 8,
): { numerator: number; denominator: number } {
  let bestNumerator = 0;
  let bestDenominator = 1;
  let bestError = Number.POSITIVE_INFINITY;
  for (let denominator = 1; denominator <= maxDenominator; denominator++) {
    const numerator = Math.round(value * denominator);
    const error = Math.abs(value - numerator / denominator);
    if (error < bestError) {
      bestError = error;
      bestNumerator = numerator;
      bestDenominator = denominator;
    }
  }
  return { numerator: bestNumerator, denominator: bestDenominator };
}

function formatUnits(units: number): string {
  const whole = Math.trunc(units);
  const fractional = Math.abs(units - whole);
  if (fractional < 1e-9) return String(whole);

  const { numerator, denominator } = toFraction(fractional);
  if (numerator === 0) return String(whole);
  if (numerator === denominator) return String(whole + Math.sign(units || 1));

  const fractionText = `${numerator}/${denominator}`;
  return whole === 0 ? fractionText : `${whole} ${fractionText}`;
}
