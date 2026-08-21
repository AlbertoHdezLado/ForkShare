"use client";

// Lets the user drag the four corners of the ticket over the photo they just
// took, so the perspective-correction step knows exactly what to straighten
// and crop before OCR runs.

import { useEffect, useRef, useState } from "react";
import type { Point, Quad } from "@/lib/ocr/perspective";

export const DEFAULT_CORNERS: Quad = [
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
  readonly initialCorners?: Quad;
  readonly onConfirm: (
    quad: Quad,
    naturalWidth: number,
    naturalHeight: number,
  ) => void;
  readonly onCancel: () => void;
}

export function CropStep({
  imageUrl,
  initialCorners,
  onConfirm,
  onCancel,
}: CropStepProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [corners, setCorners] = useState<Quad>(initialCorners ?? DEFAULT_CORNERS);
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const draggingIndex = useRef<number | null>(null);
  const draggingArea = useRef<{
    startPoint: Point;
    startCorners: Quad;
  } | null>(null);
  const activePointerId = useRef<number | null>(null);

  useEffect(() => {
    setCorners(initialCorners ?? DEFAULT_CORNERS);
  }, [initialCorners]);

  // Once the photo has loaded and its final height is known, center it
  // vertically in the viewport if it overflows (mainly for mobile screens).
  useEffect(() => {
    if (!naturalSize) return;
    if (typeof containerRef.current?.scrollIntoView === "function") {
      containerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
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
    const point = fractionFromEvent(e);

    const index = draggingIndex.current;
    if (index !== null) {
      setCorners((prev) => {
        const next = [...prev] as Quad;
        next[index] = point;
        return next;
      });
      return;
    }

    const areaDrag = draggingArea.current;
    if (!areaDrag) return;

    const rawDx = point.x - areaDrag.startPoint.x;
    const rawDy = point.y - areaDrag.startPoint.y;
    const minX = Math.min(...areaDrag.startCorners.map((corner) => corner.x));
    const maxX = Math.max(...areaDrag.startCorners.map((corner) => corner.x));
    const minY = Math.min(...areaDrag.startCorners.map((corner) => corner.y));
    const maxY = Math.max(...areaDrag.startCorners.map((corner) => corner.y));

    const dx = Math.min(1 - maxX, Math.max(-minX, rawDx));
    const dy = Math.min(1 - maxY, Math.max(-minY, rawDy));

    setCorners((prev) => {
      void prev;
      return areaDrag.startCorners.map((corner) => ({
        x: corner.x + dx,
        y: corner.y + dy,
      })) as Quad;
    });
  }

  function stopDragging(e?: React.PointerEvent) {
    if (
      e &&
      activePointerId.current !== null &&
      activePointerId.current !== e.pointerId
    ) {
      return;
    }

    if (e && activePointerId.current !== null) {
      containerRef.current?.releasePointerCapture(activePointerId.current);
    }

    draggingIndex.current = null;
    draggingArea.current = null;
    activePointerId.current = null;
  }

  function startAreaDrag(e: React.PointerEvent) {
    e.preventDefault();
    activePointerId.current = e.pointerId;
    containerRef.current?.setPointerCapture(e.pointerId);
    draggingIndex.current = null;
    draggingArea.current = {
      startPoint: fractionFromEvent(e),
      startCorners: corners.map((corner) => ({ ...corner })) as Quad,
    };
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
          Arrastra las esquinas para ajustar fino o arrastra el area del
          recorte para moverla completa sobre el ticket.
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative w-full max-w-sm touch-pan-y select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
        onPointerCancel={stopDragging}
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
          className="absolute inset-0 h-full w-full"
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
            className="cursor-grab active:cursor-grabbing"
            onPointerDown={startAreaDrag}
          />
        </svg>

        {corners.map((corner, index) => (
          <button
            key={HANDLE_LABELS[index]}
            type="button"
            aria-label={`Esquina: ${HANDLE_LABELS[index]}`}
            onPointerDown={(e) => {
              e.preventDefault();
              activePointerId.current = e.pointerId;
              containerRef.current?.setPointerCapture(e.pointerId);
              draggingArea.current = null;
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
