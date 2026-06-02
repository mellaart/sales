import "./globals.css";

import type { Metadata } from "next";
import Script from "next/script";
import { AuthProvider } from "@/components/auth-provider";
import { AppShellHeader } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Smart Trade",
  description: "Smart Trade offerteplatform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>
        <Script src="/customer-portal-current-sync.js" strategy="beforeInteractive" />
        <AuthProvider>
          <AppShellHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
