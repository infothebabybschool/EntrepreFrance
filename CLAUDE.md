# EntrepreFrance — Claude Code Context

## What this project is

EntrepreFrance is a fr-language automated news site that scrapes RSS feeds, selects articles using Claude AI, writes full articles with Claude, sources images, and publishes them on a schedule.

> Entreprendre en France

It was generated from the **BEpaper template** using the newspaper generator. The full architecture and all configuration have already been applied — this CLAUDE.md gives you the context to work on it.

---

## Architecture

```
/                        Next.js 14 web app (Vercel)
  src/app/               App Router pages
  src/lib/brand.ts       Site identity (SITE_NAME, TAGLINE, SITE_DOMAIN, IS_RTL)
  src/lib/utils.ts       Categories, slugs, formatDate
  src/lib/admin.ts       ADMIN_USER_IDS allowlist
  api/articles/          POST — receives published articles from pipeline
  api/pipeline/          Pipeline ↔ web communication (Bearer auth)
  admin/                 Protected admin UI (Clerk auth + allowlist)

/pipeline/               Automation engine (Render Docker worker)
  scheduler.ts           Entry point — cron + command polling
  run.ts                 Full pipeline: scrape → select → write → image → save
  config.json            Runtime config (already configured for this site)
  editorial_style.md     Claude's writing instructions (already configured)
  lib/config.ts          Config reader — uses process.cwd() for paths
```

---

## Site configuration

| Setting | Value |
|---|---|
| Site name | EntrepreFrance |
| Domain | entreprefrance2026.vercel.app |
| Article language | fr / fr-FR |
| Articles per day | 3 |
| Pipeline trigger | 07:26 Europe/Brussels |
| Posting schedule | all at 09:00 |

### Categories
- `Entrepreneuriat et Startups` → URL slug: `entrepreneuriat-startups`
- `Technologie et Innovation` → URL slug: `technologie-innovation`
- `Économie et Marché` → URL slug: `economie-marche`
- `Finance et Investissement` → URL slug: `finance-investissement`
- `Leadership et Développement` → URL slug: `leadership-developpement`

Category helpers are in `src/lib/utils.ts`: `CATEGORIES`, `CATEGORY_TO_SLUG`, `SLUG_TO_CATEGORY`, `CATEGORY_SLUGS`.

### RSS feeds
- BFM: `https://www.bfmtv.com/rss/economie/`
- BFM: `https://www.bfmtv.com/rss/crypto/`
- BFM: `https://www.bfmtv.com/rss/economie/patrimoine/`
- BFM: `https://www.bfmtv.com/rss/economie/economie-social/`
- BFM: `https://www.bfmtv.com/rss/economie/economie-social/finances-publiques/`
- BFM: `https://www.bfmtv.com/rss/economie/international/`
- BFM: `https://www.bfmtv.com/rss/economie/entreprises/`
- BFM: `https://www.bfmtv.com/rss/economie/emploi/`
- BFM: `https://www.bfmtv.com/rss/economie/patrimoine/impots-fiscalite/`
- La Tribune: `https://www.latribune.fr/rss/homepage`
- FrenchWeb: `https://www.frenchweb.fr/feed`

Feeds are managed via the admin panel at `/admin/pipeline` → RSS Sources. Changes take effect within ~60s without redeploy.

---

## Journalist team

- **Marc Delvaux** (Directeur de la rédaction) — Entrepreneuriat et Startups, Leadership et Développement — style: analytique, enquête, vétéran
- **Isabelle Fontaine** (Directrice adjointe de la rédaction) — Finance et Investissement, Économie et Marché — style: investigation, enquête, justice
- **Thomas Benoit** (Responsable de section - Technologie et Innovation) — Technologie et Innovation, Entrepreneuriat et Startups — style: analytique, data, terrain
- **Sophie Mercier** (Responsable de section - Leadership et Développement) — Leadership et Développement, Entrepreneuriat et Startups — style: portrait, terrain, opinion
- **Jean-Luc Morel** (Journaliste senior - Finance et Marchés) — Finance et Investissement, Économie et Marché — style: analytique, marchés, data
- **Amélie Durand** (Journaliste - Entrepreneuriat et Startups) — Entrepreneuriat et Startups, Technologie et Innovation — style: terrain, portrait, correspondant
- **Nicolas Gauthier** (Correspondant - Économie et Politiques) — Économie et Marché, Leadership et Développement — style: institutionnel, enquête, correspondant

Add/edit journalists at `/admin/journalists`. Photo generation uses DALL-E via `/api/admin/journalists/[id]/generate-photo`.

---

## Key files already configured by the generator

| File | What it contains |
|---|---|
| `src/lib/brand.ts` | SITE_NAME, TAGLINE, SITE_DOMAIN, LOGO_URL, IS_RTL |
| `src/lib/utils.ts` | CATEGORIES, CATEGORY_TO_SLUG, SLUG_TO_CATEGORY |
| `src/lib/admin.ts` | ADMIN_USER_IDS (add your Clerk user ID here) |
| `pipeline/config.json` | Schedule, posting mode, RSS feeds |
| `pipeline/editorial_style.md` | Claude's editorial instructions |
| `supabase/schema.sql` | Full DB schema — run once in Supabase SQL editor |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS |
| Auth | Clerk v6 |
| Database | Supabase (Postgres) |
| Email | Resend |
| AI | Anthropic Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| Images | Pexels API, Unsplash, Pixabay |
| Pipeline hosting | Render (Docker worker) |
| Web hosting | Vercel |

---

## Environment variables

### Web app (Vercel)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `ARTICLES_API_SECRET`

### Pipeline (Render)
`ANTHROPIC_API_KEY`, `PEXELS_API_KEY`, `ARTICLES_API_SECRET`, `WEBSITE_URL=https://entreprefrance2026.vercel.app`

See `.env.local.example` and `pipeline/.env.example` for full lists.

---

## Common tasks for Claude Code

**Add a new admin user**: add their Clerk user ID to `ADMIN_USER_IDS` in `src/lib/admin.ts`

**Change pipeline schedule**: go to `/admin/pipeline` → Configuration → no redeploy needed

**Add RSS feed**: `/admin/pipeline` → RSS Sources → Test + Save

**Add a new page**: create `src/app/[route]/page.tsx` — add link to Header/Footer if needed

---

## First-run checklist

### 1. Verify config consistency
Confirm that `src/lib/brand.ts`, `src/lib/utils.ts`, `src/lib/site-config.ts`, and `pipeline/config.json` all match the values in this file.


---

## Deployment

See `README.md` for the full deployment checklist (Supabase, Vercel, Render, Clerk).
