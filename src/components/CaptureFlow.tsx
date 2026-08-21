"use client";

import { useRef, useState } from "react";
import { getOcrProvider, preprocessReceiptImage } from "@/lib/ocr";
import { warpToRectangle, type Quad } from "@/lib/ocr/perspective";
import { parseReceipt } from "@/lib/receipt/parser";
import { computeSplit, type SplitResult } from "@/lib/split";
import { ReceiptEditor } from "@/components/ReceiptEditor";
import { CropStep } from "@/components/CropStep";
import { ParticipantRoster } from "@/components/ParticipantRoster";
import { PersonClaimStep } from "@/components/PersonClaimStep";
import { PersonTotals } from "@/components/PersonTotals";
import { formatCents } from "@/lib/money";
import {
  buildSplitClaims,
  selectDefaultItemForParticipant,
  setClaimChoice,
  type ClaimChoice,
  type LocalClaims,
} from "@/lib/local-claims";
import {
  EMPTY_EXTRAS,
  getItemState,
  newItemId,
  type EditableExtras,
  type EditableItem,
} from "@/lib/receipt/editable";

type ScanStatus =
  "idle" | "preprocessing" | "recognizing" | "parsing" | "done" | "error";

type LocalStage = "bill" | "names" | "roster" | "claim" | "results";

export function CaptureFlow() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const participantInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [rawFile, setRawFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCrop, setShowCrop] = useState(false);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);

  const [items, setItems] = useState<EditableItem[]>([]);
  const [extras, setExtras] = useState<EditableExtras>(EMPTY_EXTRAS);
  const [showEditor, setShowEditor] = useState(false);

  const [localStage, setLocalStage] = useState<LocalStage>("bill");
  const [participants, setParticipants] = useState<
    { key: string; name: string }[]
  >(() => [
    { key: newItemId(), name: "" },
    { key: newItemId(), name: "" },
  ]);
  const [claims, setClaims] = useState<LocalClaims>({});
  const [confirmedKeys, setConfirmedKeys] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [localResult, setLocalResult] = useState<SplitResult | null>(null);
  const [showBillInRoster, setShowBillInRoster] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  // Once diners start picking their items, the global bill is only reachable
  // through the "edit bill" toggle in the names roster, not shown by default.
  const showReceiptEditor =
    localStage === "bill" || (localStage === "roster" && showBillInRoster);

  function handleFileSelected(file: File) {
    setRawFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setScanError(null);
    setShowEditor(false);
    setShowCrop(true);
  }

  async function handleCropConfirmed(
    fractionalQuad: Quad,
    naturalWidth: number,
    naturalHeight: number,
  ) {
    if (!rawFile) return;
    setShowCrop(false);

    // CropStep reports corners as fractions (0-1) of the displayed image;
    // warpToRectangle needs actual pixel coordinates in the source image.
    const quad = fractionalQuad.map((point) => ({
      x: point.x * naturalWidth,
      y: point.y * naturalHeight,
    })) as Quad;

    try {
      setStatus("preprocessing");
      const warped = await warpToRectangle(rawFile, quad);
      const processed = await preprocessReceiptImage(warped);

      setStatus("recognizing");
      setProgress(0);
      const provider = getOcrProvider();
      const result = await provider.recognize(processed, (p) => {
        if (p.status === "recognizing text") setProgress(p.progress);
      });

      setStatus("parsing");
      const parsed = parseReceipt(result.words);

      setItems(
        parsed.items.map((item) => ({
          id: newItemId(),
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          state: getItemState(item.confidence),
          confidence: item.confidence,
        })),
      );
      setExtras({
        taxCents: sumByKind(parsed.summary, "tax"),
        tipCents: sumByKind(parsed.summary, "tip"),
        serviceCents: sumByKind(parsed.summary, "service"),
        discountCents: sumByKind(parsed.summary, "discount"),
        detectedTotalCents: parsed.detectedTotalCents,
      });

      setStatus("done");
      setShowEditor(true);
    } catch (err) {
      setStatus("error");
      setScanError(
        err instanceof Error ? err.message : "Error al leer el ticket",
      );
    }
  }

  async function copyResultToClipboard() {
    if (!localResult) return;
    const totalsLines = localResult.people.map(
      (person) => `${person.name}: ${formatCents(person.totalCents, "EUR")}`,
    );

    const breakdownLines = localResult.people.flatMap((person) => {
      const lines = [`${person.name}:`];
      if (person.items.length === 0) {
        lines.push("  No ha reclamado ninguna línea.");
      } else {
        for (const item of person.items) {
          const qty =
            item.claimedUnits > 0
              ? ` x${Math.round(item.claimedUnits * 100) / 100}`
              : "";
          lines.push(
            `  ${item.itemName}${qty}: ${formatCents(item.shareCents, "EUR")}`,
          );
        }
      }
      lines.push(`  Subtotal: ${formatCents(person.subtotalCents, "EUR")}`);
      if (person.taxCents > 0)
        lines.push(`  IVA: ${formatCents(person.taxCents, "EUR")}`);
      if (person.tipCents > 0)
        lines.push(
          `  Propina / servicio: ${formatCents(person.tipCents, "EUR")}`,
        );
      if (person.discountCents > 0) {
        lines.push(`  Descuento: -${formatCents(person.discountCents, "EUR")}`);
      }
      lines.push(`  Total: ${formatCents(person.totalCents, "EUR")}`);
      return lines;
    });

    const text = [...totalsLines, "", "Desglose:", ...breakdownLines].join(
      "\n",
    );

    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  function startManualEntry() {
    setItems([]);
    setExtras(EMPTY_EXTRAS);
    setShowEditor(true);
    setShowCrop(false);
    setStatus("idle");
    setScanError(null);
  }

  function removeParticipant(index: number) {
    const key = participants[index]?.key;
    setParticipants((prev) => prev.filter((_, i) => i !== index));
    if (!key) return;
    setClaims((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setConfirmedKeys((prev) => prev.filter((k) => k !== key));
  }

  function handleClaimChange(
    itemId: string,
    participantKeys: readonly string[],
    choice: ClaimChoice | null,
  ) {
    setClaims((prev) =>
      participantKeys.reduce(
        (acc, key) => setClaimChoice(acc, key, itemId, choice),
        prev,
      ),
    );
  }

  function confirmActiveParticipant() {
    if (!activeKey) return;
    setConfirmedKeys((prev) =>
      prev.includes(activeKey) ? prev : [...prev, activeKey],
    );
    setActiveKey(null);
    setLocalStage("roster");
  }

  function computeLocalResult() {
    const cleanParticipants = participants.filter((p) => p.name.trim());

    const result = computeSplit({
      items,
      claims: buildSplitClaims(
        items,
        cleanParticipants.map((p) => p.key),
        claims,
      ),
      participants: cleanParticipants.map((p) => ({
        id: p.key,
        name: p.name.trim(),
      })),
      extras: {
        taxCents: extras.taxCents,
        tipCents: extras.tipCents + extras.serviceCents,
        discountCents: extras.discountCents,
      },
    });

    setLocalResult(result);
    setLocalStage("results");
  }

  const isScanning =
    status === "preprocessing" ||
    status === "recognizing" ||
    status === "parsing";
  const namedParticipants = participants.filter((p) => p.name.trim());
  const hasDuplicateNames =
    new Set(namedParticipants.map((p) => normalizeParticipantName(p.name))).size !==
    namedParticipants.length;
  const canContinueFromNames = namedParticipants.length >= 2 && !hasDuplicateNames;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <picture>
          <source
            srcSet="/logo-dark.svg"
            media="(prefers-color-scheme: dark)"
          />
          <img src="/logo-light.svg" alt="MiTicket" className="h-16 w-auto" />
        </picture>
        {!showEditor && !showCrop && (
          <>
            <p className="text-xl font-bold text-accent">
              Selecciona una opción
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-left dark:border-accent/40">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" d="M12 11v5" />
                <path strokeLinecap="round" d="M12 8h.01" />
              </svg>
              <p className="text-sm text-accent">
                Sube la foto del ticket lo más recta y centrada posible, o añade
                las líneas a mano.
              </p>
            </div>
          </>
        )}
      </div>

      {showCrop && previewUrl && (
        <CropStep
          imageUrl={previewUrl}
          onCancel={() => {
            setShowCrop(false);
            cameraInputRef.current?.click();
          }}
          onConfirm={(quad, naturalWidth, naturalHeight) =>
            void handleCropConfirmed(quad, naturalWidth, naturalHeight)
          }
        />
      )}

      {!showEditor && !showCrop && (
        <div className="flex flex-col items-center gap-5 text-center">
          {/* Sin `capture`, para que el selector abra la galería en vez de la cámara */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = "";
            }}
          />
          {/* `capture="environment"` fuerza la cámara trasera en móviles */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = "";
            }}
          />

          <div className="grid w-full max-w-sm grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isScanning}
              aria-label="Hacer foto del ticket"
              className="flex flex-col items-center gap-3 rounded-2xl border border-primary/25 bg-primary/20 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md disabled:pointer-events-none disabled:opacity-50 dark:border-primary/40 dark:bg-primary/15"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.822 1.316Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
                  />
                </svg>
              </span>
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Hacer foto
              </span>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={isScanning}
              aria-label="Subir imagen del ticket"
              className="flex flex-col items-center gap-3 rounded-2xl border border-accent/25 bg-accent/20 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md disabled:pointer-events-none disabled:opacity-50 dark:border-accent/40 dark:bg-accent/15"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v2.75A1.25 1.25 0 0 0 5.25 20h13.5A1.25 1.25 0 0 0 20 18.75V16M8 8l4-4m0 0 4 4m-4-4v13"
                  />
                </svg>
              </span>
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Subir imagen
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={startManualEntry}
            disabled={isScanning}
            className="rounded-full border border-accent bg-accent-soft px-5 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            Introducir manualmente
          </button>

          {scanError && (
            <p className="text-sm text-error-foreground">{scanError}</p>
          )}
        </div>
      )}

      {isScanning && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border-t-4 border-t-primary bg-background p-6 text-center shadow-xl">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent-soft border-t-primary" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Leyendo ticket…
            </p>
            <p className="text-xs text-zinc-500">
              {status === "preprocessing" &&
                "Enderezando y preparando la imagen…"}
              {status === "recognizing" && "Reconociendo texto…"}
              {status === "parsing" && "Interpretando las líneas…"}
            </p>
            {status === "recognizing" && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {showEditor && (
        <>
          {showReceiptEditor && (
            <ReceiptEditor
              items={items}
              extras={extras}
              onItemsChange={setItems}
              onExtrasChange={setExtras}
            />
          )}

          {localStage === "bill" && (
            <button
              type="button"
              onClick={() => setLocalStage("names")}
              disabled={items.filter((item) => item.name.trim()).length === 0}
              className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              Continuar
            </button>
          )}

          {localStage === "names" && (
            <div className="flex flex-col gap-3">
              <p className="text-center text-xl font-bold text-accent">
                Introduce participantes
              </p>
              {participants.map((participant, index) => {
                // El último hueco vacío es solo un anticipo del siguiente
                // participante, no cuenta todavía: se muestra más tenue.
                const isPendingSlot =
                  index === participants.length - 1 && !participant.name.trim();
                return (
                  <div
                    key={participant.key}
                    className={`flex gap-2 transition-opacity ${
                      isPendingSlot ? "opacity-40" : "opacity-100"
                    }`}
                  >
                    <input
                      ref={(el) => {
                        participantInputRefs.current[index] = el;
                      }}
                      type="text"
                      value={participant.name}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        setParticipants((prev) => {
                          const normalizedValue = normalizeParticipantName(value);
                          const isDuplicate =
                            normalizedValue.length > 0 &&
                            prev.some(
                              (p, i) =>
                                i !== index &&
                                normalizeParticipantName(p.name) === normalizedValue,
                            );
                          if (isDuplicate) return prev;

                          const next = prev.map((p, i) =>
                            i === index ? { ...p, name: value } : p,
                          );
                          const wasLast = index === prev.length - 1;
                          if (wasLast && value.trim()) {
                            next.push({ key: newItemId(), name: "" });
                          }
                          return next;
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        // El siguiente input puede tardar un tick en montarse
                        // si este era el último hueco.
                        setTimeout(() => {
                          participantInputRefs.current[index + 1]?.focus();
                        }, 0);
                      }}
                      placeholder={`Participante ${index + 1}`}
                      enterKeyHint="next"
                      className="min-w-0 flex-1 rounded border-2 border-primary/75 bg-transparent px-3 py-2 text-sm uppercase shadow-[0_0_0_1px_rgba(34,197,94,0.18)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35 dark:border-primary/80"
                    />
                    {!isPendingSlot && (
                      <button
                        type="button"
                        onClick={() => removeParticipant(index)}
                        aria-label="Quitar participante"
                        className="rounded px-2 py-1 text-sm text-accent/70 hover:bg-error-bg hover:text-error-foreground"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setLocalStage("roster")}
                disabled={!canContinueFromNames}
                className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
              >
                Continuar
              </button>
              {hasDuplicateNames && (
                <p className="text-center text-sm text-error-foreground">
                  No se puede introducir el mismo nombre dos veces.
                </p>
              )}
            </div>
          )}

          {localStage === "roster" && (
            <ParticipantRoster
              participants={namedParticipants}
              confirmedKeys={confirmedKeys}
              onSelect={(key) => {
                setClaims((prev) =>
                  selectDefaultItemForParticipant(items, prev, key),
                );
                setActiveKey(key);
                setLocalStage("claim");
              }}
              onFinish={computeLocalResult}
              onEditNames={() => setLocalStage("names")}
              showBill={showBillInRoster}
              onToggleBill={() => setShowBillInRoster((prev) => !prev)}
            />
          )}

          {localStage === "claim" && activeKey && (
            <PersonClaimStep
              participantKey={activeKey}
              participantName={
                participants.find((p) => p.key === activeKey)?.name.trim() ?? ""
              }
              participants={namedParticipants.map((p) => ({
                key: p.key,
                name: p.name.trim(),
              }))}
              items={items}
              claims={claims}
              onChange={handleClaimChange}
              onConfirm={confirmActiveParticipant}
              onBack={() => {
                setActiveKey(null);
                setLocalStage("roster");
              }}
            />
          )}

          {localStage === "results" && localResult && (
            <div className="flex flex-col gap-3">
              {localResult.unclaimedItemIds.length > 0 && (
                <div className="rounded bg-warning-bg px-3 py-2 text-sm text-warning-foreground">
                  <p className="font-medium">
                    Hay productos sin asignar a nadie (se han repartido a partes
                    iguales):
                  </p>
                  <ul className="mt-1 list-disc pl-4">
                    {localResult.unclaimedItemIds.map((itemId) => {
                      const item = items.find((i) => i.id === itemId);
                      if (!item) return null;
                      return (
                        <li key={itemId}>
                          {item.name || "Producto sin nombre"} — {item.quantity}{" "}
                          ud. × {formatCents(item.unitPriceCents, "EUR")}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {localResult.people.map((person) => (
                <PersonTotals
                  key={person.participantId}
                  person={person}
                  currency="EUR"
                  hasPaid={false}
                  isOwn={false}
                />
              ))}
              <button
                type="button"
                onClick={() => {
                  void copyResultToClipboard();
                }}
                className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground"
              >
                {copyStatus === "copied" ? "Copiado" : "Copiar cuenta"}
              </button>
              {copyStatus === "error" && (
                <p className="text-xs text-error-foreground">
                  No se pudo copiar al portapapeles.
                </p>
              )}
              <button
                type="button"
                onClick={() => setLocalStage("roster")}
                className="rounded-full border border-accent px-5 py-2 text-sm font-medium text-accent hover:bg-accent/10"
              >
                Volver a repartir
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function sumByKind(
  summary: { kind: string; amountCents: number }[],
  kind: string,
): number {
  return summary
    .filter((s) => s.kind === kind)
    .reduce((sum, s) => sum + s.amountCents, 0);
}

function normalizeParticipantName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}
