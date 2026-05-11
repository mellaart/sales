import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(request: Request) {
  const body = await request.json();

  const userId = body.userId;

  if (!userId) {
    return NextResponse.json(
      { error: "Geen userId ontvangen." },
      { status: 400 }
    );
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}