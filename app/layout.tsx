import "./globals.css";

import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth-guard";
import { AuthProvider } from "@/components/auth-provider";
import { AppShellHeader } from "@/components/app-shell";
import { PricingProvider } from "@/components/pricing-provider";

export const metadata: Metadata = {
  title: "Smart Trade",
  description: "Smart Trade offerteplatform",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>
        <AuthProvider>
          <PricingProvider>
            <AuthGuard>
              <AppShellHeader />
              {children}
            </AuthGuard>
          </PricingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
