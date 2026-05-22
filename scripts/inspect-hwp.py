import sys, olefile
sys.stdout.reconfigure(encoding='utf-8')

ole = olefile.OleFileIO(sys.argv[1])
print("=== OLE 스트림 목록 ===")
for entry in ole.listdir():
    print("/".join(entry))
ole.close()
