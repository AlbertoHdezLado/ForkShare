"use client";

import { useState } from "react";
import { ReceiptEditor } from "@/components/ReceiptEditor";
import {
  EMPTY_EXTRAS,
  type EditableItem,
  type EditableExtras,
} from "@/lib/receipt/editable";

export default function DebugConfidencePage() {
  const [items, setItems] = useState<EditableItem[]>([
    {
      id: "1",
      name: "CERVEZA",
      quantity: 1,
      unitPriceCents: 250,
      state: "probable",
      confidence: "high",
    },
    {
      id: "2",
      name: "PATATAS",
      quantity: 2,
      unitPriceCents: 200,
      state: "revisa",
      confidence: "medium",
    },
    {
      id: "3",
      name: "VINO",
      quantity: 1,
      unitPriceCents: 800,
      state: "revisa",
      confidence: "low",
    },
    {
      id: "4",
      name: "AGUA",
      quantity: 1,
      unitPriceCents: 150,
      state: "revisa",
      confidence: "very-low",
    },
    {
      id: "5",
      name: "MANUAL",
      quantity: 1,
      unitPriceCents: 100,
      state: "editado",
    },
  ]);
  const [extras, setExtras] = useState<EditableExtras>(EMPTY_EXTRAS);

  return (
    <div className="p-8">
      <ReceiptEditor
        items={items}
        extras={extras}
        onItemsChange={setItems}
        onExtrasChange={setExtras}
      />
    </div>
  );
}
