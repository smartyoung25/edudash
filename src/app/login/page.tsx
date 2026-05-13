import { LoginForm } from "./login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-100 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white text-xl font-bold">성</div>
          <CardTitle className="text-2xl">성장농 교육운영</CardTitle>
          <CardDescription>2026 성장농 맞춤형과정 관리 시스템</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
          <div className="mt-6 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <div className="font-medium mb-1">테스트 계정 (비밀번호 모두 1234)</div>
            <ul className="space-y-0.5">
              <li><code>admin</code> — 관리자(이암허브)</li>
              <li><code>coord1</code> — 코디네이터</li>
              <li><code>prof1</code> — 주임교수</li>
              <li><code>funder</code> — 발주기관(농정원)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
