// OCR is currently disabled on Cloudflare Workers (file-system based Vision client
// is not supported). isOcrEnabled() always returns false. Re-enable via a REST
// implementation of Vision API if needed.
export interface ExtractedReceipt {
  expenseDate?: string;
  item?: string;
  amount?: number;
  notes?: string;
}

export async function extractReceipt(_fileRef: string): Promise<ExtractedReceipt | null> {
  return null;
}
