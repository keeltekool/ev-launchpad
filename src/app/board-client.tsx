"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppLink } from "@/lib/apps";
import type { Board, Row } from "@/lib/board";

const REFRESH_MS = 5 * 60_000;
const TZ = "Europe/Tallinn";
const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
const date = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const frontDoor = (r: { url?: string; links: AppLink[] }) => r.links[0]?.url ?? r.url;

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
  const live = board.live.filter((r) => match(r.name));
  const dormant = board.dormant.filter((a) => match(a.name));
  const checkedCount = board.live.filter((r) => r.health).length;
  const checked = clock(board.checkedAt);

  return (
    <div className="mx-auto max-w-[1760px] px-4 pb-16 pt-5 md:px-8 md:pt-8 lg:grid lg:grid-cols-[minmax(300px,360px)_1fr] lg:gap-12 xl:grid-cols-[400px_1fr] xl:gap-16">
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
        <h2 className="sr-only">Live apps</h2>
        <table className="ledger text-[0.875rem]">
          <thead>
            <tr>
              <th className="form-label">App</th>
              <th className="form-label">Status</th>
              <th className="form-label num">ms</th>
              <th className="form-label num">Errors 24 h / 7 d</th>
              <th className="form-label">Latest unresolved issue</th>
              <th className="form-label">Links</th>
            </tr>
          </thead>
          <tbody>
            {live.map((r) => (
              <LedgerRow key={r.name} row={r} />
            ))}
          </tbody>
        </table>
        {live.length === 0 && <p className="border-b border-rule py-3 text-ink-2">No live app matches “{query.trim()}”.</p>}

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
        {shown.map((r) => (
          <li key={r.name} className="border-b border-rule py-3">
            {frontDoor(r) ? (
              <a href={frontDoor(r)} target="_blank" rel="noopener" className="text-[1.0625rem] font-semibold">
                {r.name}
              </a>
            ) : (
              <span className="text-[1.0625rem] font-semibold">{r.name}</span>
            )}
            {r.problems.includes("down") && (
              <p className="mt-0.5 text-[0.9375rem]">
                Down: {r.health?.status != null ? `answered ${r.health.status}` : r.health?.timedOut ? "no answer within 10 s" : "no connection"}
              </p>
            )}
            {r.problems.includes("new error") && r.errors?.newest && (
              <p className="mt-0.5 text-[0.9375rem]">
                New error in 24 h:{" "}
                <a href={r.errors.newest.url} target="_blank" rel="noopener" className="underline decoration-double">
                  {r.errors.newest.title}
                </a>
              </p>
            )}
            <div className="mt-1 text-ink">
              <Links links={r.links} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LedgerRow({ row: r }: { row: Row }) {
  const down = r.problems.includes("down");
  const door = frontDoor(r);
  return (
    <tr>
      <td data-col="name">
        {door ? (
          <a href={door} target="_blank" rel="noopener" className={down ? "down-name no-underline" : "font-medium no-underline hover:underline"}>
            {r.name}
          </a>
        ) : (
          <span className="font-medium">{r.name}</span>
        )}
      </td>
      <td data-col="status">
        {!r.health ? <span className="text-ink-2">—</span> : r.health.up ? <span className="form-label">up</span> : <span className="form-label !font-bold !text-red">down</span>}
      </td>
      <td data-col="ms" className="num text-ink-2">
        {r.health ? r.health.ms.toLocaleString("en-GB").replace(",", " ") : ""}
        {r.health && <span className="md:hidden"> ms</span>}
      </td>
      <td data-col="errors" className="num">
        {!r.sentry ? (
          <span className="text-ink-2">no Sentry</span>
        ) : r.errors ? (
          <span className={r.errors.errors24h ? "font-semibold" : "text-ink-2"}>
            <span className="form-label mr-1.5 md:hidden">Errors 24 h / 7 d</span>
            {r.errors.errors24h} / {r.errors.errors7d}
          </span>
        ) : (
          <span className="text-ink-2">—</span>
        )}
      </td>
      <td data-col="remark" className="remark">
        {r.errors?.newest ? (
          <a href={r.errors.newest.url} target="_blank" rel="noopener" title={r.errors.newest.title} className={r.errors.newIssue24h ? "fresh-issue" : ""}>
            {r.errors.newest.title}
          </a>
        ) : (
          ""
        )}
      </td>
      <td data-col="links">{r.links.length ? <Links links={r.links} /> : <span className="text-ink-2">not in the registry</span>}</td>
    </tr>
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
