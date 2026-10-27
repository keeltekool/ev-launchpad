"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppLink } from "@/lib/apps";
import type { Board, Row } from "@/lib/board";
import { ago, downPrompt, downReason, errorPrompt, latePrompt, lateLines } from "@/lib/prompt";

const REFRESH_MS = 5 * 60_000;
const TZ = "Europe/Tallinn";
const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
const date = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const frontDoor = (r: { url?: string; links: AppLink[] }) => r.links[0]?.url ?? r.url;
const ms = (n: number) => `${n.toLocaleString("en-GB").replace(",", " ")} ms`;

// "58× · 13 h ago · resolved · queue:waiting" (count is all-time; state is open, came back, resolved or archived)
function errorMeta(r: Row, checkedAt: string) {
  const i = r.errors!.latest!;
  return [`${i.count}×`, ago(i.lastSeen, checkedAt), i.back ? "came back" : i.state, i.area].filter(Boolean).join(" · ");
}

const problemPrompt = (r: Row, checkedAt: string) =>
  [r.problems.includes("down") && downPrompt(r, checkedAt), r.problems.includes("new error") && r.errors?.latest && errorPrompt(r), r.problems.includes("late") && latePrompt(r, checkedAt)]
    .filter(Boolean)
    .join("\n\n");

export default function BoardClient({ board }: { board: Board }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.matches("input, textarea, select, [contenteditable]");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === "Escape" && document.activeElement === search.current) {
        setQuery("");
        search.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);
  const watched = board.watched.filter((r) => match(r.name));
  const uptime = board.uptime.filter((r) => match(r.name));
  const dormant = board.dormant.filter((a) => match(a.name));
  const checkedCount = [...board.watched, ...board.uptime].filter((r) => r.health).length;
  const checked = clock(board.checkedAt);

  return (
    <div className="mx-auto max-w-[1760px] px-4 pb-16 pt-5 md:px-8 md:pt-8 lg:grid lg:grid-cols-[minmax(300px,380px)_1fr] lg:gap-12 xl:grid-cols-[420px_1fr] xl:gap-16">
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <header className="flex items-start justify-between gap-4 border-b-[3px] border-double border-rule-strong pb-3">
          <div>
            <h1 className="form-title text-[1.375rem] leading-none md:text-[1.625rem]">Launchpad</h1>
            <p className="form-label mt-2">
              Watch of {date(board.checkedAt)} · checked <time dateTime={board.checkedAt}>{checked}</time>
            </p>
          </div>
          <ThemeSwitch />
        </header>

        <label className="mt-4 block" htmlFor="find">
          <span className="form-label">Find an app</span>
          <span className="mt-1 flex items-center border-b border-rule-strong focus-within:border-ink">
            <input
              id="find"
              ref={search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name"
              autoComplete="off"
              className="w-full bg-transparent py-1.5 text-[1rem] placeholder:text-ink-2/70 [&::-webkit-search-cancel-button]:hidden"
            />
            <kbd className="form-label rounded-[2px] border border-rule px-1.5 py-0.5" aria-hidden>
              /
            </kbd>
          </span>
        </label>

        <WatchEntry board={board} checked={checked} checkedCount={checkedCount} match={match} />

        {!board.sentryOk && (
          <p className="mt-4 border-t border-rule pt-3 text-[0.875rem] text-ink-2">
            Sentry unreachable: the error columns are empty. The health checks still ran.
          </p>
        )}
      </aside>

      <main className="mt-8 lg:mt-0">
        <section aria-labelledby="watched">
          <h2 id="watched" className="form-label mb-1">
            Watched by Sentry · {board.watched.length}
          </h2>
          <table className="ledger text-[0.875rem]">
            <thead>
              <tr>
                <th className="form-label">App</th>
                <th className="form-label">Status</th>
                <th className="form-label">Latest error, 7 days</th>
                <th className="form-label">
                  <span className="sr-only">Actions</span>
                </th>
                <th className="form-label">Links</th>
              </tr>
            </thead>
            <tbody>
              {watched.map((r) => (
                <WatchedRow key={r.name} row={r} board={board} />
              ))}
            </tbody>
          </table>
          {watched.length === 0 && <p className="border-b border-rule py-3 text-ink-2">No watched app matches “{query.trim()}”.</p>}
        </section>

        <section aria-labelledby="uptime" className="mt-10">
          <h2 id="uptime" className="form-label border-b-[3px] border-double border-rule-strong pb-1">
            Uptime only · {board.uptime.length} <span className="normal-case tracking-normal">(no Sentry: up or down is all Launchpad knows)</span>
          </h2>
          <ul className="columns-1 gap-10 text-[0.875rem] sm:columns-2 xl:columns-3">
            {uptime.map((r) => (
              <UptimeItem key={r.name} row={r} />
            ))}
          </ul>
          {uptime.length === 0 && <p className="border-b border-rule py-3 text-ink-2">No uptime-only app matches “{query.trim()}”.</p>}
        </section>

        <details className="mt-10 border-t-[3px] border-double border-rule-strong pt-3" open={q && dormant.length ? true : undefined}>
          <summary className="form-label cursor-pointer select-none py-1 hover:text-ink">Dormant ({dormant.length})</summary>
          <ul className="mt-2 columns-1 gap-10 text-[0.875rem] sm:columns-2 xl:columns-3">
            {dormant.map((a) => (
              <li key={a.name} className="flex break-inside-avoid items-baseline justify-between gap-3 border-b border-rule py-1.5">
                <span>{a.name}</span>
                <Links links={a.links} />
              </li>
            ))}
          </ul>
        </details>
      </main>
    </div>
  );
}

function WatchEntry({ board, checked, checkedCount, match }: { board: Board; checked: string; checkedCount: number; match: (n: string) => boolean }) {
  if (!board.problems.length) {
    return (
      <section className="mt-6 text-ink" aria-label="Status">
        <p className="form-label">{checked}</p>
        <p className="mt-1 text-[1.25rem] font-semibold leading-snug [text-wrap:balance] md:text-[1.5rem]">
          All {checkedCount} live apps up · {board.sentryOk ? "no new errors in 24 h" : "errors unknown, Sentry unreachable"}
        </p>
        <div className="pen-rule mt-3" />
        <p className="mt-3 text-[0.875rem] leading-snug text-ink-2">
          When something breaks, it shows here in red with its error and a prompt to copy into Claude Code.
        </p>
      </section>
    );
  }
  const shown = board.problems.filter((r) => match(r.name));
  return (
    <section className="mt-6 text-red" aria-labelledby="trouble">
      <p className="form-label !text-red">{checked}</p>
      <h2 id="trouble" className="mt-1 text-[1.25rem] font-semibold leading-snug md:text-[1.5rem]">
        {plural(board.problems.length, "app needs you", "apps need you")}
      </h2>
      <div className="pen-rule pen-rule-double mt-3" />
      <ul className="mt-1">
        {shown.map((r) => {
          const door = frontDoor(r);
          const issue = r.problems.includes("new error") ? r.errors?.latest : undefined;
          return (
            <li key={r.name} className="border-b border-rule py-3">
              {door ? (
                <a href={door} target="_blank" rel="noopener" className="text-[1.0625rem] font-semibold">
                  {r.name}
                </a>
              ) : (
                <span className="text-[1.0625rem] font-semibold">{r.name}</span>
              )}
              {r.problems.includes("down") && <p className="mt-0.5 text-[0.9375rem]">Down: {downReason(r)}</p>}
              {lateLines(r, board.checkedAt).map((l) => (
                <p key={l} className="mt-0.5 text-[0.9375rem]">
                  Late: {l}
                </p>
              ))}
              {issue && (
                <>
                  <p className="mt-0.5 text-[0.9375rem] [overflow-wrap:anywhere]">
                    {issue.back ? "Came back:" : "New error:"}{" "}
                    <a href={issue.url} target="_blank" rel="noopener" className="underline decoration-double">
                      {issue.title}
                    </a>
                  </p>
                  <p className="mt-1 text-[0.75rem] leading-snug">{errorMeta(r, board.checkedAt)}</p>
                </>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyPrompt text={problemPrompt(r, board.checkedAt)} primary />
                {issue && (
                  <a href={issue.url} target="_blank" rel="noopener" className="act">
                    Sentry
                  </a>
                )}
                {door && (
                  <a href={door} target="_blank" rel="noopener" className="act">
                    Open
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Status({ row: r }: { row: Row }) {
  if (!r.health) return <span className="text-ink-2">—</span>;
  if (!r.health.up) return <span className="form-label !font-bold !text-red">down</span>;
  if (r.slow) return <span className="form-label !text-ink" title={ms(r.health.ms)}>slow</span>;
  return <span className="form-label" title={ms(r.health.ms)}>up</span>;
}

function WatchedRow({ row: r, board }: { row: Row; board: Board }) {
  const door = frontDoor(r);
  const issue = r.errors?.latest;
  return (
    <tr>
      <td data-col="name">
        {door ? (
          <a href={door} target="_blank" rel="noopener" className={r.problems.includes("down") ? "down-name no-underline" : "font-medium no-underline hover:underline"}>
            {r.name}
          </a>
        ) : (
          <span className="font-medium">{r.name}</span>
        )}
      </td>
      <td data-col="status">
        <Status row={r} />
      </td>
      <td data-col="error" className="remark">
        {!r.errors ? (
          <span className="text-ink-2">—</span>
        ) : issue ? (
          <>
            <a href={issue.url} target="_blank" rel="noopener" title={issue.title} className={r.errors.newIssue24h ? "fresh-issue" : issue.state === "open" ? "font-medium" : ""}>
              {issue.title}
            </a>
            <span className={`text-[0.75rem] leading-snug ${issue.state === "open" ? "font-medium text-ink" : "text-ink-2"}`}>{errorMeta(r, board.checkedAt)}</span>
          </>
        ) : r.errors.silent ? (
          // Quiet is not the same as healthy: an app whose reporting broke also sends no errors.
          <span className="silent font-medium text-ink">Silent: no page timings or errors in 14 days. Is its Sentry wiring broken?</span>
        ) : (
          <span className="text-ink-2">
            No errors in 7 days{r.errors.lastHeard && ` · last heard from ${ago(r.errors.lastHeard, board.checkedAt)}`}
          </span>
        )}
      </td>
      <td data-col="actions">
        <span className="flex gap-2">
          {issue && <CopyPrompt text={errorPrompt(r)} />}
          {r.errors && (
            <a href={r.errors.projectUrl} target="_blank" rel="noopener" className="act" title={`${r.name}'s errors in Sentry`}>
              Sentry
            </a>
          )}
        </span>
      </td>
      <td data-col="links">{r.links.length ? <Links links={r.links} /> : <span className="text-ink-2">not in the registry</span>}</td>
    </tr>
  );
}

function UptimeItem({ row: r }: { row: Row }) {
  const door = frontDoor(r);
  const down = r.problems.includes("down");
  return (
    <li className="flex break-inside-avoid items-baseline justify-between gap-3 border-b border-rule py-1.5">
      <span className="flex items-baseline gap-2">
        <a href={door} target="_blank" rel="noopener" className={down ? "down-name no-underline" : "no-underline hover:underline"}>
          {r.name}
        </a>
        {(down || r.slow) && <Status row={r} />}
      </span>
      {r.links.length > 1 && <Links links={r.links.slice(1)} />}
    </li>
  );
}

// Copies the prompt; says so in place. If the browser refuses the clipboard, the text opens in a box to copy by hand.
function CopyPrompt({ text, primary }: { text: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this into Claude Code:", text);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" onClick={copy} className={`act act-copy${primary ? " act-primary" : ""}`}>
      {/* Both labels share one grid cell, so the button keeps its width when it says Copied. */}
      <span className={copied ? "invisible" : ""}>Copy for Claude Code</span>
      <span className={copied ? "" : "invisible"} aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

function Links({ links }: { links: AppLink[] }) {
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1 md:flex-nowrap">
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noopener" className="form-label !text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
          {l.label}
        </a>
      ))}
    </span>
  );
}

// Labels flip in CSS from <html data-theme>, so server and client render the same markup.
function ThemeSwitch() {
  const flip = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("launchpad-theme", next);
    } catch {}
  };
  return (
    <button type="button" onClick={flip} className="form-label shrink-0 rounded-[2px] border border-rule px-2 py-1.5 hover:border-rule-strong hover:text-ink">
      <span className="theme-to-dark">Night watch</span>
      <span className="theme-to-light">Day log</span>
    </button>
  );
}
