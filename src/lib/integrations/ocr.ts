import { env, isOcrEnabled } from "../env";

export interface ExtractedReceipt {
  expenseDate?: string;
  item?: string;
  amount?: number;
  notes?: string;
}

export async function extractReceipt(filePath: string): Promise<ExtractedReceipt | null> {
  if (!isOcrEnabled()) return null;

  try {
    // 동적 import — OCR 모듈은 옵션이므로 미설치 시 무시
    // @ts-expect-error optional module - install separately if OCR is needed
    const visionModule = await import("@google-cloud/vision").catch(() => null);
    if (!visionModule) return null;

    const client = new visionModule.ImageAnnotatorClient({ keyFilename: env.GOOGLE_VISION_KEY_PATH });
    const [result] = await client.textDetection(filePath);
    const text = result.fullTextAnnotation?.text ?? "";

    // 단순 휴리스틱 파싱
    const dateMatch = text.match(/(20\d{2}[-./]\d{1,2}[-./]\d{1,2})/);
    const amountMatch = text.match(/([0-9,]{4,})\s*(원|won)?/i);
    const itemMatch = text.match(/(교통비|식비|재료비|숙박비|소모품|기타)/);

    return {
      expenseDate: dateMatch?.[1].replace(/[./]/g, "-"),
      amount: amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : undefined,
      item: itemMatch?.[1],
      notes: undefined,
    };
  } catch {
    return null;
  }
}
