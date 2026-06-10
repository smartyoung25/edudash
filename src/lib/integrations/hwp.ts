/**
 * HWP(구형 OLE/CFB) 파일의 BinData 스트림에서 내장 이미지(영수증)를 추출 — 순수 JS.
 *
 * 기존에는 scripts/extract_hwp_images.py (Python olefile) 를 execFileSync 로 호출했으나,
 * Vercel(서버리스, Python 없음)에서는 동작하지 않아 메일 자동수집 시 HWP 첨부의 영수증이
 * 추출되지 못했다. cfb(OLE 파서) + Node zlib 로 동일 로직을 순수 JS 로 구현해 운영에서도 동작.
 */
import * as CFB from "cfb";
import zlib from "zlib";

function detectImageExt(data: Uint8Array): string | null {
  if (!data || data.length < 8) return null;
  if (data[0] === 0xff && data[1] === 0xd8) return ".jpg";
  if (
    data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 &&
    data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a
  ) return ".png";
  if (data[0] === 0x42 && data[1] === 0x4d) return ".bmp";
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return ".gif";
  return null;
}

function tryInflate(buf: Buffer): Buffer | null {
  // 1) 표준 zlib
  try { return zlib.inflateSync(buf); } catch {}
  // 2) raw deflate (HWP 일반 압축 방식, python zlib.decompress(data, -15) 대응)
  try { return zlib.inflateRawSync(buf); } catch {}
  // 3) 일부 헤더 바이트 스킵 후 raw deflate
  for (const skip of [4, 8, 16]) {
    if (buf.length <= skip) continue;
    try { return zlib.inflateRawSync(buf.subarray(skip)); } catch {}
  }
  return null;
}

/** HWP 버퍼에서 BinData 이미지 추출. 반환: { name, buf }[] */
export function extractHwpImagesFromBuffer(
  hwpBuf: Buffer,
  label: string,
): { name: string; buf: Buffer }[] {
  const out: { name: string; buf: Buffer }[] = [];
  let cfb: CFB.CFB$Container;
  try {
    cfb = CFB.read(hwpBuf, { type: "buffer" });
  } catch {
    return out;
  }

  for (const entry of cfb.FileIndex) {
    if (entry.type !== 2) continue; // 2 = stream
    const fullPath = cfb.FullPaths[cfb.FileIndex.indexOf(entry)] || "";
    // BinData 폴더 내부 스트림만
    if (!/(^|\/)BinData\//i.test(fullPath)) continue;
    const raw = entry.content as Uint8Array | undefined;
    if (!raw || raw.length < 500) continue;
    const data = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);

    // 1) 비압축 이미지
    let ext = detectImageExt(data);
    let outData = data;
    // 2) 압축 해제 후 이미지 시그니처
    if (!ext) {
      const dec = tryInflate(data);
      if (dec) {
        const ext2 = detectImageExt(dec);
        if (ext2) { ext = ext2; outData = dec; }
      }
    }
    if (!ext) continue;

    const name = entry.name.replace(/\//g, "_");
    out.push({ name: `${label}::${name}${ext}`, buf: outData });
  }
  return out;
}
