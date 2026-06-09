// 설문 테이블을 런타임에 보장(IF NOT EXISTS). 운영(Turso) 마이그레이션 저널 드리프트를
// 우회하기 위해, 설문 진입점에서 1회(인스턴스당) 호출해 테이블이 없으면 생성한다.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS surveys (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    title text NOT NULL,
    description text DEFAULT '' NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    public_token text NOT NULL,
    collect_team integer DEFAULT 1 NOT NULL,
    created_by integer,
    created_by_name text DEFAULT '' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS surveys_public_token_unique ON surveys (public_token)`,
  `CREATE TABLE IF NOT EXISTS survey_questions (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    survey_id integer NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    section text,
    q_type text NOT NULL,
    label text NOT NULL,
    required integer DEFAULT 0 NOT NULL,
    options text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS survey_responses (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    survey_id integer NOT NULL,
    product text,
    team_name text,
    submitted_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_agent text,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS survey_answers (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    response_id integer NOT NULL,
    question_id integer NOT NULL,
    value_int integer,
    value_text text,
    FOREIGN KEY (response_id) REFERENCES survey_responses(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON UPDATE no action ON DELETE cascade
  )`,
];

let ensured: Promise<void> | null = null;

export function ensureSurveyTables(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      for (const stmt of STATEMENTS) {
        await db.run(sql.raw(stmt));
      }
    })().catch((e) => {
      ensured = null; // 실패 시 다음 호출에서 재시도
      throw e;
    });
  }
  return ensured;
}
