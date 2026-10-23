import { NextResponse } from "next/server";
import { COOKIE, COOKIE_OPTIONS, cookieValue, passcodeMatches } from "@/lib/passcode";

// The unlock form posts here; 303 so the browser follows with a GET.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const passcode = form?.get("passcode");
  if (typeof passcode !== "string" || !passcodeMatches(passcode)) {
    return NextResponse.redirect(new URL("/unlock?wrong=1", request.url), 303);
  }
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.set(COOKIE, cookieValue(), COOKIE_OPTIONS);
  return res;
}
