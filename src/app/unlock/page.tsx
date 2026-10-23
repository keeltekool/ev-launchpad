"use client";

import { useEffect, useState } from "react";

export default function Unlock() {
  const [wrong, setWrong] = useState(false);
  // Read after mount: the page stays static, and the flag only matters in the browser.
  useEffect(() => setWrong(new URLSearchParams(window.location.search).has("wrong")), []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="form-title border-b-[3px] border-double border-rule-strong pb-3 text-[1.375rem] leading-none">Launchpad</h1>
      <form method="post" action="/api/unlock" className="mt-6">
        <label htmlFor="passcode" className="form-label">
          Passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={wrong || undefined}
          aria-describedby={wrong ? "wrong" : undefined}
          className="mt-1 block w-full border-b border-rule-strong bg-transparent py-2 text-[1.125rem] focus:border-ink"
        />
        {wrong && (
          <p id="wrong" role="alert" className="mt-2 text-[0.9375rem] text-red">
            Wrong passcode. Try again, or open your saved key link.
          </p>
        )}
        <button type="submit" className="form-label mt-6 rounded-[2px] border border-ink bg-ink px-4 py-2.5 !text-paper hover:opacity-90">
          Unlock
        </button>
      </form>
    </main>
  );
}
