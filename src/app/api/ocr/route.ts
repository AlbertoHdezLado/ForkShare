import { NextResponse } from "next/server";
import type { OcrResult, OcrWord } from "@/lib/ocr/types";

export const runtime = "nodejs";

// Server-only OCR provider: proxies to the Google Vision API using a secret
// key, and normalizes the response into the same shape as the Tesseract
// provider (words + bounding boxes) so the parser stays engine-agnostic.

interface VisionVertex {
  x?: number;
  y?: number;
}

interface VisionWord {
  boundingBox?: { vertices?: VisionVertex[] };
  symbols?: { text: string }[];
  confidence?: number;
}

interface VisionPage {
  blocks?: {
    paragraphs?: {
      words?: VisionWord[];
    }[];
  }[];
}

interface VisionResponse {
  responses?: {
    fullTextAnnotation?: {
      text?: string;
      pages?: VisionPage[];
    };
    error?: { message?: string };
  }[];
}

// Upper bound on accepted uploads: keeps a single request from abusing the
// (paid, quota-limited) Google Vision API with oversized or unexpected files.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_VISION_API_KEY is not configured" },
      { status: 501 },
    );
  }

  const formData = await request.formData();
  const image = formData.get("image");
  if (!(image instanceof Blob)) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }
  if (image.type && !image.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "File must be an image" },
      { status: 400 },
    );
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image is too large" }, { status: 413 });
  }

  const bytes = Buffer.from(await image.arrayBuffer());
  const base64 = bytes.toString("base64");

  const visionResponse = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: { languageHints: ["es"] },
          },
        ],
      }),
    },
  );

  if (!visionResponse.ok) {
    return NextResponse.json(
      { error: `Google Vision request failed (${visionResponse.status})` },
      { status: 502 },
    );
  }

  const payload = (await visionResponse.json()) as VisionResponse;
  const annotation = payload.responses?.[0];

  if (annotation?.error) {
    return NextResponse.json(
      { error: annotation.error.message ?? "Google Vision error" },
      { status: 502 },
    );
  }

  const result = toOcrResult(annotation?.fullTextAnnotation);
  return NextResponse.json(result);
}

function toOcrResult(fullTextAnnotation?: {
  text?: string;
  pages?: VisionPage[];
}): OcrResult {
  const words: OcrWord[] = [];

  for (const page of fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = (word.symbols ?? []).map((s) => s.text).join("");
          if (!text.trim()) continue;

          const vertices = word.boundingBox?.vertices ?? [];
          const xs = vertices.map((v) => v.x ?? 0);
          const ys = vertices.map((v) => v.y ?? 0);

          words.push({
            text,
            confidence: word.confidence ?? 1,
            bbox: {
              x0: Math.min(...xs, 0),
              y0: Math.min(...ys, 0),
              x1: Math.max(...xs, 0),
              y1: Math.max(...ys, 0),
            },
          });
        }
      }
    }
  }

  return { words, text: fullTextAnnotation?.text ?? "" };
}
