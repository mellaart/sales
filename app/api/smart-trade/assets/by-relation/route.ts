import { NextResponse } from "next/server";
import { getAssetsWithModulesForRelation } from "@/lib/smart-trade-api";

const MAX_RELATION_ID_LENGTH = 80;
const SMART_TRADE_PACKAGE_NAMES = ["Lite", "Starter", "Basic", "Premium", "Enterprise"];

type PlannerAsset = {
  name?: string | null;
  assetClass?: string | null;
};

function normalizeLabel(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSmartTradePackageName(value?: string | null) {
  const name = value?.trimStart() ?? "";
  return SMART_TRADE_PACKAGE_NAMES.find((packageName) =>
    name.toLowerCase().startsWith(`smart trade ${packageName}`.toLowerCase()),
  ) ?? null;
}

function getSmartConnectAssetClass(value?: string | null) {
  const match = value?.match(/\bconnect\b\D*(\d+)\D*connectie/i);
  const connections = match ? Number(match[1]) : Number.NaN;

  if (!Number.isFinite(connections) || connections <= 0) return null;
  return `Smart Connect ${Math.floor(connections)}`;
}

function getPlannerModuleAssetName(value?: string | null) {
  const packageName = getSmartTradePackageName(value);
  if (!packageName) return null;

  const normalizedName = normalizeLabel(value);
  const modulePrefix = `Smart Trade ${packageName} module - `;

  if (normalizedName.includes("digitaal ondertekenen")) {
    return `${modulePrefix}Digitale ondertekening`;
  }

  if (normalizedName.includes("suite mkb")) {
    return `${modulePrefix}Suite MKB koppeling`;
  }

  return null;
}

function normalizePlannerAsset<T extends PlannerAsset>(asset: T) {
  const assetClass = getSmartConnectAssetClass(asset.name) ?? getSmartConnectAssetClass(asset.assetClass);
  const name = getPlannerModuleAssetName(asset.name) ?? asset.name;

  if (!assetClass && name === asset.name) return asset;

  return {
    ...asset,
    assetClass: assetClass ?? asset.assetClass,
    name,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const relationId = url.searchParams.get("relationId")?.trim();

    if (!relationId) {
      return NextResponse.json({ error: "relationId ontbreekt." }, { status: 400 });
    }

    if (relationId.length > MAX_RELATION_ID_LENGTH) {
      return NextResponse.json(
        { error: `relationId mag maximaal ${MAX_RELATION_ID_LENGTH} tekens bevatten.` },
        { status: 400 },
      );
    }

    const assets = (await getAssetsWithModulesForRelation(relationId)).map(normalizePlannerAsset);

    return NextResponse.json(
      {
        assets,
        totals: {
          assets: assets.length,
          activeModules: assets.reduce(
            (sum, asset) => sum + asset.modules.filter((module) => module.active).length,
            0,
          ),
          inactiveModules: assets.reduce(
            (sum, asset) => sum + asset.modules.filter((module) => !module.active).length,
            0,
          ),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assets ophalen mislukt." },
      { status: 500 },
    );
  }
}
