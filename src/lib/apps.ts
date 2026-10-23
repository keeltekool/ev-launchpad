import apps from "../../data/apps.json";

export type AppLink = { label: string; url: string };
export type AppEntry = { name: string; url: string; sentry?: string; status: "live" | "dormant"; links: AppLink[] };

export const registry = apps as AppEntry[];
