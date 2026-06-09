import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { QrActions } from "./qr-actions";
import { ensureSurveyTables } from "@/lib/survey-db";

export const dynamic = "force-dynamic";

export default async function SurveyQrPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  await ensureSurveyTables();
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const survey = (await db.select().from(schema.surveys).where(eq(schema.surveys.id, numId)).limit(1))[0];
  if (!survey) notFound();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/s/${survey.publicToken}`;
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, width: 320 });
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 600 });

  return (
    <div className="space-y-4">
      <style>{`@media print { body * { visibility: hidden; } #qr-print, #qr-print * { visibility: visible; } #qr-print { position: absolute; left: 50%; top: 40px; transform: translateX(-50%); border: none; } }`}</style>
      <PageHeader
        title="설문 QR 코드"
        description="교육생이 휴대폰으로 스캔하면 응답 페이지가 바로 열립니다."
        actions={
          <Link href="/surveys"><Button size="sm" variant="outline"><ArrowLeft className="h-4 w-4" /> 목록</Button></Link>
        }
      />
      <div className="px-6">
        <Card className="max-w-md mx-auto p-6 space-y-4">
          <div className="text-center space-y-1">
            <div className="text-sm text-muted-foreground">{survey.title}</div>
            {survey.status !== "open" && (
              <div className="text-xs text-amber-600">※ 현재 설문 상태가 &apos;{survey.status === "draft" ? "작성중" : "마감"}&apos;이라 응답을 받을 수 없습니다. 상태를 &apos;진행중&apos;으로 바꿔주세요.</div>
            )}
          </div>
          <div id="qr-print" className="flex flex-col items-center gap-3 rounded-lg border bg-white p-6">
            <div className="text-base font-semibold text-center">{survey.title}</div>
            <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="text-xs text-muted-foreground font-mono break-all text-center">{url}</div>
          </div>
          <QrActions url={url} pngDataUrl={qrDataUrl} fileName={`설문QR_${survey.title}`} />
        </Card>
      </div>
    </div>
  );
}
