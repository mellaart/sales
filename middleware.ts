import { NextRequest, NextResponse } from "next/server";
import { LOCAL_SESSION_COOKIE } from "@/lib/local-auth-shared";

// This only short-circuits missing sessions. API routes still validate every
// session against the database; the presence of a cookie never grants access.
export function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  const publicPage = pathname === "/login"
    || pathname === "/reset-password"
    || pathname === "/worldline-test"
    || ["/klantgegevens/", "/implementatie-volgen/", "/offerte/", "/retourpinnen/"].some(prefix => pathname.startsWith(prefix));
  if (publicPage || request.cookies.get(LOCAL_SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }

  // Next may build request.url with the internal listener hostname. Keep
  // redirects on the original host when running behind the production proxy.
  const host = request.headers.get("host") || request.nextUrl.host;
  // Production terminates TLS at Apache without forwarding its scheme.
  // Public redirects must still use HTTPS; allow HTTP only for local tests.
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  const protocol = localHost ? request.nextUrl.protocol : "https:";
  const destination = new URL("/login", `${protocol}//${host}`);
  destination.searchParams.set("returnTo", pathname + search);
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml|.*\\.[a-zA-Z0-9]+$).*)"],
};
