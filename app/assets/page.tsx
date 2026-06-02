import Script from "next/script";

import AssetsDashboard from "@/components/assets-dashboard";

const customerPortalSyncScript = `
(() => {
  if (window.__customerPortalCurrentSyncActive) return;
  window.__customerPortalCurrentSyncActive = true;

  const options = [
    { key: "facturenBetalen", name: "Facturen betalen" },
    { key: "offertesOrdersMaken", name: "Offertes en orders maken" },
    { key: "offertesInzienGoedkeuren", name: "Offertes inzien en goedkeuren" },
    { key: "assortiment", name: "Assortiment" },
  ];

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function getSelectedRelationKey() {
    const selectedButton = Array.from(document.querySelectorAll("button")).find((button) => {
      const text = button.textContent || "";
      return text.includes("Geselecteerd") && /\bID\s+\d+\b/.test(text);
    });

    const match = selectedButton && selectedButton.textContent && selectedButton.textContent.match(/\bID\s+(\d+)\b/);
    return match ? match[1] : null;
  }

  function getSectionByStep(step) {
    return Array.from(document.querySelectorAll("section")).find((section) =>
      (section.textContent || "").includes(step)
    ) || null;
  }

  function getCurrentPortalKeysFromAssets() {
    const assetsSection = getSectionByStep("Stap 2");
    const assetsText = normalize(assetsSection && assetsSection.textContent);

    if (!assetsText.includes("klantportaal")) return [];

    return options
      .filter((option) => assetsText.includes(normalize("klantportaal " + option.name)))
      .map((option) => option.key);
  }

  function getCustomerPortalCheckbox(optionName) {
    const stepSection = getSectionByStep("Stap 5");
    if (!stepSection) return null;

    const normalizedName = normalize(optionName);
    const label = Array.from(stepSection.querySelectorAll("label")).find((candidate) =>
      normalize(candidate.textContent).includes(normalizedName)
    );

    return label ? label.querySelector('input[type="checkbox"]') : null;
  }

  let lastSyncKey = null;

  function syncCurrentCustomerPortalOptions() {
    const relationKey = getSelectedRelationKey();
    if (!relationKey) return;

    const currentPortalKeys = getCurrentPortalKeysFromAssets();
    if (currentPortalKeys.length === 0) return;

    const syncKey = relationKey + ":" + currentPortalKeys.slice().sort().join(",");
    if (lastSyncKey === syncKey) return;

    let allTargetsFound = true;

    for (const option of options) {
      if (!currentPortalKeys.includes(option.key)) continue;

      const checkbox = getCustomerPortalCheckbox(option.name);
      if (!checkbox) {
        allTargetsFound = false;
        continue;
      }

      if (!checkbox.checked) checkbox.click();
    }

    if (allTargetsFound) lastSyncKey = syncKey;
  }

  const start = () => {
    const observer = new MutationObserver(syncCurrentCustomerPortalOptions);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.setInterval(syncCurrentCustomerPortalOptions, 800);
    syncCurrentCustomerPortalOptions();
  };

  if (document.body) start();
  else window.addEventListener("DOMContentLoaded", start, { once: true });
})();
`;

export default function AssetsPage() {
  return (
    <>
      <AssetsDashboard />
      <Script id="customer-portal-current-sync" strategy="afterInteractive">
        {customerPortalSyncScript}
      </Script>
    </>
  );
}
