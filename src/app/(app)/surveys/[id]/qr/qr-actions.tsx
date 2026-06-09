"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Printer, Link2, Check } from "lucide-react";

export function QrActions({ url, pngDataUrl, fileName }: { url: string; pngDataUrl: string; fileName: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function download() {
    const a = document.createElement("a");
    a.href = pngDataUrl;
    a.download = `${fileName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={copy}>
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
        {copied ? "복사됨" : "링크 복사"}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={download}>
        <Download className="h-4 w-4" /> PNG 저장
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> 인쇄
      </Button>
    </div>
  );
}
