"use client";

// Lets the user drag the four corners of the ticket over the photo they just
// took, so the perspective-correction step knows exactly what to straighten
// and crop before OCR runs.

import { useEffect, useRef, useState } from "react";
import type { Point, Quad } from "@/lib/ocr/perspective";

const DEFAULT_CORNERS: Quad = [
  { x: 0.12, y: 0.08 },
  { x: 0.88, y: 0.08 },
  { x: 0.88, y: 0.92 },
  { x: 0.12, y: 0.92 },
];

const HANDLE_LABELS = [
  "Superior izq.",
  "Superior der.",
  "Inferior der.",
  "Inferior izq.",
];

interface CropStepProps {
  readonly imageUrl: string;
  readonly onConfirm: (
    quad: Quad,
    naturalWidth: number,
    naturalHeight: number,
  ) => void;
  readonly onCancel: () => void;
}

export function CropStep({ imageUrl, onConfirm, onCancel }: CropStepProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [corners, setCorners] = useState<Quad>(DEFAULT_CORNERS);
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const draggingIndex = useRef<number | null>(null);

  // Once the photo has loaded and its final height is known, center it
  // vertically in the viewport if it overflows (mainly for mobile screens).
  useEffect(() => {
    if (!naturalSize) return;
    containerRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [naturalSize]);

  function fractionFromEvent(e: { clientX: number; clientY: number }): Point {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const index = draggingIndex.current;
    if (index === null) return;
    const point = fractionFromEvent(e);
    setCorners((prev) => {
      const next = [...prev] as Quad;
      next[index] = point;
      return next;
    });
  }

  function stopDragging() {
    draggingIndex.current = null;
  }

  const polygonPoints = corners
    .map((c) => `${c.x * 100},${c.y * 100}`)
    .join(" ");

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-center text-xl font-bold text-accent">
        Ajusta las esquinas del ticket
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
          Arrastra cada esquina hasta hacerla coincidir con el borde del ticket
          para que el recorte sea preciso.
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative w-full max-w-sm touch-pan-y select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Foto del ticket"
          className="w-full rounded"
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            setNaturalSize({
              width: img.naturalWidth,
              height: img.naturalHeight,
            });
          }}
        />

        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon
            points={polygonPoints}
            fill="var(--primary)"
            fillOpacity={0.15}
            stroke="var(--primary)"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {corners.map((corner, index) => (
          <button
            key={HANDLE_LABELS[index]}
            type="button"
            aria-label={`Esquina: ${HANDLE_LABELS[index]}`}
            onPointerDown={(e) => {
              e.preventDefault();
              draggingIndex.current = index;
            }}
            className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white bg-primary shadow"
            style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
          />
        ))}
      </div>

      <div className="flex w-full gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-full border border-zinc-400 px-5 py-2 text-sm font-medium"
        >
          Repetir foto
        </button>
        <button
          type="button"
          onClick={() =>
            naturalSize &&
            onConfirm(corners, naturalSize.width, naturalSize.height)
          }
          disabled={!naturalSize}
          className="flex-1 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          Confirmar recorte
        </button>
      </div>
    </div>
  );
}
