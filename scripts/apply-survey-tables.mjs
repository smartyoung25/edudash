// 일회성: survey_* 테이블만 로컬 DB에 생성 (마이그레이션 저널 드리프트 우회)
import { createClient } from "@libsql/client";

// 운영(Turso) 환경변수가 있으면 운영 DB에, 없으면 로컬 파일 DB에 적용
const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./data/app.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(authToken ? { url, authToken } : { url });
console.log(`대상 DB: ${url.startsWith("file:") ? url : "Turso(운영)"}`);

const stmts = [
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

for (const sql of stmts) {
  await client.execute(sql);
}
console.log("✓ survey 테이블 생성 완료");
process.exit(0);
