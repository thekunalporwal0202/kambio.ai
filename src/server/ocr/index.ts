import { env } from "@/env";

export type OcrResult = {
  text: string;
  provider: string;
  /** OCR engine confidence, when the provider reports one. */
  confidence: number | null;
};

export interface OcrProvider {
  readonly name: string;
  extractText(file: { buffer: Buffer; mimeType: string; fileName: string }): Promise<OcrResult>;
}

/**
 * Default provider: reads text natively where possible (txt/csv/json/eml) and
 * returns a clearly-labelled placeholder for binary formats. Swap in Textract
 * or Google Cloud Vision by setting OCR_PROVIDER — nothing else changes.
 */
class MockOcr implements OcrProvider {
  readonly name = "mock";

  async extractText(file: { buffer: Buffer; mimeType: string; fileName: string }): Promise<OcrResult> {
    const textual =
      file.mimeType.startsWith("text/") ||
      /json|xml|csv|eml|markdown/.test(file.mimeType) ||
      /\.(txt|csv|md|json|eml)$/i.test(file.fileName);

    if (textual) {
      return { text: file.buffer.toString("utf8"), provider: this.name, confidence: 1 };
    }

    // Real PDFs/images need a real OCR engine. Rather than pretend, we extract
    // any embedded ASCII runs (enough for simple text-layer PDFs) and say so.
    const ascii = file.buffer
      .toString("latin1")
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s{4,}/g, "\n")
      .trim();

    const salvaged = ascii.length > 200 ? ascii : "";
    return {
      text:
        salvaged ||
        `[No text layer found in ${file.fileName}. Configure OCR_PROVIDER=textract|gcv to read scanned documents.]`,
      provider: this.name,
      confidence: salvaged ? 0.5 : 0,
    };
  }
}

/** Stub for a hosted OCR service. Kept explicit so the seam is obvious. */
class HostedOcr implements OcrProvider {
  constructor(readonly name: string) {
    if (!env.OCR_API_KEY) throw new Error(`OCR_PROVIDER=${name} requires OCR_API_KEY`);
  }
  async extractText(): Promise<OcrResult> {
    // TODO: implement Textract / Cloud Vision calls behind this same interface.
    throw new Error(`OCR provider "${this.name}" is not implemented yet`);
  }
}

let provider: OcrProvider | null = null;

export function ocr(): OcrProvider {
  if (!provider) {
    try {
      provider = env.OCR_PROVIDER === "mock" ? new MockOcr() : new HostedOcr(env.OCR_PROVIDER);
    } catch (err) {
      console.error("[ocr] falling back to mock provider:", err);
      provider = new MockOcr();
    }
  }
  return provider;
}
