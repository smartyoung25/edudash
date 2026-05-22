"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageIcon } from "lucide-react";

export function AgencyReceiptViewer({
  expenseId,
  mimeType,
  docType,
}: {
  expenseId: number;
  mimeType?: string | null;
  docType?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const isPdf = mimeType === "application/pdf";
  const label = docType && docType !== "영수증" ? docType : "영수증";

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 underline-offset-2 hover:underline">
        <ImageIcon className="h-3.5 w-3.5" />
        {label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>영수증 원본</DialogTitle></DialogHeader>
          <div className="max-h-[75vh] overflow-auto bg-muted/20 rounded-md flex items-center justify-center">
            {isPdf ? (
              <iframe src={`/api/agency-expenses/${expenseId}/receipt`} className="w-full h-[70vh]" />
            ) : (
              <img src={`/api/agency-expenses/${expenseId}/receipt`} alt="영수증" className="max-w-full h-auto" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
