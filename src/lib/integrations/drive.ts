import { Readable } from "stream";
import { getDriveClient } from "./google-auth";
import { env, isDriveEnabled } from "../env";

async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const drive = getDriveClient();
  if (!drive) throw new Error("Drive client not initialized");

  const safeName = name.replace(/'/g, "\\'");
  const q = `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
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

function mimeFromExt(fileName: string): string {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  switch (ext) {
    case ".pdf": return "application/pdf";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".hwp": return "application/x-hwp";
    default: return "application/octet-stream";
  }
}

export interface UploadResult {
  ok: boolean;
  message: string;
  webViewLink?: string;
  fileId?: string;
}

/**
 * Upload a file to Drive under [team]/[docType]/[month]월/ (or 미분류 root if no team).
 * Accepts the file bytes directly — no local disk required.
 */
export async function uploadDocumentToDrive(opts: {
  teamName: string | null;
  docType: string;
  month: number | null;
  fileName: string;
  bytes: ArrayBuffer | Uint8Array | Buffer;
}): Promise<UploadResult> {
  if (!isDriveEnabled()) {
    return { ok: false, message: "Drive 자격증명 미설정" };
  }
  const drive = getDriveClient();
  if (!drive) return { ok: false, message: "Drive client not initialized" };

  try {
    let parent = env.DRIVE_ROOT_FOLDER_ID;
    if (opts.teamName) {
      parent = await findOrCreateFolder(opts.teamName, parent);
      parent = await findOrCreateFolder(opts.docType, parent);
      if (opts.month) {
        parent = await findOrCreateFolder(`${opts.month}월`, parent);
      }
    } else {
      parent = await findOrCreateFolder("미분류", parent);
    }

    const buffer = opts.bytes instanceof Uint8Array
      ? Buffer.from(opts.bytes)
      : Buffer.isBuffer(opts.bytes)
        ? opts.bytes
        : Buffer.from(new Uint8Array(opts.bytes));

    const created = await drive.files.create({
      requestBody: { name: opts.fileName, parents: [parent] },
      media: { mimeType: mimeFromExt(opts.fileName), body: Readable.from(buffer) },
      fields: "id,webViewLink",
    });
    return {
      ok: true,
      message: "업로드 완료",
      webViewLink: created.data.webViewLink ?? undefined,
      fileId: created.data.id ?? undefined,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "알 수 없는 오류" };
  }
}

/**
 * Backwards-compatible wrapper for receipt uploads.
 */
export async function uploadReceipt(opts: {
  teamName: string;
  month: number;
  bytes: ArrayBuffer | Uint8Array | Buffer;
  fileName: string;
}): Promise<UploadResult> {
  return uploadDocumentToDrive({
    teamName: opts.teamName,
    docType: "경비영수증",
    month: opts.month,
    fileName: opts.fileName,
    bytes: opts.bytes,
  });
}
