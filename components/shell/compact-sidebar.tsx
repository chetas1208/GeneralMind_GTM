"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleHelp, Kanban, LogOut, Radar, Search, Users, PanelLeftClose, PanelLeft } from "lucide-react";
import { restartProductTour } from "@/components/onboarding/product-tour";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/radar", label: "Radar", icon: Radar, match: (p: string) => p === "/radar" || p.startsWith("/events") },
  { href: "/leads", label: "Leads", icon: Users, match: (p: string) => p.startsWith("/leads") },
  { href: "/pipeline", label: "Pipeline", icon: Kanban, match: (p: string) => p === "/pipeline" },
];

export function CompactSidebar({
  collapsed,
  onToggle,
  onSearch,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onSearch: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-border/80 bg-sidebar transition-[width] duration-200",
        collapsed ? "w-[52px]" : "w-[200px]",
      )}
    >
      <div className={cn("flex h-12 items-center gap-2 border-b border-border/60 px-3", collapsed && "justify-center px-0")}>
        <Link href="/radar" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground" title="GeneralMind GTM Radar">
          <Radar className="size-4" />
        </Link>
        {!collapsed && <span className="truncate text-[13px] font-semibold tracking-tight">GTM Radar</span>}
        <button
          type="button"
          onClick={onToggle}
          className={cn("ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground", collapsed && "ml-0")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              data-tour={href === "/leads" ? "leads" : href === "/pipeline" ? "pipeline" : undefined}
              title={label}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                active && "bg-accent text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border/60 p-2">
        <button
          type="button"
          title="Restart product tour"
          onClick={() => {
            if (pathname !== "/radar") {
              sessionStorage.setItem("gm-tour-pending", "1");
              router.push("/radar");
              return;
            }
            restartProductTour();
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <CircleHelp className="size-4 shrink-0" />
          {!collapsed && <span className="flex-1 text-left">Help</span>}
        </button>
        <button
          type="button"
          onClick={onSearch}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <Search className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="rounded border px-1 font-mono text-[10px]">⌘K</kbd>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
            router.push("/login");
            router.refresh();
          }}
          className={cn(
            "mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
          title="Sign out"
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && <span className="flex-1 text-left">Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
