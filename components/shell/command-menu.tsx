"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Result = { id: string; label: string; sub: string; href: string };
type SearchResponse = { people: Result[]; companies: Result[]; events: Result[]; signals?: Result[] };

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const close = useCallback(() => {
    setQ("");
    setData(null);
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else onOpenChange(true);
      }
      if (e.key === "Escape" && open) close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, close]);

  const search = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || q.length < 2) return;
    const t = setTimeout(() => search(q), 180);
    return () => clearTimeout(t);
  }, [q, open, search]);

  const shown = open && q.length >= 2 ? data : null;

  if (!open) return null;

  const groups: { title: string; items: Result[] }[] = [
    { title: "People", items: shown?.people ?? [] },
    { title: "Companies", items: shown?.companies ?? [] },
    { title: "Signals", items: shown?.signals ?? [] },
    { title: "Events", items: shown?.events ?? [] },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Search">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border bg-popover shadow-2xl">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people, companies, signals, events…"
            className="h-11 flex-1 bg-transparent text-[13px] outline-none"
          />
          <kbd className="hidden rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {q.length < 2 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Type at least 2 characters</p>}
          {loading && <p className="px-2 py-4 text-xs text-muted-foreground">Searching…</p>}
          {!loading &&
            q.length >= 2 &&
            groups.map(
              (g) =>
                g.items.length > 0 && (
                  <div key={g.title} className="mb-2">
                    <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{g.title}</div>
                    {g.items.map((item) => (
                      <button
                        key={item.id + item.href}
                        type="button"
                        className={cn("flex w-full flex-col rounded-lg px-2 py-2 text-left hover:bg-accent")}
                        onClick={() => {
                          close();
                          router.push(item.href);
                        }}
                      >
                        <span className="font-medium">{item.label}</span>
                        {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                      </button>
                    ))}
                  </div>
                ),
            )}
          {!loading && q.length >= 2 && groups.every((g) => g.items.length === 0) && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">No matches</p>
          )}
        </div>
      </div>
    </div>
  );
}
