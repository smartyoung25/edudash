import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/permissions";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "아이디/비밀번호를 입력해주세요" }, { status: 400 });
  }
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const user = rows[0];
  if (!user) {
    return NextResponse.json({ error: "계정을 찾을 수 없습니다" }, { status: 401 });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다" }, { status: 401 });
  }
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.role = user.role as Role;
  session.teamId = user.teamId;
  await session.save();
  return NextResponse.json({ ok: true });
}
