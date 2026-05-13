import fs from "fs";
import path from "path";
import { getDriveClient } from "./google-auth";
import { env, isDriveEnabled } from "../env";

async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const drive = getDriveClient();
  if (!drive) throw new Error("Drive client not initialized");

  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
  const list = await drive.files.list({ q, fields: "files(id,name)" });
  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id!;
  }
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  return created.data.id!;
}

export async function uploadReceipt(opts: {
  teamName: string;
  month: number;
  filePath: string;
  fileName: string;
}): Promise<{ ok: boolean; message: string; webViewLink?: string }> {
  if (!isDriveEnabled()) {
    return { ok: false, message: "Drive 자격증명 미설정" };
  }
  const drive = getDriveClient();
  if (!drive) return { ok: false, message: "Drive client not initialized" };
  if (!fs.existsSync(opts.filePath)) return { ok: false, message: "파일이 존재하지 않습니다" };

  try {
    // 폴더 구조: ROOT / [팀명] / 경비영수증 / [월]월 /
    const teamFolder = await findOrCreateFolder(opts.teamName, env.DRIVE_ROOT_FOLDER_ID);
    const expenseFolder = await findOrCreateFolder("경비영수증", teamFolder);
    const monthFolder = await findOrCreateFolder(`${opts.month}월`, expenseFolder);

    const ext = path.extname(opts.fileName).toLowerCase();
    const mimeType = ext === ".pdf" ? "application/pdf"
      : ext === ".png" ? "image/png"
      : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
      : "application/octet-stream";

    const created = await drive.files.create({
      requestBody: { name: opts.fileName, parents: [monthFolder] },
      media: { mimeType, body: fs.createReadStream(opts.filePath) },
      fields: "id,webViewLink",
    });
    return { ok: true, message: "업로드 완료", webViewLink: created.data.webViewLink ?? undefined };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "알 수 없는 오류" };
  }
}
