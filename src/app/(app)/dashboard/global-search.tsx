"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, Loader2, X } from "lucide-react";

type Hit = { id: number; label: string; detail: string; href: string };
type Results = Record<string, Hit[]>;

// 검색칸을 숨길 경로 (정확/접두어 둘 다 지원)
const HIDDEN_PREFIXES = ["/agency"];

export function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ results: Results; total: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // debounce fetch
  useEffect(() => {
    if (q.trim().length < 1) { setData(null); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const json = await res.json();
          setData({ results: json.results || {}, total: json.total || 0 });
        }
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // outside click → close
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ESC → close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  const showPanel = open && q.trim().length > 0;

  if (hidden) return null;

  return (
    <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-6 py-3">
    <div ref={wrapRef} className="relative w-full max-w-2xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="검색 — 학생·팀·거래처·출장명·서류·연락처 …"
          className="pl-9 pr-9"
        />
        {q && (
          <button
            onClick={() => { setQ(""); setData(null); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="지우기"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showPanel && (
        <Card className="absolute z-50 mt-1 w-full max-h-[60vh] overflow-auto p-2 shadow-lg border bg-background">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 검색 중…
            </div>
          )}
          {!loading && data && data.total === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              "{q}" 에 해당하는 결과가 없습니다.
            </div>
          )}
          {!loading && data && data.total > 0 && (
            <div className="space-y-3">
              {Object.entries(data.results).map(([cat, hits]) => (
                <div key={cat}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1 sticky top-0 bg-background/95 backdrop-blur">
                    {cat} ({hits.length})
                  </div>
                  <ul>
                    {hits.map((h) => (
                      <li key={`${cat}-${h.id}`}>
                        <button
                          onClick={() => go(h.href)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-muted/60 transition-colors"
                        >
                          <div className="font-medium text-sm">{h.label}</div>
                          <div className="text-xs text-muted-foreground truncate">{h.detail}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
    </div>
  );
}
