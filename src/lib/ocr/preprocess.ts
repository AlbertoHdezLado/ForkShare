// Canvas preprocessing applied before OCR: this is what moves Tesseract's
// accuracy the most on phone photos of receipts (resize, grayscale, contrast).

const TARGET_WIDTH = 1600;

/**
 * Resizes the image to ~TARGET_WIDTH, converts it to grayscale and stretches
 * contrast, then re-encodes it as a JPEG blob ready to feed to an OCR engine.
 */
export async function preprocessReceiptImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, TARGET_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context is not available in this environment");
  }

  ctx.drawImage(bitmap, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  grayscaleAndStretchContrast(imageData);
  ctx.putImageData(imageData, 0, 0);

  return await canvasToBlob(canvas);
}

function grayscaleAndStretchContrast(imageData: ImageData) {
  const { data } = imageData;
  const gray = new Uint8ClampedArray(data.length / 4);

  let min = 255;
  let max = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Standard luma weights.
    const value = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = Math.max(1, max - min);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const stretched = ((gray[p] - min) / range) * 255;
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to encode preprocessed image"));
      },
      "image/jpeg",
      0.92,
    );
  });
}
