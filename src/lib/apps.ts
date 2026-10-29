import apps from "../../data/apps.json";

export type AppLink = { label: string; url: string };
// jobs: the app's last-ran page (GET, public, timestamps only) for its scheduled jobs.
// agents: its Managed Agents by name (gen_ai.agent.name in the traces, see agents.ts).
// routines: its active cloud routines (name: the routine.name tag in the traces, see routines.ts; trigger: the
// routine's id for RemoteTrigger); lateAfterHours: none for a routine without a schedule.
export type AppRoutine = { name: string; trigger: string; label: string; lateAfterHours?: number };
export type AppEntry = { name: string; url: string; repo?: string; sentry?: string; jobs?: string; agents?: string[]; routines?: AppRoutine[]; status: "live" | "dormant"; links: AppLink[] };

// LAUNCHPAD_EXTRA_APPS (a JSON array of entries) is only set by check-ui-flows' fixture server; production ignores it.
const extra = process.env.VERCEL_ENV === "production" ? "[]" : (process.env.LAUNCHPAD_EXTRA_APPS ?? "[]");
export const registry = [...apps, ...JSON.parse(extra)] as AppEntry[];
