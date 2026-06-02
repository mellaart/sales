import AssetsDashboard from "@/components/assets-dashboard";

const customerPortalSyncFrame = `<!doctype html><html><body><script>
(() => {
  const root = parent;
  const doc = root.document;

  if (root.__customerPortalCurrentSyncLoaded) return;
  root.__customerPortalCurrentSyncLoaded = true;

  const options = [
    { key: "facturenBetalen", name: "Facturen betalen" },
    { key: "offertesOrdersMaken", name: "Offertes en orders maken" },
    { key: "offertesInzienGoedkeuren", name: "Offertes inzien en goedkeuren" },
    { key: "assortiment", name: "Assortiment" },
  ];

  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const getSectionByStep = (step) =>
    Array.from(doc.querySelectorAll("section")).find((section) =>
      (section.textContent || "").includes(step)
    ) || null;

  const getSelectedRelationKey = () => {
    const selectedButton = Array.from(doc.querySelectorAll("button")).find((button) => {
      const text = button.textContent || "";
      return text.includes("Geselecteerd") && /\\bID\\s+\\d+\\b/.test(text);
    });

    const match = selectedButton && selectedButton.textContent && selectedButton.textContent.match(/\\bID\\s+(\\d+)\\b/);
    return match ? match[1] : null;
  };

  const getCurrentCustomerPortalKeys = () => {
    const assetsSection = getSectionByStep("Stap 2");
    const assetsText = normalize(assetsSection && assetsSection.textContent);

    if (!assetsText.includes("klantportaal")) return [];

    return options
      .filter((option) => assetsText.includes(normalize(option.name)))
      .map((option) => option.key);
  };

  const getCustomerPortalCheckbox = (optionName) => {
    const customerPortalSection = getSectionByStep("Stap 5");
    if (!customerPortalSection) return null;

    const normalizedOptionName = normalize(optionName);
    const label = Array.from(customerPortalSection.querySelectorAll("label")).find((candidate) =>
      normalize(candidate.textContent).includes(normalizedOptionName)
    );

    return label ? label.querySelector('input[type="checkbox"]') : null;
  };

  let lastSyncKey = null;

  const syncCurrentCustomerPortalOptions = () => {
    const relationKey = getSelectedRelationKey();
    const currentKeys = getCurrentCustomerPortalKeys();

    root.__customerPortalCurrentSync = {
      runs: ((root.__customerPortalCurrentSync && root.__customerPortalCurrentSync.runs) || 0) + 1,
      relationKey,
      currentKeys,
      lastSyncKey,
    };

    if (!relationKey || currentKeys.length === 0) return;

    const syncKey = relationKey + ":" + currentKeys.slice().sort().join(",");
    if (lastSyncKey === syncKey) return;

    let allTargetsFound = true;

    for (const option of options) {
      if (!currentKeys.includes(option.key)) continue;

      const checkbox = getCustomerPortalCheckbox(option.name);
      if (!checkbox) {
        allTargetsFound = false;
        continue;
      }

      if (!checkbox.checked) checkbox.click();
    }

    if (allTargetsFound) lastSyncKey = syncKey;
  };

  const start = () => {
    const observer = new root.MutationObserver(syncCurrentCustomerPortalOptions);
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
    root.setInterval(syncCurrentCustomerPortalOptions, 700);
    syncCurrentCustomerPortalOptions();
  };

  if (doc.body) start();
  else root.addEventListener("DOMContentLoaded", start, { once: true });
})();
</script></body></html>`;

export default function AssetsPage() {
  return (
    <>
      <AssetsDashboard />
      <iframe
        aria-hidden="true"
        srcDoc={customerPortalSyncFrame}
        style={{
          border: 0,
          height: 1,
          left: -1,
          opacity: 0,
          pointerEvents: "none",
          position: "absolute",
          top: -1,
          width: 1,
        }}
        tabIndex={-1}
        title="customer-portal-current-sync"
      />
    </>
  );
}
