import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/utils/supabase/env";

const limiters = new Map<string, number[]>();

function isRateLimited(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const timestamps = (limiters.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    limiters.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  limiters.set(key, timestamps);
  return false;
}

function withSupabase(request: NextRequest) {
  let response = NextResponse.next();
  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  return { supabase, get response() { return response; } };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (pathname === "/api/chat" && isRateLimited("chat:" + ip, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests", retryAfter: 60 }, { status: 429 });
  }
  if (pathname === "/api/draft" && request.method === "POST" && isRateLimited("draft:" + ip, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests", retryAfter: 60 }, { status: 429 });
  }

  if (!pathname.startsWith("/dive-os")) return NextResponse.next();

  const gate = withSupabase(request);
  const { data: { user } } = await gate.supabase.auth.getUser();
  const onLogin = pathname === "/dive-os/login";

  if (!user) {
    if (onLogin) return gate.response;
    const login = new URL("/dive-os/login", request.url);
    return NextResponse.redirect(login);
  }

  const { data: profile } = await gate.supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  if (onLogin) {
    if (isAdmin) return NextResponse.redirect(new URL("/dive-os/overview", request.url));
    return gate.response;
  }

  if (!isAdmin) {
    const login = new URL("/dive-os/login", request.url);
    login.searchParams.set("error", "forbidden");
    return NextResponse.redirect(login);
  }

  gate.response.headers.set("X-Robots-Tag", "noindex, nofollow");
  gate.response.headers.set("Cache-Control", "private, no-store");
  return gate.response;
}

export const config = {
  matcher: ["/dive-os", "/dive-os/:path*", "/api/chat", "/api/draft"],
};
