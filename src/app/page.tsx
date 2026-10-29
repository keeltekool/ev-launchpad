import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { getAgentSummary } from "@/lib/agents";
import { getRoutineSummary } from "@/lib/routines";
import { registry } from "@/lib/apps";
import { buildBoard } from "@/lib/board";
import { checkApp, checkJobs } from "@/lib/health";
import { getSentrySummary } from "@/lib/sentry";
import BoardClient from "./board-client";

const live = registry.filter((a) => a.status === "live");

async function getBoard() {
  "use cache";
  // Fresh for 60 s and gone after 2 min, so a rare visit re-checks instead of showing an hour-old board.
  // A lifetime this short is runtime data to Next, hence the Suspense boundary below.
  cacheLife({ stale: 60, revalidate: 60, expire: 120 });
  const [sentry, agents, routines, checks, jobs] = await Promise.all([
    getSentrySummary(),
    getAgentSummary(),
    getRoutineSummary(),
    Promise.all(live.map(async (a) => [a.name, await checkApp(a.url)] as const)),
    Promise.all(live.filter((a) => a.jobs).map(async (a) => [a.name, await checkJobs(a.jobs!)] as const)),
  ]);
  return buildBoard(registry, sentry, Object.fromEntries(checks), new Date(), Object.fromEntries(jobs), agents, routines);
}

async function Board() {
  return <BoardClient board={await getBoard()} />;
}

// The sheet while the checks run (at most the 10 s health-check timeout).
function Checking() {
  return (
    <div className="mx-auto max-w-[1760px] px-4 pt-5 md:px-8 md:pt-8">
      <div className="lg:w-[360px] xl:w-[400px]">
        <h1 className="form-title border-b-[3px] border-double border-rule-strong pb-3 text-[1.375rem] leading-none md:text-[1.625rem]">Launchpad</h1>
        <p className="mt-6 text-[1.25rem] font-semibold leading-snug text-ink-2 md:text-[1.5rem]" role="status">
          Checking {live.length} live apps…
        </p>
        <div className="pen-rule mt-3 text-rule-strong" />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Checking />}>
      <Board />
    </Suspense>
  );
}
