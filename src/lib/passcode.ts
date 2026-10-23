import { createHash, timingSafeEqual } from "node:crypto";

export const COOKIE = "lp_pass";
export const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 365 * 86_400 };

const sha = (s: string) => createHash("sha256").update(s).digest();
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

// The cookie holds a hash of the passcode, never the passcode itself; changing the passcode logs every device out.
export const cookieValue = () => sha(`launchpad:${process.env.LAUNCHPAD_PASSCODE}`).toString("hex");

// Both checks fail closed when LAUNCHPAD_PASSCODE is not set.
export const passcodeMatches = (candidate: string | null | undefined) =>
  Boolean(process.env.LAUNCHPAD_PASSCODE && candidate) && same(sha(candidate!), sha(process.env.LAUNCHPAD_PASSCODE!));

export const cookieIsValid = (value: string | undefined) =>
  Boolean(process.env.LAUNCHPAD_PASSCODE && value) && same(Buffer.from(value!), Buffer.from(cookieValue()));
