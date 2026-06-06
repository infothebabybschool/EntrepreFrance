# Deployment Checklist — EntrepreFrance
Generated 2026-06-05

## Prerequisites
- [ ] Fork the BEpaper repository
- [ ] Node.js 20+, Supabase account, Vercel account, Render account
- [ ] Clerk account, Anthropic API key, Pexels API key, Resend account

## Step 1 — Code patches  (Code Patches tab)
- [ ] Replace src/lib/utils.ts
- [ ] Replace src/lib/admin.ts (add your Clerk user ID)
- [ ] Create src/lib/brand.ts (new file)
- [ ] git commit -m "Apply newspaper generator patches"

## Step 2 — Pipeline files
- [ ] Replace pipeline/config.json  (config.json tab)
- [ ] Replace pipeline/editorial_style.md  (editorial_style.md tab)
- [ ] git commit -m "Configure pipeline for EntrepreFrance"

## Step 3 — Supabase  (Supabase SQL tab)
- [ ] New Supabase project → SQL Editor → run the full SQL
- [ ] Verify tables: articles, journalists, pipeline_config, pipeline_commands, etc.
- [ ] Storage → New bucket → name: article-images → Public: YES

## Step 4 — Clerk auth
- [ ] Create Clerk app → copy publishable + secret keys
- [ ] After first deploy: sign in → clerk.com → Users → copy your user ID
- [ ] Add to ADMIN_USER_IDS in src/lib/admin.ts → commit + push

## Step 5 — Environment variables  (Env Variables tab)
- [ ] Vercel: Project → Settings → Environment Variables → paste pipeline/.env block
- [ ] Render: Service → Environment → paste pipeline/.env block
- [ ] Confirm ARTICLES_API_SECRET is identical in both

## Step 6 — Deploy
- [ ] Push master → Vercel auto-deploys → verify https://entreprefrance2026.vercel.app
- [ ] Render auto-deploys → check pipeline service logs

## Step 7 — First run
- [ ] Visit https://entreprefrance2026.vercel.app/admin/pipeline
- [ ] Verify trigger time: 07:26 Europe/Brussels
- [ ] Test each RSS feed
- [ ] Click "Run full pipeline" → watch logs
- [ ] Check Sourced → Selection → Ready to post sections

## Step 8 — Journalists
- [ ] /admin/journalists → add profiles → generate AI photos

## Step 9 — Verify
- [ ] First article appears on homepage with image, byline, category
- [ ] Article URL: https://entreprefrance2026.vercel.app/article/[slug]

## Warnings
- [ ] Custom categories: update src/app/categorie/[slug]/page.tsx and all generateStaticParams calls
## Optional
- [ ] Configure Resend email templates
- [ ] Set up custom domain in Vercel
- [ ] Configure Resend domain for email deliverability
