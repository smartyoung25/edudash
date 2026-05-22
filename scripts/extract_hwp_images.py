#!/usr/bin/env python
"""HWP(OLE) 파일에서 BinData 스트림의 이미지 추출 — 압축/비압축 모두 지원"""
import sys, olefile, os, json, zlib
sys.stdout.reconfigure(encoding='utf-8')

if len(sys.argv) < 3:
    print(json.dumps({"error": "usage: extract_hwp_images.py <hwp_file> <out_dir>"}))
    sys.exit(1)

hwp_path = sys.argv[1]
out_dir = sys.argv[2]
os.makedirs(out_dir, exist_ok=True)

def detect_image_ext(data):
    if not data or len(data) < 8: return None
    if data[:2] == b"\xff\xd8": return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n": return ".png"
    if data[:2] == b"BM": return ".bmp"
    if data[:4] == b"GIF8": return ".gif"
    return None

extracted = []
try:
    ole = olefile.OleFileIO(hwp_path)
    for entry in ole.listdir():
        if len(entry) < 2 or entry[0] != "BinData": continue
        name = entry[1]
        try:
            data = ole.openstream(entry).read()
        except Exception:
            continue
        if len(data) < 500: continue

        # 1. 압축 안 된 이미지
        ext = detect_image_ext(data)
        out_data = data

        # 2. 표준 zlib 시도
        if not ext:
            try:
                dec = zlib.decompress(data)
                ext2 = detect_image_ext(dec)
                if ext2:
                    ext = ext2
                    out_data = dec
            except Exception:
                pass
        # 3. raw deflate (HWP의 일반적 압축 방식)
        if not ext:
            try:
                dec = zlib.decompress(data, -15)
                ext2 = detect_image_ext(dec)
                if ext2:
                    ext = ext2
                    out_data = dec
            except Exception:
                pass
        # 4. 일부 바이트 스킵 후 시도 (HWP 헤더)
        if not ext and len(data) > 4:
            for skip in [4, 8, 16]:
                try:
                    dec = zlib.decompress(data[skip:], -15)
                    ext2 = detect_image_ext(dec)
                    if ext2:
                        ext = ext2
                        out_data = dec
                        break
                except Exception:
                    pass

        if not ext: continue
        out_path = os.path.join(out_dir, f"{name.replace('/', '_')}{ext}")
        with open(out_path, "wb") as f:
            f.write(out_data)
        extracted.append({"name": name, "path": out_path, "size": len(out_data)})
    ole.close()
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)

print(json.dumps({"ok": True, "images": extracted}, ensure_ascii=False))
