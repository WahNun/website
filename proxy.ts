import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Auth.js accepts a Request at runtime and applies callbacks.authorized.
// The published types only describe the pages-router overload.
const handleAuth = auth as unknown as (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response | undefined>;

function stamp(response: Response) {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const login = new URL("/dive-os/login", request.url);
  const onLogin = request.nextUrl.pathname === "/dive-os/login";

  if (!process.env.AUTH_SECRET) {
    return stamp(onLogin ? NextResponse.next() : NextResponse.redirect(login));
  }

  try {
    const response = await handleAuth(request, event);
    if (response instanceof Response) return stamp(response);
    return stamp(NextResponse.next());
  } catch {
    if (onLogin) return stamp(NextResponse.next());
    login.searchParams.set("error", "Configuration");
    return stamp(NextResponse.redirect(login));
  }
}

export const config = {
  matcher: ["/dive-os", "/dive-os/:path*"],
};
