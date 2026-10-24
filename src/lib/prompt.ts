// The "Copy for Claude Code" text: everything Claude Code needs to start on a problem, pasted as-is.
import type { Row } from "./board";

const ROOT = "C:\\Users\\Kasutaja\\Claude_Projects\\";
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Tallinn" }).format(new Date(iso));

export function downReason(r: Pick<Row, "health">) {
  if (r.health?.status != null) return `answered ${r.health.status}`;
  return r.health?.timedOut ? "no answer within 10 s" : "no connection";
}

const where = (r: Row) => [r.repo && `Repo: ${ROOT}${r.repo}`, r.url && `App: ${r.url}`].filter(Boolean);

export function errorPrompt(r: Row): string {
  const i = r.errors!.latest!;
  return [
    `Launchpad shows a Sentry error in ${r.name}. Investigate it and fix the cause.`,
    ...where(r),
    `Error: ${i.title}`,
    `Issue: ${i.shortId}, ${i.open ? "open" : "resolved"}, ${i.count} event${i.count === 1 ? "" : "s"}, first ${when(i.firstSeen)}, last ${when(i.lastSeen)} (Tallinn)`,
    ...(i.area ? [`Where: ${i.area} (the area tag from report())`] : []),
    `Sentry: ${i.url}`,
    `Full event: sentry api organizations/bits-and-pixels-ou/issues/${i.id}/events/latest/`,
    `If it is a real failure, fix it with a regression check and ship it, then resolve the issue in Sentry. If it came from a test, say so.`,
  ].join("\n");
}

export function downPrompt(r: Row, checkedAt: string): string {
  return [
    `Launchpad shows ${r.name} down: ${downReason(r)} at ${when(checkedAt)} (Tallinn).`,
    ...where(r),
    `Check the latest production deployment and its logs, find why it does not answer, fix it and ship it.`,
  ].join("\n");
}
