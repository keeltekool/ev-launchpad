"use client";

import { useEffect } from "react";
import { report } from "@/lib/report";
import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void report("client:global-error", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
          <h1 className="form-title border-b-[3px] border-double border-rule-strong pb-3 text-[1.375rem] leading-none">Launchpad</h1>
          <p className="mt-6 text-[1.125rem] font-semibold text-red">The board failed to load. The error went to Sentry.</p>
          <button type="button" onClick={reset} className="form-label mt-6 self-start rounded-[2px] border border-ink bg-ink px-4 py-2.5 !text-paper">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
