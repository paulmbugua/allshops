import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  const path = request.nextUrl.pathname;
  const platform = path === "/platform" || path.startsWith("/platform/");
  if (host === "admin.allshopspos.com" && !platform) {
    return NextResponse.redirect(
      new URL("/platform", "https://admin.allshopspos.com"),
    );
  }
  const response = NextResponse.next();
  if (platform) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
