import "./globals.css";
import type { Metadata } from "next";
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
        <AuthProvider>
          <AppShellHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}