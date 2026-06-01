import { NextResponse } from "next/server";
import { getAssetsWithModulesForRelation } from "@/lib/smart-trade-api";

const MAX_RELATION_ID_LENGTH = 80;

function getSmartConnectAssetClass(value?: string | null) {
  const match = value?.match(/\bconnect\b\D*(\d+)\D*connectie/i);
  const connections = match ? Number(match[1]) : Number.NaN;

  if (!Number.isFinite(connections) || connections <= 0) return null;
  return `Smart Connect ${Math.floor(connections)}`;
}

function normalizeSmartConnectAsset<T extends { name?: string | null; assetClass?: string | null }>(asset: T) {
  const assetClass = getSmartConnectAssetClass(asset.name) ?? getSmartConnectAssetClass(asset.assetClass);
  if (!assetClass) return asset;

  return {
    ...asset,
    assetClass,
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

    const assets = (await getAssetsWithModulesForRelation(relationId)).map(normalizeSmartConnectAsset);

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
