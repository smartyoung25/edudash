/**
 * 팀별 진행률이 50%·90% 임계치를 처음 넘은 시점에 1회 이메일 알림.
 * progress_notifications 테이블의 UNIQUE(team_id, threshold)로 중복 방지.
 */
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { getAllTeamProgress } from "@/lib/kpi";
import { sendMail } from "./gmail-send";
import { env } from "../env";

const THRESHOLDS = [50, 90] as const;

export interface ProgressAlertResult {
  ok: boolean;
  message: string;
  sent: { teamId: number; teamName: string; threshold: number; percent: number }[];
  errors: { teamId: number; threshold: number; reason: string }[];
}

export async function checkAndSendProgressAlerts(): Promise<ProgressAlertResult> {
  const to = env.PROGRESS_ALERT_TO;
  if (!to) return { ok: false, message: "PROGRESS_ALERT_TO 미설정", sent: [], errors: [] };

  const [teams, progresses, already] = await Promise.all([
    db.select().from(schema.teams),
    getAllTeamProgress(),
    db.select().from(schema.progressNotifications),
  ]);

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const alreadyKey = new Set(already.map((a) => `${a.teamId}:${a.threshold}`));

  const sent: ProgressAlertResult["sent"] = [];
  const errors: ProgressAlertResult["errors"] = [];

  for (const [teamIdStr, p] of Object.entries(progresses)) {
    const teamId = Number(teamIdStr);
    const team = teamMap.get(teamId);
    if (!team) continue;

    for (const th of THRESHOLDS) {
      if (p.progressPercent < th) continue;
      const key = `${teamId}:${th}`;
      if (alreadyKey.has(key)) continue;

      const subject = `[성장농 알림] ${team.name} 진행률 ${th}% 도달 (${p.progressPercent}%)`;
      const html = `
        <div style="font-family:'Malgun Gothic',sans-serif;color:#111;line-height:1.6">
          <h2 style="margin:0 0 12px">${team.name} — 진행률 ${th}% 도달</h2>
          <p>현재 진행률: <strong>${p.progressPercent}%</strong> (${p.done} / ${p.effectiveTotal}차시 완료)</p>
          <table style="border-collapse:collapse">
            <tr><td style="padding:4px 12px">품목/회기</td><td>${team.product} ${team.cohort}</td></tr>
            <tr><td style="padding:4px 12px">총 차시</td><td>${p.total} (취소 ${p.cancelled}, 예정 ${p.planned})</td></tr>
            <tr><td style="padding:4px 12px">담당 코디</td><td>${team.coordinatorName ?? "-"} (${team.coordinatorEmail ?? "-"})</td></tr>
            <tr><td style="padding:4px 12px">담당 교수</td><td>${team.professorName ?? "-"}</td></tr>
          </table>
          <p style="margin-top:16px;color:#666;font-size:12px">자동 발송 — 같은 임계치 알림은 1회만 전송됩니다.</p>
        </div>`;

      const r = await sendMail({ to, subject, html });
      if (!r.ok) {
        errors.push({ teamId, threshold: th, reason: r.message });
        continue;
      }
      try {
        await db.insert(schema.progressNotifications).values({
          teamId,
          threshold: th,
          progressPercent: p.progressPercent,
        });
        sent.push({ teamId, teamName: team.name, threshold: th, percent: p.progressPercent });
      } catch (e) {
        errors.push({ teamId, threshold: th, reason: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return {
    ok: errors.length === 0,
    message: `발송 ${sent.length}건${errors.length ? `, 오류 ${errors.length}건` : ""}`,
    sent,
    errors,
  };
}

/** 특정 팀·임계치 알림 기록 초기화 (재발송 가능하게) */
export async function resetProgressNotification(teamId: number, threshold?: number) {
  if (threshold !== undefined) {
    await db
      .delete(schema.progressNotifications)
      .where(eq(schema.progressNotifications.teamId, teamId));
  } else {
    await db.delete(schema.progressNotifications).where(eq(schema.progressNotifications.teamId, teamId));
  }
}
