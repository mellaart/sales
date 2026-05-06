import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { AuthGuard } from "@/components/auth-guard";
import { AppShellHeader } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Smart Trade prijs calculator",
  description: "Prijs calculator en offertegenerator voor Smart Trade.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <AuthProvider>
          <AppShellHeader />
          <AuthGuard>{children}</AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
