"use client";

import { useEffect, useRef } from "react";

import AssetsDashboard from "@/components/assets-dashboard";

const CUSTOMER_PORTAL_OPTIONS = [
  { key: "facturenBetalen", name: "Facturen betalen" },
  { key: "offertesOrdersMaken", name: "Offertes en orders maken" },
  { key: "offertesInzienGoedkeuren", name: "Offertes inzien en goedkeuren" },
  { key: "assortiment", name: "Assortiment" },
];

type SyncWindow = Window &
  typeof globalThis & {
    __customerPortalCurrentSync?: {
      runs: number;
      relationKey: string | null;
      currentKeys: string[];
      lastSyncKey: string | null;
    };
  };

function normalize(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSectionByStep(step: string) {
  return Array.from(document.querySelectorAll("section")).find((section) =>
    (section.textContent || "").includes(step),
  ) ?? null;
}

function getSelectedRelationKey() {
  const selectedButton = Array.from(document.querySelectorAll("button")).find((button) => {
    const text = button.textContent || "";
    return text.includes("Geselecteerd") && /\bID\s+\d+\b/.test(text);
  });

  const match = selectedButton?.textContent?.match(/\bID\s+(\d+)\b/);
  return match ? match[1] : null;
}

function getCurrentCustomerPortalKeys() {
  const assetsSection = getSectionByStep("Stap 2");
  const assetsText = normalize(assetsSection?.textContent);

  if (!assetsText.includes("klantportaal")) return [];

  return CUSTOMER_PORTAL_OPTIONS.filter((option) => assetsText.includes(normalize(option.name))).map(
    (option) => option.key,
  );
}

function getCustomerPortalCheckbox(optionName: string) {
  const customerPortalSection = getSectionByStep("Stap 5");
  if (!customerPortalSection) return null;

  const normalizedOptionName = normalize(optionName);
  const label = Array.from(customerPortalSection.querySelectorAll("label")).find((candidate) =>
    normalize(candidate.textContent).includes(normalizedOptionName),
  );

  return label?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;
}

export default function AssetsDashboardPage() {
  const lastSyncKeyRef = useRef<string | null>(null);

  useEffect(() => {
    function syncCurrentCustomerPortalOptions() {
      const relationKey = getSelectedRelationKey();
      const currentKeys = getCurrentCustomerPortalKeys();
      const syncWindow = window as SyncWindow;

      syncWindow.__customerPortalCurrentSync = {
        runs: (syncWindow.__customerPortalCurrentSync?.runs ?? 0) + 1,
        relationKey,
        currentKeys,
        lastSyncKey: lastSyncKeyRef.current,
      };

      if (!relationKey || currentKeys.length === 0) return;

      const syncKey = `${relationKey}:${currentKeys.slice().sort().join(",")}`;
      if (lastSyncKeyRef.current === syncKey) return;

      let allTargetsFound = true;

      for (const option of CUSTOMER_PORTAL_OPTIONS) {
        if (!currentKeys.includes(option.key)) continue;

        const checkbox = getCustomerPortalCheckbox(option.name);
        if (!checkbox) {
          allTargetsFound = false;
          continue;
        }

        if (!checkbox.checked) checkbox.click();
      }

      if (allTargetsFound) lastSyncKeyRef.current = syncKey;
    }

    const observer = new MutationObserver(syncCurrentCustomerPortalOptions);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const interval = window.setInterval(syncCurrentCustomerPortalOptions, 700);
    syncCurrentCustomerPortalOptions();

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <>
      <AssetsDashboard />
      <span data-customer-portal-current-sync="mounted" hidden />
    </>
  );
}
