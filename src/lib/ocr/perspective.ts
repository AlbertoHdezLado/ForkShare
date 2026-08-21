// Perspective correction: warps a user-adjusted quadrilateral (the four
// corners of the ticket in the original photo) into a straight, centered
// rectangle before OCR. Implemented with a plain 2D homography + inverse
// bilinear sampling so no extra image-processing dependency is needed.

export interface Point {
  x: number;
  y: number;
}

/** Corners in TL, TR, BR, BL order. */
export type Quad = [Point, Point, Point, Point];

function pivotRow(m: number[][], col: number, n: number): void {
  let pivot = col;
  for (let row = col + 1; row < n; row++) {
    if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
  }
  [m[col], m[pivot]] = [m[pivot], m[col]];
}

function eliminateColumn(m: number[][], col: number, n: number): void {
  const pivotVal = m[col][col];
  if (Math.abs(pivotVal) < 1e-12) return;

  for (let row = 0; row < n; row++) {
    if (row === col) continue;
    const factor = m[row][col] / pivotVal;
    for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
  }
}

/** Solves the linear system A·h = b via Gaussian elimination with partial pivoting. */
function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    pivotRow(m, col, n);
    eliminateColumn(m, col, n);
  }

  return m.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

/** Computes the 3x3 homography (flattened, row-major, h[8]=1) mapping `from` -> `to`. */
function computeHomography(from: Quad, to: Quad): number[] {
  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: destX, y: destY } = to[i];
    a.push([x, y, 1, 0, 0, 0, -x * destX, -y * destX]);
    b.push(destX);
    a.push([0, 0, 0, x, y, 1, -x * destY, -y * destY]);
    b.push(destY);
  }

  return [...solveLinearSystem(a, b), 1];
}

function applyHomography(h: number[], x: number, y: number): Point {
  const denom = h[6] * x + h[7] * y + h[8];
  return {
    x: (h[0] * x + h[1] * y + h[2]) / denom,
    y: (h[3] * x + h[4] * y + h[5]) / denom,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Picks an output size that roughly preserves the quad's real aspect ratio. */
function estimateOutputSize(
  quad: Quad,
  maxDimension = 1800,
): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  const width = (distance(tl, tr) + distance(bl, br)) / 2;
  const height = (distance(tl, bl) + distance(tr, br)) / 2;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function bilinearSample(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const clampedX = Math.min(Math.max(x, 0), width - 1);
  const clampedY = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;

  const idx = (px: number, py: number) => (py * width + px) * 4;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = data[idx(x0, y0) + c] * (1 - fx) + data[idx(x1, y0) + c] * fx;
    const bottom =
      data[idx(x0, y1) + c] * (1 - fx) + data[idx(x1, y1) + c] * fx;
    out[c] = top * (1 - fy) + bottom * fy;
  }
  return out;
}

/**
 * Warps the quadrilateral `quad` (the ticket's four corners, in the original
 * image's pixel coordinates) into a straight rectangle, cropping out
 * everything outside it and centering/squaring the ticket for OCR.
 */
export async function warpToRectangle(
  source: File | Blob,
  quad: Quad,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = bitmap.width;
  sourceCanvas.height = bitmap.height;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx)
    throw new Error("2D canvas context is not available in this environment");
  sourceCtx.drawImage(bitmap, 0, 0);
  const sourceData = sourceCtx.getImageData(
    0,
    0,
    bitmap.width,
    bitmap.height,
  ).data;

  const { width, height } = estimateOutputSize(quad);
  const outputRect: Quad = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  // Map output (straight) coordinates back to the source quad, so every
  // output pixel can be sampled directly (avoids gaps from forward mapping).
  const homography = computeHomography(outputRect, quad);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx)
    throw new Error("2D canvas context is not available in this environment");
  const outputImageData = outputCtx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = applyHomography(homography, x, y);
      const [r, g, b, a] = bilinearSample(
        sourceData,
        bitmap.width,
        bitmap.height,
        src.x,
        src.y,
      );
      const destIdx = (y * width + x) * 4;
      outputImageData.data[destIdx] = r;
      outputImageData.data[destIdx + 1] = g;
      outputImageData.data[destIdx + 2] = b;
      outputImageData.data[destIdx + 3] = a;
    }
  }

  outputCtx.putImageData(outputImageData, 0, 0);

  return await new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Failed to encode warped image")),
      "image/jpeg",
      0.92,
    );
  });
}
