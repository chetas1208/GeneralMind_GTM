"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleHelp, Kanban, LogOut, Menu, Radar, Search, Users } from "lucide-react";
import { restartProductTour } from "@/components/onboarding/tour-events";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/radar", label: "Radar", icon: Radar, match: (p: string) => p === "/radar" || p.startsWith("/events") },
  { href: "/leads", label: "Leads", icon: Users, match: (p: string) => p.startsWith("/leads") },
  { href: "/pipeline", label: "Pipeline", icon: Kanban, match: (p: string) => p === "/pipeline" },
];

const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground";

/** Below md there is no persistent sidebar: a top bar with a menu button opens this drawer. */
export function MobileNav({ onSearch }: { onSearch: () => void }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border/80 bg-background/95 px-4 backdrop-blur md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<button type="button" aria-label="Open menu" className="-ml-1.5 rounded-md p-1.5 text-foreground hover:bg-accent" />}>
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 max-w-[80vw] p-0">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>GeneralMind Radar</SheetTitle>
          </SheetHeader>
          <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 p-2">
            {NAV.map(({ href, label, icon: Icon, match }) => (
              <Link key={href} href={href} onClick={close} className={cn(item, match(pathname) && "bg-accent text-foreground")}>
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            ))}
            <button type="button" className={item} onClick={() => { close(); onSearch(); }}>
              <Search className="size-4 shrink-0" />
              Search
            </button>
            <button
              type="button"
              className={item}
              onClick={() => {
                close();
                if (pathname !== "/radar") {
                  sessionStorage.setItem("gm-tour-pending", "1");
                  router.push("/radar");
                  return;
                }
                restartProductTour();
              }}
            >
              <CircleHelp className="size-4 shrink-0" />
              Help
            </button>
          </nav>
          <div className="border-t border-border/60 p-2">
            <button
              type="button"
              className={item}
              onClick={async () => {
                close();
                await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
                router.push("/login");
                router.refresh();
              }}
            >
              <LogOut className="size-4 shrink-0" />
              Sign out
            </button>
          </div>
        </SheetContent>
      </Sheet>
      <Link href="/radar" className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Radar className="size-4" />
        </span>
        GeneralMind Radar
      </Link>
    </header>
  );
}
