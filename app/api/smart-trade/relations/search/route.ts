import { NextResponse } from "next/server";
import { getRelationName, searchRelations } from "@/lib/smart-trade-api";

const MAX_QUERY_LENGTH = 120;
const RELATION_SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RELATION_SEARCH_CACHE_ENTRIES = 250;

type RelationSearchResult = {
  id: string;
  name: string;
  email: string | null;
  debtorNumber: string | number | null;
};

type CachedRelationSearch = {
  expiresAt: number;
  relations: RelationSearchResult[];
};

const relationSearchCache = new Map<string, CachedRelationSearch>();

function getRelationSearchCacheKey(query: string) {
  return query.trim().toLowerCase();
}

function getCachedRelationSearch(cacheKey: string) {
  const cached = relationSearchCache.get(cacheKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    relationSearchCache.delete(cacheKey);
    return null;
  }

  return cached.relations;
}

function pruneRelationSearchCache() {
  const now = Date.now();

  for (const [cacheKey, cached] of relationSearchCache.entries()) {
    if (cached.expiresAt <= now) relationSearchCache.delete(cacheKey);
  }

  while (relationSearchCache.size > MAX_RELATION_SEARCH_CACHE_ENTRIES) {
    const oldestCacheKey = relationSearchCache.keys().next().value;
    if (!oldestCacheKey) break;
    relationSearchCache.delete(oldestCacheKey);
  }
}

function setCachedRelationSearch(cacheKey: string, relations: RelationSearchResult[]) {
  relationSearchCache.set(cacheKey, {
    expiresAt: Date.now() + RELATION_SEARCH_CACHE_TTL_MS,
    relations,
  });
  pruneRelationSearchCache();
}

function mapRelationSearchResults(relations: Awaited<ReturnType<typeof searchRelations>>) {
  return relations.slice(0, 20).map((relation) => ({
    id: String(relation.id),
    name: getRelationName(relation),
    email: relation.email ?? null,
    debtorNumber: relation.debtorNumber ?? null,
  }));
}

function createRelationSearchResponse(relations: RelationSearchResult[], cacheState: "hit" | "miss") {
  return NextResponse.json(
    { relations },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "x-smart-trade-relation-cache": cacheState,
      },
    },
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawQuery = url.searchParams.get("query") ?? "";
    const query = rawQuery.trim();

    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `query mag maximaal ${MAX_QUERY_LENGTH} tekens bevatten.` },
        { status: 400 },
      );
    }

    const cacheKey = getRelationSearchCacheKey(query);
    const cachedRelations = getCachedRelationSearch(cacheKey);
    if (cachedRelations) return createRelationSearchResponse(cachedRelations, "hit");

    const relations = mapRelationSearchResults(await searchRelations(query));
    setCachedRelationSearch(cacheKey, relations);

    return createRelationSearchResponse(relations, "miss");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Relaties zoeken mislukt." },
      { status: 500 },
    );
  }
}
