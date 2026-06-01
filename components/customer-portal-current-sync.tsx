"use client";

import { useEffect, useRef } from "react";

const CUSTOMER_PORTAL_OPTIONS = [
  { key: "facturenBetalen", name: "Facturen betalen" },
  { key: "offertesOrdersMaken", name: "Offertes en orders maken" },
  { key: "offertesInzienGoedkeuren", name: "Offertes inzien en goedkeuren" },
  { key: "assortiment", name: "Assortiment" },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSelectedRelationKey() {
  const selectedButton = Array.from(document.querySelectorAll("button")).find((button) => {
    const text = button.textContent ?? "";
    return text.includes("Geselecteerd") && /\bID\s+\d+\b/.test(text);
  });

  return selectedButton?.textContent?.match(/\bID\s+(\d+)\b/)?.[1] ?? null;
}

function getSectionByStep(step: string) {
  return Array.from(document.querySelectorAll("section")).find((section) =>
    (section.textContent ?? "").includes(step),
  ) ?? null;
}

function getCurrentPortalKeysFromAssets() {
  const assetsSection = getSectionByStep("Stap 2");
  const assetsText = normalize(assetsSection?.textContent ?? "");

  if (!assetsText.includes("klantportaal")) return [];

  return CUSTOMER_PORTAL_OPTIONS.filter((option) =>
    assetsText.includes(normalize(`klantportaal ${option.name}`)),
  ).map((option) => option.key);
}

function getCustomerPortalCheckbox(optionName: string) {
  const stepSection = getSectionByStep("Stap 5");
  if (!stepSection) return null;

  const normalizedName = normalize(optionName);
  const label = Array.from(stepSection.querySelectorAll("label")).find((candidate) =>
    normalize(candidate.textContent ?? "").includes(normalizedName),
  );

  return label?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;
}

export default function CustomerPortalCurrentSync() {
  const lastSyncKey = useRef<string | null>(null);

  useEffect(() => {
    function syncCurrentCustomerPortalOptions() {
      const relationKey = getSelectedRelationKey();
      if (!relationKey) return;

      const currentPortalKeys = getCurrentPortalKeysFromAssets();
      if (currentPortalKeys.length === 0) return;

      const syncKey = `${relationKey}:${currentPortalKeys.slice().sort().join(",")}`;
      if (lastSyncKey.current === syncKey) return;

      let allTargetsFound = true;

      for (const option of CUSTOMER_PORTAL_OPTIONS) {
        if (!currentPortalKeys.includes(option.key)) continue;

        const checkbox = getCustomerPortalCheckbox(option.name);
        if (!checkbox) {
          allTargetsFound = false;
          continue;
        }

        if (!checkbox.checked) checkbox.click();
      }

      if (allTargetsFound) lastSyncKey.current = syncKey;
    }

    const observer = new MutationObserver(syncCurrentCustomerPortalOptions);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const interval = window.setInterval(syncCurrentCustomerPortalOptions, 800);
    syncCurrentCustomerPortalOptions();

    return () => {
      window.clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  return null;
}
