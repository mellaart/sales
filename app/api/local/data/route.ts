import { NextResponse } from "next/server";
import { sendDealActivityNotification, type DealActivity } from "@/lib/deal-activity-notification";
import { requireLocalUser } from "@/lib/local-auth";
import { executeLocalTableQuery, type LocalTableQuery } from "@/lib/local-table";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getConsultantDealActivity(body: LocalTableQuery): DealActivity | null {
  if (body.table !== "deals") return null;
  if (body.action === "delete") return "deleted";
  if (body.action !== "update") return null;

  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
    ? body.payload as Record<string, unknown>
    : {};
  const archivedAt = payload.archived_at;
  return typeof archivedAt === "string" && archivedAt.trim() ? "archived" : null;
}

function firstDealRow(data: unknown) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data && typeof data === "object" ? data : null;
}

export async function POST(request: Request) {
  const verified = await requireLocalUser(request);
  if (!verified.ok) return jsonResponse({ error: verified.message }, 401);

  const body = await request.json().catch(() => null) as LocalTableQuery | null;
  if (!body?.table || !body.action) {
    return jsonResponse({ error: "Databaseverzoek mist gegevens." }, 400);
  }

  try {
    const result = await executeLocalTableQuery(body, {
      user: verified.user,
      profile: verified.profile,
    });

    if (result.error) {
      return jsonResponse({ error: result.error.message }, 400);
    }

    const activity = verified.profile.role === "consultant"
      ? getConsultantDealActivity(body)
      : null;
    const deal = firstDealRow(result.data);
    if (activity && deal) {
      try {
        await sendDealActivityNotification({
          activity,
          deal,
          actor: verified.profile,
        });
      } catch (error) {
        console.error("Dealactiviteit-mail versturen mislukt:", error);
      }
    }

    return jsonResponse({ data: result.data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Databaseverzoek mislukt." }, 500);
  }
}
