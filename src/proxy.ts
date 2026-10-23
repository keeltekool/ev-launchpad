import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, COOKIE_OPTIONS, cookieIsValid, cookieValue, passcodeMatches } from "@/lib/passcode";

// Every route sits behind the passcode: the board shows error titles from every app.
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/unlock" || pathname === "/api/unlock") return NextResponse.next();

  // A one-time ?key= link sets the cookie and drops the key from the address bar.
  const key = searchParams.get("key");
  if (key !== null) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("key");
    if (!passcodeMatches(key)) return NextResponse.redirect(new URL("/unlock?wrong=1", request.url));
    const res = NextResponse.redirect(clean);
    res.cookies.set(COOKIE, cookieValue(), COOKIE_OPTIONS);
    return res;
  }

  if (cookieIsValid(request.cookies.get(COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/unlock", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
