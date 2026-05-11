import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedRoles = ["admin", "manager", "sales", "support", "consultant"];

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Supabase admin keys ontbreken." }, { status: 500 });
    }

    const body = await request.json();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "").trim();
    const role = String(body.role ?? "sales").trim();

    if (!email || !password) {
      return NextResponse.json({ error: "E-mail en wachtwoord zijn verplicht." }, { status: 400 });
    }

    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Ongeldige rol." }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (data.user) {
      await admin.from("profiles").upsert({
        id: data.user.id,
        email,
        role,
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Gebruiker aanmaken mislukt." }, { status: 500 });
  }
}