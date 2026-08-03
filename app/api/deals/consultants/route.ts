import { NextResponse } from "next/server";
import { requireLocalUser } from "@/lib/local-auth";
import { query } from "@/lib/local-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const verified = await requireLocalUser(request);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.message }, { status: 401 });
    }

    const { rows } = await query<{
      id: string;
      email: string | null;
      full_name: string | null;
      job_title: string | null;
      workdays: string | null;
      mobile_phone: string | null;
      role: string;
    }>(
      `select id, email, full_name, job_title, workdays, mobile_phone, role
       from public.profiles
       order by lower(coalesce(nullif(btrim(full_name), ''), email, id::text))`,
    );

    return NextResponse.json({ users: rows }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Gebruikers laden mislukt.",
    }, { status: 500 });
  }
}
