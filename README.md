# Launchpad

One passcode-gated page that answers "is anything of mine broken right now?" for every live app, and opens any of them in one click. It health-checks each live app and merges in its Sentry errors.

- What and why: `SPEC.md`, `PRODUCT.md`
- How it is built and run: `STACK.md`
- The look: `DESIGN.md`
- Dev: `npm run dev` (needs `.env.local` from `vercel env pull`); checks: `npm test`, `node scripts/check-ui-flows.mjs <url>`
