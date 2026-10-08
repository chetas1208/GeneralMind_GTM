"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { CommandMenu } from "./command-menu";
import { CompactSidebar } from "./compact-sidebar";
import { MobileNav } from "./mobile-nav";

// Loaded after hydration: onboarding must never delay first paint.
const ProductTour = dynamic(() => import("@/components/onboarding/product-tour").then((m) => m.ProductTour), { ssr: false });

const STORAGE_KEY = "gm-sidebar-collapsed";

function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getCollapsedSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getCollapsedServerSnapshot(): boolean {
  return false;
}

export function AppShell({ children }: { children: ReactNode }) {
  const isCollapsedStored = useSyncExternalStore(subscribeStorage, getCollapsedSnapshot, getCollapsedServerSnapshot);
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null);
  const collapsed = collapsedOverride ?? isCollapsedStored;
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsedOverride(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  // The sign-in screen is public: no navigation, search or data hooks until a session exists.
  if (pathname === "/login") return <main className="min-h-screen px-4">{children}</main>;

  return (
    <>
      <MobileNav onSearch={() => setSearchOpen(true)} />
      <div className="flex min-h-screen w-full md:min-h-screen">
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
