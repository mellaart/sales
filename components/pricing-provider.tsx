"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  DEFAULT_PRICE_CONFIG,
  normalizePricingConfig,
  type EditablePricingConfig,
} from "@/lib/price-config";

type PricingContextType = {
  pricingConfig: EditablePricingConfig;
  loading: boolean;
  refreshPricingConfig: () => Promise<void>;
};

const PricingContext = createContext<PricingContextType>({
  pricingConfig: DEFAULT_PRICE_CONFIG,
  loading: true,
  refreshPricingConfig: async () => {},
});

export function PricingProvider({ children }: { children: React.ReactNode }) {
  const [pricingConfig, setPricingConfig] = useState<EditablePricingConfig>(DEFAULT_PRICE_CONFIG);
  const [loading, setLoading] = useState(true);

  const refreshPricingConfig = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/prices", { cache: "no-store" });
      const json = (await response.json().catch(() => ({}))) as { pricingConfig?: unknown };

      if (response.ok) {
        setPricingConfig(normalizePricingConfig(json.pricingConfig));
      } else {
        setPricingConfig(DEFAULT_PRICE_CONFIG);
      }
    } catch {
      setPricingConfig(DEFAULT_PRICE_CONFIG);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPricingConfig();

    function handlePricingConfigUpdated(event: Event) {
      setPricingConfig(normalizePricingConfig((event as CustomEvent).detail));
    }

    window.addEventListener("pricing-config-updated", handlePricingConfigUpdated);
    return () => window.removeEventListener("pricing-config-updated", handlePricingConfigUpdated);
  }, [refreshPricingConfig]);

  return (
    <PricingContext.Provider value={{ pricingConfig, loading, refreshPricingConfig }}>
      {children}
    </PricingContext.Provider>
  );
}

export function usePricingConfig() {
  return useContext(PricingContext);
}
