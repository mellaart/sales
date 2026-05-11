import "./globals.css";
import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}