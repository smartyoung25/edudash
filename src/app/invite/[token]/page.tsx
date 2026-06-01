import { AcceptInviteForm } from "./accept-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-100 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white text-xl font-bold">성</div>
          <CardTitle className="text-2xl">성장농 교육운영 가입</CardTitle>
          <CardDescription>비밀번호를 설정하면 바로 로그인됩니다</CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptInviteForm token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
