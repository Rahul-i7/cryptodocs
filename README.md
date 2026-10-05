# CryptoDocs

Offline cryptographic attribution for sensitive documents (internally called *Aegis Provenance*): seal a PDF for named recipients, attribute a leaked copy to the recipient it was decrypted for, and verify the evidence offline. This is a browser prototype; see `docs/architecture.md` for the security boundary and `docs/requirements-traceability.md` for current status.

## Stack

TanStack Start + React 19 + Vite, Tailwind CSS 4, shadcn/ui (Radix), Web Crypto, `@noble/post-quantum`, `pdf-lib`. Deployed on Vercel through Nitro.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev      # http://localhost:3000 (or the URL it prints)
npm test         # unit tests
npm run build    # production build (Vercel output in .vercel/output)
npm run lint
```

On Windows you can also double-click `Start.bat`.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project → Import** the repo.
3. Leave the framework preset on **Other**/auto-detected. Build command `npm run build`. Do not set an output directory.
4. Deploy. Every push to `main` redeploys; other branches get preview URLs.

## Project layout

- `src/routes/` – file-based routes (`__root.tsx` is the app shell)
- `src/features/provenance/` – crypto/evidence engine, types, and the workspace UI
- `src/components/` – shared UI (shadcn)
- `docs/` – architecture and requirements traceability
- `roadmap.md` – progress checklist
