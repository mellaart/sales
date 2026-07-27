import { NextResponse } from "next/server";
import {
  getPublicCustomerIntake,
  recordCustomerIntakeNotification,
  submitPublicCustomerIntake,
} from "@/lib/customer-intake-server";
import { sendCustomerIntakeNotification } from "@/lib/customer-intake-notification";
import {
  normalizeCustomerIntakeData,
  validateCustomerIntakeData,
} from "@/lib/customer-intake";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function tokenValues(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  return {
    token: searchParams.get("token")?.trim() ?? "",
    tokenVersion: Number(searchParams.get("v") ?? 0),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ intakeId: string }> },
) {
  try {
    const { intakeId } = await context.params;
    const { token, tokenVersion } = tokenValues(request);
    const result = await getPublicCustomerIntake(request, intakeId, tokenVersion, token);

    if ("error" in result) return jsonResponse({ error: result.error }, 404);
    return jsonResponse({ intake: result.intake });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Klantformulier laden mislukt." },
      500,
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ intakeId: string }> },
) {
  try {
    const { intakeId } = await context.params;
    const { token, tokenVersion } = tokenValues(request);
    const access = await getPublicCustomerIntake(request, intakeId, tokenVersion, token);
    if ("error" in access) return jsonResponse({ error: access.error }, 404);

    const body = await request.json().catch(() => null) as { formData?: unknown } | null;
    const formData = normalizeCustomerIntakeData(body?.formData);
    const validationError = validateCustomerIntakeData(formData);
    if (validationError) return jsonResponse({ error: validationError }, 400);

    const updated = await submitPublicCustomerIntake(intakeId, formData);
    if (!updated) {
      return jsonResponse(
        { error: "Het formulier kon niet worden opgeslagen. Vraag een nieuwe klantlink aan." },
        409,
      );
    }

    try {
      await sendCustomerIntakeNotification({
        request,
        intakeId: updated.id,
        dealId: updated.deal_id,
        submittedAt: updated.submitted_at || new Date().toISOString(),
        formData,
      });
      await recordCustomerIntakeNotification(updated.id, null);
    } catch (notificationError) {
      const message = notificationError instanceof Error
        ? notificationError.message
        : "Onbekende fout bij klantformulier-notificatie.";
      console.error(`Klantformulier-notificatie voor ${updated.id} mislukt: ${message}`);
      await recordCustomerIntakeNotification(updated.id, message.slice(0, 1_000))
        .catch((recordError) => {
          console.error("Notificatiefout opslaan mislukt:", recordError);
        });
    }

    return jsonResponse({
      ok: true,
      status: "submitted",
      submittedAt: updated.submitted_at,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Klantformulier opslaan mislukt." },
      500,
    );
  }
}
