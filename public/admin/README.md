# Admin React Structure

`/admin` is now a React-rendered admin surface for CRM, Ads, and CMS.

## Entry

- `../admin.html`: main React entry.
- `react-shell.css`: shadcn-style tokens, shell layout, auth, sidebar, topbar, tables, cards, and responsive states.
- `react-shell.js`: React UMD app with local UI primitives (`Button`, `Card`, `Input`, `Badge`, `Field`, `Icon`) and native page components.

## UI Layer

The admin uses local shadcn-style primitives so it can run in the current static/Express setup without adding a bundler yet.

- Tokens follow common shadcn naming: `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--ring`.
- Page components fetch the existing Express APIs directly.
- When the project moves to Vite/Next + Tailwind, these primitives can be replaced with real `components/ui` shadcn components.

## React Modules

- Dashboard: overview, traffic, behavior, devices.
- CRM: leads, survey, campaign, duplicates, Zoom meetings, settings.
- Ads: fetches `/ads/api/*` directly from React.
- CMS: fetches `/admin/cms/*` directly from React.

## Old Backup

The previous static admin files are kept only as a backup while React reaches full feature parity. They are not used by the `/admin` runtime.

## Feature Parity

- `FEATURE_PARITY.md` is the migration source of truth.
- Before changing a React admin tab, check the matching section in `FEATURE_PARITY.md`.
- Do not remove or simplify a legacy-backed behavior unless the checklist says it is intentionally dropped.
- After implementing a feature, update the checklist from `[ ]` or `[~]` to `[x]`.

## Next Steps

1. Work through `FEATURE_PARITY.md` in migration order.
2. Expand each React page until every drawer, modal, and action from the old admin is covered.
3. Split data hooks by domain: CRM, Ads, CMS, settings.
4. Move to Vite/Next + Tailwind when ready to install real shadcn/ui components.
5. Remove the old backup files only after `FEATURE_PARITY.md` is complete.
