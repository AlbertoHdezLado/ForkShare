"use client";

import { ItemRow } from "@/components/ItemRow";
import { formatCents, useMoneyField } from "@/lib/money";
import {
  editorGrandTotalCents,
  editorSubtotalCents,
  newItemId,
  type EditableExtras,
  type EditableItem,
} from "@/lib/receipt/editable";

interface ReceiptEditorProps {
  readonly items: EditableItem[];
  readonly extras: EditableExtras;
  readonly onItemsChange: (items: EditableItem[]) => void;
  readonly onExtrasChange: (extras: EditableExtras) => void;
}

export function ReceiptEditor({
  items,
  extras,
  onItemsChange,
  onExtrasChange,
}: ReceiptEditorProps) {
  const subtotalCents = editorSubtotalCents(items);
  const grandTotalCents = editorGrandTotalCents(items, extras);
  const mismatchDeltaCents =
    extras.detectedTotalCents === null
      ? null
      : extras.detectedTotalCents - grandTotalCents;

  function updateItem(index: number, next: EditableItem) {
    onItemsChange(items.map((item, i) => (i === index ? next : item)));
  }

  function removeItem(index: number) {
    onItemsChange(items.filter((_, i) => i !== index));
  }

  function addItem() {
    onItemsChange([
      ...items,
      {
        id: newItemId(),
        name: "",
        quantity: 1,
        unitPriceCents: 0,
        state: "editado",
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-xl font-bold text-accent">
        Revisa los productos
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-xs text-zinc-500">
        <span>Fiabilidad de la lectura:</span>
        <Legend color="bg-success-card-bg border-success-solid" label="alta" />
        <Legend color="bg-warning-card-bg border-warning-solid" label="baja" />
        <Legend color="bg-info-card-bg border-info-solid" label="editado" />
      </div>
      <div className="flex flex-col">
        {/* En móvil cada línea ya lleva sus propias etiquetas (Uds./Precio/Total) */}
        <div className="hidden items-center gap-2 px-3 pb-1 text-xs font-medium text-zinc-500 sm:flex">
          <span className="flex-1">Producto</span>
          <span className="w-14 text-center">Uds.</span>
          <span className="w-20 text-right">Precio</span>
          <span className="w-20 text-right">Total</span>
          <span className="w-7" />
        </div>
        {items.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            onChange={(next) => updateItem(index, next)}
            onRemove={() => removeItem(index)}
          />
        ))}
        <button
          type="button"
          onClick={addItem}
          className="mt-2 flex items-center justify-center gap-1 rounded border border-dashed border-zinc-300 py-2 text-sm text-zinc-500 hover:border-primary hover:text-primary dark:border-zinc-700"
        >
          + Agregar producto
        </button>
      </div>

      {extras.detectedTotalCents === null && (
        <div className="rounded bg-info-bg px-3 py-2 text-sm text-info-foreground">
          No se detectó el total de la factura. Introduce manualmente el total
          para verificar los precios de los productos.
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-primary/20 bg-primary/15 p-3 text-sm dark:border-primary/25 dark:bg-primary/10">
        <ExtraField
          label="IVA"
          cents={extras.taxCents}
          onChange={(cents) => onExtrasChange({ ...extras, taxCents: cents })}
        />
        <ExtraField
          label="Propina"
          cents={extras.tipCents}
          onChange={(cents) => onExtrasChange({ ...extras, tipCents: cents })}
        />
        <ExtraField
          label="Servicio"
          cents={extras.serviceCents}
          onChange={(cents) =>
            onExtrasChange({ ...extras, serviceCents: cents })
          }
        />
        <ExtraField
          label="Descuento"
          cents={extras.discountCents}
          onChange={(cents) =>
            onExtrasChange({ ...extras, discountCents: cents })
          }
        />
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Subtotal productos</span>
          <span className="flex items-center gap-1.5 tabular-nums">
            {mismatchDeltaCents !== null &&
              Math.abs(mismatchDeltaCents) > 2 && (
                <span aria-hidden="true">⚠️</span>
              )}
            {formatCents(subtotalCents)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 font-semibold">
          <span>Total</span>
          <TotalField
            cents={extras.detectedTotalCents ?? grandTotalCents}
            onChange={(cents) =>
              onExtrasChange({ ...extras, detectedTotalCents: cents })
            }
          />
        </div>

        {mismatchDeltaCents !== null && Math.abs(mismatchDeltaCents) > 2 && (
          <p className="mt-1 rounded bg-warning-bg px-2 py-1 text-warning-foreground">
            <span>
              El total del ticket ({formatCents(extras.detectedTotalCents!)}) no
              cuadra con las líneas: diferencia de{" "}
              {formatCents(Math.abs(mismatchDeltaCents))}. Revisa las líneas
              antes de continuar.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
}: {
  readonly color: string;
  readonly label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded border ${color}`} />
      {label}
    </span>
  );
}

function ExtraField({
  label,
  cents,
  onChange,
}: {
  readonly label: string;
  readonly cents: number;
  readonly onChange: (cents: number) => void;
}) {
  const field = useMoneyField(cents, onChange);
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        {...field}
        className="w-20 rounded border border-zinc-300 bg-transparent px-2 py-1 text-right dark:border-zinc-700"
      />
    </label>
  );
}

function TotalField({
  cents,
  onChange,
}: {
  readonly cents: number;
  readonly onChange: (cents: number) => void;
}) {
  const field = useMoneyField(cents, onChange);
  return (
    <input
      type="text"
      inputMode="decimal"
      {...field}
      className="w-24 rounded border border-zinc-300 bg-transparent px-2 py-1 text-right tabular-nums dark:border-zinc-700"
    />
  );
}
