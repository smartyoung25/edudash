import { requireRole } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { and, eq, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { RotateButton } from "./rotate-button";

export const dynamic = "force-dynamic";

async function ensureToken(teamId: number): Promise<string> {
  const existing = await db.select().from(schema.teamQrTokens)
    .where(and(eq(schema.teamQrTokens.teamId, teamId), isNull(schema.teamQrTokens.revokedAt)))
    .limit(1);
  if (existing[0]) return existing[0].token;
  const token = randomBytes(16).toString("base64url");
  await db.insert(schema.teamQrTokens).values({ teamId, token });
  return token;
}

export default async function QrPage({ params }: { params: Promise<{ teamId: string }> }) {
  await requireRole(["admin"]);
  const { teamId } = await params;
  const id = parseInt(teamId, 10);

  const team = (await db.select().from(schema.teams).where(eq(schema.teams.id, id)).limit(1))[0];
  if (!team) return <div className="p-6">팀을 찾을 수 없습니다.</div>;

  const token = await ensureToken(id);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const reportUrl = `${proto}://${host}/r/${token}`;
  const qrSvg = await QRCode.toString(reportUrl, { type: "svg", margin: 1, width: 320 });

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{team.name} — 일일보고 QR</h1>
        <p className="text-sm text-muted-foreground mt-1">
          강사가 휴대폰으로 스캔하면 팀과 오늘 차시가 자동 선택된 보고 화면이 열립니다.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 p-6 border rounded-lg bg-white">
        <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <div className="text-xs text-muted-foreground font-mono break-all text-center">{reportUrl}</div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          토큰을 새로 발급하면 기존 QR은 즉시 만료됩니다.
        </div>
        <RotateButton teamId={id} />
      </div>
    </div>
  );
}
