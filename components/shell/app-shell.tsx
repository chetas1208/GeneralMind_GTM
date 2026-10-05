"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ProductTour } from "@/components/onboarding/product-tour";
import { CommandMenu } from "./command-menu";
import { CompactSidebar } from "./compact-sidebar";

const STORAGE_KEY = "gm-sidebar-collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // The sign-in screen is public: no navigation, search or data hooks until a session exists.
  if (pathname === "/login") return <main className="min-h-screen px-4">{children}</main>;

  return (
    <>
      <div className="flex min-h-screen w-full">
        <CompactSidebar collapsed={collapsed} onToggle={toggleCollapsed} onSearch={() => setSearchOpen(true)} />
        <main className="min-w-0 flex-1 overflow-x-clip">
          <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
      <ProductTour auto={pathname === "/radar"} />
    </>
  );
}
