import apps from "../../data/apps.json";

export type AppLink = { label: string; url: string };
export type AppEntry = { name: string; url: string; sentry?: string; status: "live" | "dormant"; links: AppLink[] };

// LAUNCHPAD_EXTRA_APPS (a JSON array of entries) is only set by check-ui-flows' fixture server.
export const registry = [...apps, ...JSON.parse(process.env.LAUNCHPAD_EXTRA_APPS ?? "[]")] as AppEntry[];
