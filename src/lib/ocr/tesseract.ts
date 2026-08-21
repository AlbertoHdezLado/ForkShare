import { createWorker, type RecognizeResult } from "tesseract.js";
import type { OcrProvider, OcrResult, OcrWord } from "./types";

// Default provider: runs entirely on the client, free and private (the photo
// never leaves the phone).

export const tesseractProvider: OcrProvider = {
  id: "tesseract",
  async recognize(image, onProgress) {
    const worker = await createWorker("spa", undefined, {
      logger: (message) => {
        onProgress?.({ status: message.status, progress: message.progress });
      },
    });

    try {
      const result = await worker.recognize(image, {}, { blocks: true });
      return toOcrResult(result);
    } finally {
      await worker.terminate();
    }
  },
};

function toOcrResult(result: RecognizeResult): OcrResult {
  const words: OcrWord[] = [];

  for (const block of result.data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          const text = word.text.trim();
          if (!text) continue;
          words.push({
            text,
            confidence: word.confidence,
            bbox: word.bbox,
          });
        }
      }
    }
  }

  return { words, text: result.data.text };
}
