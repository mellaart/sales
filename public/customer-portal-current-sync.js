(() => {
  if (!window.location.pathname.startsWith("/assets")) return;
  if (window.__customerPortalCurrentSyncLoaded) return;
  window.__customerPortalCurrentSyncLoaded = true;

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
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const getSectionByStep = (step) =>
    Array.from(document.querySelectorAll("section")).find((section) =>
      (section.textContent || "").includes(step)
    ) || null;

  const getSelectedRelationKey = () => {
    const selectedButton = Array.from(document.querySelectorAll("button")).find((button) => {
      const text = button.textContent || "";
      return text.includes("Geselecteerd") && /\bID\s+\d+\b/.test(text);
    });

    const match = selectedButton && selectedButton.textContent && selectedButton.textContent.match(/\bID\s+(\d+)\b/);
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

    window.__customerPortalCurrentSync = {
      runs: ((window.__customerPortalCurrentSync && window.__customerPortalCurrentSync.runs) || 0) + 1,
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
    const observer = new MutationObserver(syncCurrentCustomerPortalOptions);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.setInterval(syncCurrentCustomerPortalOptions, 700);
    syncCurrentCustomerPortalOptions();
  };

  if (document.body) start();
  else window.addEventListener("DOMContentLoaded", start, { once: true });
})();
