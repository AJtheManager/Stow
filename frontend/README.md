# Stow Frontend

The web client for [Stow](../README.md), a decentralized savings protocol on Stellar. Built with Next.js (App Router), React 19, TypeScript, and Tailwind CSS v4.

This guide covers everything a new contributor needs to install, run, test, and build the app locally.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | Same version used in CI |
| pnpm | 9 | The repo's package manager (`corepack enable` works too) |

> **Note:** A `pnpm-lock.yaml` is committed — always use pnpm so installs match CI.

## Getting Started

From this directory (`frontend/`):

```bash
# 1. Install dependencies
pnpm install

# 2. Start the dev server
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The page auto-updates as you edit files.

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start the development server on `http://localhost:3000` |
| `pnpm run build` | Create an optimized production build |
| `pnpm run start` | Serve the production build (run `build` first) |
| `pnpm run lint` | Run ESLint (`eslint-config-next` + TypeScript rules) |
| `pnpm run test` | Run unit tests once via Jest |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run test:coverage` | Run tests with a coverage report (thresholds enforced at 70%) |

## Environment Variables

No environment variables are required to run the app today — a clean clone works out of the box.

When configuration is needed (e.g. backend API URL, contract addresses), use these conventions:

- Create a `.env.local` file in `frontend/` for local overrides. It is git-ignored (all `.env*` files are).
- Prefix any variable read in client components with `NEXT_PUBLIC_`, e.g.:

  ```bash
  # frontend/.env.local
  NEXT_PUBLIC_API_URL=http://localhost:8080
  ```

- Restart the dev server after adding or changing variables.

### Page-view ping (optional, disabled by default)

The app can send a lightweight, cookieless page-view ping on route changes —
a privacy-friendly usage signal for the landing page. It is **off by
default**; enabling it requires an explicit opt-in.

- `NEXT_PUBLIC_ENABLE_PAGE_VIEW_PING` — set to `true` (or `1`) to enable. Any
  other value, or leaving it unset, keeps it disabled.
- `NEXT_PUBLIC_PAGE_VIEW_PING_ENDPOINT` — optional, defaults to
  `/api/analytics/pageview`. Point this at your own privacy-friendly
  collector if you enable the ping.

The ping never sets or reads cookies and never touches `localStorage`. Its
payload is limited to the current path and a timestamp — no PII, no
persistent visitor identifiers. See
[`src/lib/analytics.ts`](src/lib/analytics.ts).

To disable it, remove `NEXT_PUBLIC_ENABLE_PAGE_VIEW_PING` from your
environment (or set it to `false`) and rebuild — since `NEXT_PUBLIC_*`
variables are inlined at build time, changing it requires a rebuild to take
effect.

### Browser push notifications (optional)

Users can turn on browser push notifications per device from **Settings**.
Permission and local test notifications work without configuration; to have
the backend deliver pushes, set the public half of your VAPID key pair:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — base64url VAPID public key. When set, the
  device's push subscription is registered with
  `POST /api/user/push-subscriptions`. See [`src/lib/push.ts`](src/lib/push.ts)
  and the service worker at [`public/sw.js`](public/sw.js).

## Translations

UI strings live in `src/i18n/locales/<code>.json` and are read with
`useTranslation()` from [`src/context/I18nProvider.tsx`](src/context/I18nProvider.tsx):

```tsx
const { t, locale, setLocale } = useTranslation();
t("calculator.title");                 // "Savings calculator"
t("calculator.months", { count: 3 });  // plural forms: "3 months"
```

To add a language, copy `en.json`, translate it, and register it in
[`src/i18n/messages.ts`](src/i18n/messages.ts) and
[`src/i18n/config.ts`](src/i18n/config.ts). Missing keys fall back to English.
The chosen language is remembered per browser, and first-time visitors get
their browser's language when it's supported.

## Folder Structure

```
frontend/
├── public/                  # Static assets served at /
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── layout.tsx       # Root layout: fonts, metadata, global chrome
│   │   ├── page.tsx         # Landing page (features, products, roadmap)
│   │   ├── globals.css      # Tailwind v4 entry + design tokens
│   │   └── favicon.ico
│   ├── components/
│   │   ├── Navbar.tsx       # Top navigation
│   │   ├── MobileNav.tsx    # Mobile navigation
│   │   ├── WaitlistForm.tsx # Client component with form state
│   │   ├── GithubIcon.tsx   # Icon wrapper
│   │   ├── analytics/
│   │   │   └── PageViewPing.tsx  # Fires the optional page-view ping on route change
│   │   └── savings/         # Savings-domain UI primitives
│   │       ├── BalanceSparkline.tsx  # SVG balance trend chart (accessible)
│   │       ├── ProgressRing.tsx      # SVG goal-progress ring
│   │       ├── index.ts              # Barrel export for the folder
│   │       └── README.md             # Per-component docs & usage
│   └── lib/
│       └── analytics.ts     # Cookieless page-view ping, gated by env flag
├── jest.config.js           # Jest config via next/jest
├── jest.setup.js            # Test setup (jest-dom, browser API mocks)
├── eslint.config.mjs        # ESLint flat config
├── next.config.ts           # Next.js config
└── postcss.config.mjs       # PostCSS/Tailwind pipeline
```

## Architecture Overview

- **App Router (`src/app/`)** — Pages are React Server Components by default. `layout.tsx` loads the Geist font family via `next/font`, sets metadata, and renders the global background layers.
- **Components (`src/components/`)** — Shared UI. Interactive pieces (e.g. `WaitlistForm`) opt into client-side rendering with `"use client"`.
- **Savings primitives (`src/components/savings/`)** — Reusable, dependency-free SVG widgets for savings dashboards (balance sparkline, progress ring). Import them from the barrel:

  ```tsx
  import { BalanceSparkline } from "@/components/savings";
  ```

- **Styling** — Tailwind CSS v4 with design tokens defined in `globals.css` (`bg-brand`, `text-muted`, etc.). Icons come from `lucide-react`.
- **Path aliases** — `@/*` maps to `src/*` (configured for both TypeScript and Jest).
- **Testing** — Jest with `next/jest` and React Testing Library in a jsdom environment. Tests live beside their components as `*.test.tsx`. Browser APIs not present in jsdom (`matchMedia`, `IntersectionObserver`, `ResizeObserver`) are mocked in `jest.setup.js`.

CI runs lint, tests, and build on every PR touching `frontend/` — see [`.github/workflows/frontend-ci.yml`](../.github/workflows/frontend-ci.yml).

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) — features and API reference.
- [Learn Next.js](https://nextjs.org/learn) — interactive tutorial.
- [Stellar Docs](https://developers.stellar.org/docs/build/smart-contracts) — Soroban smart contracts.

See the root [CONTRIBUTING.md](../CONTRIBUTING.md) for branch/PR conventions before opening a pull request.
