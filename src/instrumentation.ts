import type { Instrumentation } from "next";
import { report } from "@/lib/report";

// Uncaught route errors go to Sentry project `launchpad` through the light reporter (no SDK).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  await report(`request:${context.routePath}`, err, { method: request.method, path: request.path, routeType: context.routeType });
};
