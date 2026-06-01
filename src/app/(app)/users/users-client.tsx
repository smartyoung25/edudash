"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, KeyRound, Trash2, Pencil, X, Check, Copy } from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/permissions";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  teamId: number | null;
  createdAt: string;
}
interface Team {
  id: number;
  name: string;
}

const ROLES: Role[] = ["admin", "coordinator", "professor"];

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: "bg-red-50 text-red-700 border-red-200",
    coordinator: "bg-blue-50 text-blue-700 border-blue-200",
    professor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const label = ROLE_LABEL[role as Role] ?? role;
  const cls = styles[role] ?? "bg-gray-50 text-gray-700 border-gray-200";
  return <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export function UsersClient({ initialUsers, teams }: { initialUsers: User[]; teams: Team[] }) {
  const router = useRouter();
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  const [users, setUsers] = useState(initialUsers);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tempPwdInfo, setTempPwdInfo] = useState<{ email: string; password: string; action: "create" | "reset" } | null>(null);
  const [inviteInfo, setInviteInfo] = useState<{ email: string; name: string; url: string; expiresAt: number } | null>(null);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> 사용자 추가
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">이메일/아이디</th>
              <th className="px-3 py-2 text-left">이름</th>
              <th className="px-3 py-2 text-left">역할</th>
              <th className="px-3 py-2 text-left">담당 팀</th>
              <th className="px-3 py-2 text-left">생성일</th>
              <th className="px-3 py-2 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                teams={teams}
                teamMap={teamMap}
                editing={editingId === u.id}
                onEditStart={() => setEditingId(u.id)}
                onEditCancel={() => setEditingId(null)}
                onUpdated={(updated) => {
                  setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, ...updated } : p)));
                  setEditingId(null);
                  refresh();
                }}
                onDeleted={() => {
                  setUsers((prev) => prev.filter((p) => p.id !== u.id));
                  refresh();
                }}
                onPasswordReset={(pwd) => {
                  setTempPwdInfo({ email: u.email, password: pwd, action: "reset" });
                }}
              />
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  등록된 사용자가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddUserDialog
          teams={teams}
          onClose={() => setShowAdd(false)}
          onAdded={(user, pwd) => {
            setUsers((prev) => [...prev, user]);
            setShowAdd(false);
            setTempPwdInfo({ email: user.email, password: pwd, action: "create" });
            refresh();
          }}
          onInvited={(payload) => {
            setShowAdd(false);
            setInviteInfo(payload);
          }}
        />
      )}

      {tempPwdInfo && <TempPasswordDialog info={tempPwdInfo} onClose={() => setTempPwdInfo(null)} />}
      {inviteInfo && <InviteLinkDialog info={inviteInfo} onClose={() => setInviteInfo(null)} />}
    </div>
  );
}

function UserRow({
  user,
  teams,
  teamMap,
  editing,
  onEditStart,
  onEditCancel,
  onUpdated,
  onDeleted,
  onPasswordReset,
}: {
  user: User;
  teams: Team[];
  teamMap: Map<number, string>;
  editing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onUpdated: (u: Partial<User>) => void;
  onDeleted: () => void;
  onPasswordReset: (pwd: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role as Role);
  const [teamId, setTeamId] = useState<number | null>(user.teamId);
  const [busy, startTx] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    startTx(async () => {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role, teamId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "변경 실패");
        return;
      }
      onUpdated({ name, role, teamId });
    });
  }

  function del() {
    if (!confirm(`${user.name}(${user.email}) 을(를) 정말 삭제하시겠습니까?`)) return;
    startTx(async () => {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "삭제 실패");
        return;
      }
      onDeleted();
    });
  }

  function resetPwd() {
    if (!confirm(`${user.name} 의 비밀번호를 초기화하시겠습니까? 새 임시 비밀번호가 발급됩니다.`)) return;
    startTx(async () => {
      const res = await fetch(`/api/users/${user.id}/reset-password`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "초기화 실패");
        return;
      }
      onPasswordReset(data.tempPassword);
    });
  }

  if (editing) {
    return (
      <tr className="border-t bg-amber-50/50">
        <td className="px-3 py-2">{user.id}</td>
        <td className="px-3 py-2 text-muted-foreground">{user.email}</td>
        <td className="px-3 py-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
        </td>
        <td className="px-3 py-2">
          <select
            value={role}
            onChange={(e) => {
              const r = e.target.value as Role;
              setRole(r);
              if (r === "admin") setTeamId(null);
            }}
            className="h-8 rounded-md border px-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2">
          <select
            value={teamId ?? ""}
            onChange={(e) => setTeamId(e.target.value === "" ? null : Number(e.target.value))}
            className="h-8 rounded-md border px-2 text-sm max-w-[160px]"
          >
            <option value="">— (없음)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2 text-muted-foreground text-xs">{user.createdAt.substring(0, 10)}</td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1">
            {err && <span className="text-xs text-destructive mr-2">{err}</span>}
            <Button size="sm" variant="ghost" onClick={save} disabled={busy} title="저장">
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onEditCancel} disabled={busy} title="취소">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t">
      <td className="px-3 py-2 text-muted-foreground">{user.id}</td>
      <td className="px-3 py-2 font-mono text-xs">{user.email}</td>
      <td className="px-3 py-2">{user.name}</td>
      <td className="px-3 py-2"><RoleBadge role={user.role} /></td>
      <td className="px-3 py-2">{user.teamId ? teamMap.get(user.teamId) ?? `#${user.teamId}` : <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-2 text-muted-foreground text-xs">{user.createdAt.substring(0, 10)}</td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onEditStart} disabled={busy} title="편집">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={resetPwd} disabled={busy} title="비밀번호 초기화">
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={del} disabled={busy} title="삭제">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function AddUserDialog({
  teams,
  onClose,
  onAdded,
  onInvited,
}: {
  teams: Team[];
  onClose: () => void;
  onAdded: (user: User, pwd: string) => void;
  onInvited: (payload: { email: string; name: string; url: string; expiresAt: number }) => void;
}) {
  const [mode, setMode] = useState<"invite" | "direct">("invite");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("coordinator");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, startTx] = useTransition();

  function changeRole(r: Role) {
    setRole(r);
    if (r === "admin") setTeamId(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const payload = { email: email.trim().toLowerCase(), name: name.trim(), role, teamId };
    startTx(async () => {
      const path = mode === "invite" ? "/api/users/invite" : "/api/users";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? (mode === "invite" ? "초대 링크 발급 실패" : "추가 실패"));
        return;
      }
      if (mode === "invite") {
        onInvited({ email: payload.email, name: payload.name, url: data.url, expiresAt: data.expiresAt });
      } else {
        const created: User = {
          id: data.id,
          email: payload.email,
          name: payload.name,
          role,
          teamId,
          createdAt: new Date().toISOString().substring(0, 10),
        };
        onAdded(created, data.tempPassword);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-3">사용자 추가</h2>
        <div className="mb-4 flex rounded-md border p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("invite")}
            className={`flex-1 rounded px-2 py-1.5 transition-colors ${mode === "invite" ? "bg-emerald-100 text-emerald-900 font-medium" : "text-muted-foreground hover:bg-muted"}`}
          >
            초대 링크 발급 (추천)
          </button>
          <button
            type="button"
            onClick={() => setMode("direct")}
            className={`flex-1 rounded px-2 py-1.5 transition-colors ${mode === "direct" ? "bg-emerald-100 text-emerald-900 font-medium" : "text-muted-foreground hover:bg-muted"}`}
          >
            직접 추가 (임시 비번)
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {mode === "invite"
            ? "링크를 직원에게 전달하면 본인이 비밀번호를 설정합니다 (7일 유효)."
            : "임시 비밀번호를 즉시 발급합니다. 직원에게 전달 후 첫 로그인 시 변경 권장."}
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="add-email">이메일 / 아이디</Label>
            <Input id="add-email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="예: hong@iiam.co.kr" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-name">이름</Label>
            <Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-role">역할</Label>
              <select
                id="add-role"
                value={role}
                onChange={(e) => changeRole(e.target.value as Role)}
                className="h-9 w-full rounded-md border px-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-team">담당 팀</Label>
              <select
                id="add-team"
                value={teamId ?? ""}
                onChange={(e) => setTeamId(e.target.value === "" ? null : Number(e.target.value))}
                className="h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">— (관리자/없음)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {role !== "admin" && !teamId && (
            <p className="text-xs text-amber-600">{ROLE_LABEL[role]}는 담당 팀이 필요합니다</p>
          )}
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              취소
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "처리 중..." : mode === "invite" ? "초대 링크 발급" : "추가하기"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InviteLinkDialog({
  info,
  onClose,
}: {
  info: { email: string; name: string; url: string; expiresAt: number };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(info.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  const expDate = new Date(info.expiresAt);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-2">초대 링크 발급 완료</h2>
        <p className="text-sm text-muted-foreground mb-3">
          <strong>{info.name}</strong> ({info.email}) 의 초대 링크입니다. 직원에게 메일·메신저 등으로 전달하세요. 링크 클릭 시 본인이 비밀번호를 설정하고 자동 로그인됩니다.
        </p>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <span className="flex-1 select-all break-all font-mono">{info.url}</span>
          <Button size="sm" variant="ghost" onClick={copy} title="복사">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          유효기간: {expDate.toLocaleDateString("ko-KR")} {expDate.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 까지 · 1회 사용
        </p>
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>확인</Button>
        </div>
      </div>
    </div>
  );
}

function TempPasswordDialog({ info, onClose }: { info: { email: string; password: string; action: "create" | "reset" }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(info.password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-2">
          {info.action === "create" ? "사용자 추가 완료" : "비밀번호 초기화 완료"}
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          {info.email} 의 임시 비밀번호입니다. <strong>이 화면을 닫으면 다시 볼 수 없습니다.</strong> 사용자에게 안전한 채널로 전달하세요.
        </p>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 font-mono text-base">
          <span className="flex-1 select-all">{info.password}</span>
          <Button size="sm" variant="ghost" onClick={copy} title="복사">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>확인</Button>
        </div>
      </div>
    </div>
  );
}
