/**
 * 자동 폴링 스케줄러
 * ENABLE_SCHEDULER=true 일 때 서버 부팅 시 1회 시작됩니다.
 * - 구글 시트 동기화: 12시간마다
 * - IMAP 메일 수집: 12시간마다
 */

import cron from "node-cron";
import { syncPublicSheet } from "./gsheets-public";
import { pollMailbox, updateMailStatus } from "./imap";
import { importTravelReceiptsFromNotion, isNotionEnabled } from "./notion";
import { syncDriveTeamStatus } from "./drive-team-status";
import { runWeeklyStudentReport } from "./weekly-report";
import { checkAndSendProgressAlerts } from "./progress-alert";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

let started = false;

export function startScheduler() {
  if (started) return;
  if (process.env.ENABLE_SCHEDULER !== "true") return;

  started = true;
  console.log("[스케줄러] 시작 — 12시간마다 시트·메일 동기화");

  // 12시간마다 실행 (매일 오전 6시, 오후 6시)
  cron.schedule("0 6,18 * * *", async () => {
    console.log("[스케줄러] 구글 시트 동기화 시작...");
    const spreadsheetId = process.env.DAILY_SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) return;

    try {
      const result = await syncPublicSheet(spreadsheetId);
      await db
        .update(schema.integrationStatus)
        .set({
          enabled: true,
          lastRunAt: new Date().toISOString(),
          status: "ok",
          message: result.message,
        })
        .where(eq(schema.integrationStatus.type, "sheets"));
      console.log(`[스케줄러] 시트 동기화 완료: ${result.message}`);
    } catch (err) {
      console.error("[스케줄러] 시트 동기화 오류:", err);
    }
  });

  // IMAP도 12시간마다
  cron.schedule("0 6,18 * * *", async () => {
    if (!process.env.IMAP_PASSWORD) return;
    console.log("[스케줄러] 메일 수집 시작...");
    try {
      const result = await pollMailbox();
      await updateMailStatus(result);
      console.log(`[스케줄러] 메일 수집 완료: ${result.message}`);
    } catch (err) {
      console.error("[스케줄러] 메일 수집 오류:", err);
    }
  });

  // 노션 출장비 품의서 — 12시간마다
  cron.schedule("0 6,18 * * *", async () => {
    if (!isNotionEnabled()) return;
    console.log("[스케줄러] 노션 출장비 수집 시작...");
    try {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const result = await importTravelReceiptsFromNotion({ since });
      console.log(`[스케줄러] 노션 수집 완료: ${result.message}`);
    } catch (err) {
      console.error("[스케줄러] 노션 수집 오류:", err);
    }
  });

  // Drive 전체팀별 운영현황 동기화 — 매일 17:00
  cron.schedule("0 17 * * *", async () => {
    console.log("[스케줄러] Drive 운영현황 동기화 시작...");
    try {
      const r = await syncDriveTeamStatus();
      console.log(`[스케줄러] Drive 운영현황 동기화 ${r.ok ? "완료" : "실패"}: ${r.message}`);
    } catch (err) {
      console.error("[스케줄러] Drive 운영현황 동기화 오류:", err);
    }
  });

  // 주간보고서 자동 생성 — 매주 목요일 20:00
  cron.schedule("0 20 * * 4", async () => {
    console.log("[스케줄러] 주간보고서 생성 시작...");
    try {
      const r = await runWeeklyStudentReport();
      console.log(`[스케줄러] 주간보고서 ${r.ok ? "완료" : "실패"}: ${r.message}`);
    } catch (err) {
      console.error("[스케줄러] 주간보고서 오류:", err);
    }
  });

  // 진행률 50%·90% 임계치 알림 — 매일 09:00
  cron.schedule("0 9 * * *", async () => {
    console.log("[스케줄러] 진행률 알림 평가 시작...");
    try {
      const r = await checkAndSendProgressAlerts();
      console.log(`[스케줄러] 진행률 알림 ${r.ok ? "완료" : "오류포함"}: ${r.message}`);
    } catch (err) {
      console.error("[스케줄러] 진행률 알림 오류:", err);
    }
  });
}
