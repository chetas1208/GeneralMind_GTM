"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

export function AppToaster() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <Toaster
      position={mobile ? "top-center" : "top-right"}
      visibleToasts={3}
      toastOptions={{
        duration: 4000,
        className: "max-w-[400px] border border-border/70 bg-card text-foreground shadow-lg",
      }}
    />
  );
}
