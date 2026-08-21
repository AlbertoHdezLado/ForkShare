import type { OcrProvider } from "./types";

// Optional higher-accuracy provider: uploads the (preprocessed) image to our
// own route handler, which calls the Google Vision API server-side so the
// API key never reaches the client.

export const googleVisionProvider: OcrProvider = {
  id: "google-vision",
  async recognize(image) {
    const formData = new FormData();
    formData.append("image", image, "receipt.jpg");

    const response = await fetch("/api/ocr", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? `OCR request failed (${response.status})`);
    }

    return await response.json();
  },
};
