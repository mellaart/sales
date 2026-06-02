import Script from "next/script";

import AssetsDashboard from "@/components/assets-dashboard";

export default function AssetsPage() {
  return (
    <>
      <AssetsDashboard />
      <Script src="/customer-portal-current-sync.js" strategy="afterInteractive" />
    </>
  );
}
