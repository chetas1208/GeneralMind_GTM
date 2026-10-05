import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { AppToaster } from "@/components/ui/toaster";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "GeneralMind GTM Radar", template: "%s · GTM Radar" },
  description: "Evidence-backed GTM intelligence — who to talk to, why, and what to do next.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full dark`}>
      <body className="min-h-full bg-background text-foreground antialiased">
        <AppShell>{children}</AppShell>
        <AppToaster />
      </body>
    </html>
  );
}
