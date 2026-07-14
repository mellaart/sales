import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isProtectedAdminEmail } from "@/lib/protected-admin";
import { ensureProtectedAdminRole } from "@/lib/protected-admin-server";
import { createLocalServiceClient } from "@/lib/local-service-client";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return createLocalServiceClient() as unknown as ReturnType<typeof createClient>;
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function verifyAdmin(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return { ok: false, message: "Niet ingelogd." } as const;

  const service = getServiceClient();
  const { data: userData, error: userError } = await service.auth.getUser(token);

  if (userError || !userData.user) return { ok: false, message: "Ongeldige sessie." } as const;

  await ensureProtectedAdminRole(service, userData.user);

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!isProtectedAdminEmail(userData.user.email) && (profileError || !profile || profile.role !== "admin")) {
    return { ok: false, message: "Geen toegang." } as const;
  }

  return { ok: true, service } as const;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isMissingSignatureColumnError(message: string) {
  return (
    message.includes("job_title") ||
    message.includes("workdays") ||
    message.includes("mobile_phone") ||
    message.includes("employee_relation_id")
  );
}

export async function POST(request: Request) {
  try {
    const verified = await verifyAdmin(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 403 });
    }

    const body = (await request.json()) as {
      userId?: string;
      jobTitle?: string | null;
      workdays?: string | null;
      mobilePhone?: string | null;
      employeeRelationId?: number | string | null;
    };
    const userId = body.userId?.trim();

    if (!userId) {
      return NextResponse.json({ error: "userId is verplicht." }, { status: 400 });
    }

    const { data: targetProfile } = await verified.service
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const { data: targetUserData } = await verified.service.auth.admin.getUserById(userId);

    const protectedProfile =
      isProtectedAdminEmail((targetProfile as { email?: string | null } | null)?.email) ||
      isProtectedAdminEmail(targetUserData.user?.email);

    const rawEmployeeRelationId = body.employeeRelationId;
    const employeeRelationId = rawEmployeeRelationId === null || rawEmployeeRelationId === undefined || rawEmployeeRelationId === ""
      ? null
      : Number(rawEmployeeRelationId);

    if (employeeRelationId !== null && (!Number.isSafeInteger(employeeRelationId) || employeeRelationId <= 0)) {
      return NextResponse.json({ error: "Medewerker relatie-ID moet een geldig positief nummer zijn." }, { status: 400 });
    }

    const jobTitle = normalizeText(body.jobTitle);
    const workdays = normalizeText(body.workdays);
    const mobilePhone = normalizeText(body.mobilePhone);

    const profileValues = protectedProfile
      ? { employee_relation_id: employeeRelationId }
      : {
          job_title: jobTitle,
          workdays,
          mobile_phone: mobilePhone,
          employee_relation_id: employeeRelationId,
        };

    const { error: profileError } = await verified.service
      .from("profiles")
      .update(profileValues)
      .eq("id", userId);

    if (profileError) {
      const message = isMissingSignatureColumnError(profileError.message)
        ? "Een benodigd profielveld ontbreekt nog in de database. Vernieuw de applicatie en probeer opnieuw."
        : profileError.message;
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const { data: userData } = await verified.service.auth.admin.getUserById(userId);
    const metadata = userData.user?.user_metadata ?? {};
    const { error: metadataError } = await verified.service.auth.admin.updateUserById(userId, {
      user_metadata: protectedProfile
        ? { ...metadata, employee_relation_id: employeeRelationId }
        : {
            ...metadata,
            job_title: jobTitle,
            workdays,
            mobile_phone: mobilePhone,
            employee_relation_id: employeeRelationId,
          },
    });

    return NextResponse.json({
      success: true,
      metadataWarning: metadataError?.message ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Profiel bijwerken mislukt." }, { status: 500 });
  }
}
