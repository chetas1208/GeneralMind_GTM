"use client";

import { useState } from "react";
import { Loader2, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }).catch(() => null);
    if (res?.ok) {
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/radar");
      return;
    }
    setError(res ? ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Sign-in failed" : "Network error");
    setPending(false);
  }

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4 rounded-lg border bg-card p-6">
      <div className="flex items-center gap-2 font-semibold">
        <Radar className="size-4" /> GeneralMind GTM Radar
      </div>
      <p className="text-muted-foreground">This workspace triggers paid data-provider calls and CRM writes, so it is access-controlled.</p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Access password"
          className="h-9 w-full rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending || !password}>
          {pending && <Loader2 className="animate-spin" />} Continue
        </Button>
      </form>
    </div>
  );
}
