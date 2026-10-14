import type { Metadata } from "next";
import WorldlineConnectivityTest from "@/components/worldline-connectivity-test";

export const metadata: Metadata = {
  title: "Worldline netwerkcontrole | Smart Trade",
  description: "Controleer vanaf het klantnetwerk de verbinding met de Worldline-diensten.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function WorldlineConnectivityTestPage() {
  return <WorldlineConnectivityTest />;
}
