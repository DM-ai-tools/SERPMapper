# SERPMapper — Claude Code Project Context

## What This Is
Free local search visibility tool for Australian businesses.
Checks Google Maps (Local Pack) rankings across ~50 suburbs around a city, renders a
colour-coded Leaflet.js heat map, gates the full report behind email capture, and sends
a 3-email SendGrid nurture sequence. Fully standalone — no external product dependencies.

---

## Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 14 App Router · TypeScript · Tailwind CSS |
| Map | Leaflet.js + react-leaflet (CARTO Positron tiles) |
| Database | Supabase (PostgreSQL + Realtime + Edge Functions) |
| Rank data | DataforSEO Local Pack API (async batch mode) |
| Business resolve | Google Places Text Search API |
| AI summaries | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) |
| Email | SendGrid (confirmation + 3-email nurture) |
| Hosting | Vercel |

---

## Key Files

### Lib (shared logic)
- `src/lib/types.ts` — All interfaces (`SerpMapReport`, `SerpMapResult`, `OpportunityCard`, `SerpMapLead`), `getRankBand()`, `RANK_COLORS`, `RANK_WEIGHTS`
- `src/lib/supabase.ts` — Browser client (anon key) + `createAdminClient()` (service role, server-only)
- `src/lib/dataforseo.ts` — `postLocalPackTasks()`, `getReadyTaskIds()`, `getTaskResult()`, `findBusinessRank()` (Levenshtein fallback), `normaliseDomain()`
- `src/lib/places.ts` — `resolveBusinessFromUrl()` → Google Places Text Search, falls back to `geocodeCity()`
- `src/lib/claude.ts` — `generateVisibilitySummary()`, `generateOpportunityCards()`, `generateCtaCopy()` via Haiku
- `src/lib/sendgrid.ts` — `sendConfirmationEmail()`, `enrollInNurtureSequence()`, `buildLeadCtaUrl()`
- `src/lib/scoring.ts` — `calculateVisibilityScore()`, `getTopMissedSuburbs()`, `buildReportSummary()`
- `src/lib/suburbs.ts` — `getSuburbsInRadius()` (Haversine, cap 60), `buildCacheKey()`

### API Routes
- `src/app/api/analyze/route.ts` — `POST`: quota → cache check → Places resolve → suburb grid → create DB rows → batch DataforSEO tasks
- `src/app/api/report/[id]/route.ts` — `GET`: returns report + results + opportunity cards
- `src/app/api/lead/route.ts` — `POST`: upsert lead → confirmation email → nurture enrol → return `ctaUrl`

### Components
- `src/components/VisibilityMap.tsx` — Leaflet map, `ssr: false`, `isPartial` prop triggers blur overlay
- `src/components/EmailGate.tsx` — Score teaser + email input, calls `POST /api/lead`, fires `onUnlocked(ctaUrl, suburb)`
- `src/components/ReportView.tsx` — Full layout: score gauge + summary + map + gate/cards + CTA card + suburb table
- `src/components/ScoreGauge.tsx` — Animated SVG circular gauge (requestAnimationFrame cubic ease-out)
- `src/components/ProcessingState.tsx` — Animated progress + suburb chip ticker
- `src/components/OpportunityCard.tsx` — Single opportunity card (suburb, volume, card_text)

### Pages
- `src/app/tool/page.tsx` — Supabase Realtime subscription on `serpmap_results` + `serpmap_reports`; shows ProcessingState → ReportView
- `src/app/report/[id]/page.tsx` — SSR shared report with `generateMetadata()` for per-report OpenGraph tags
- `src/app/page.tsx` — Landing page with InputForm

### Supabase
- `supabase/migrations/001_initial_schema.sql` — 6 tables: `suburb_coordinates`, `serpmap_reports`, `serpmap_results`, `serpmap_leads`, `serpmap_cache_index`, `opportunity_cards` + RLS + Realtime
- `supabase/functions/poll-dataforseo/index.ts` — Deno Edge Function: polls DataforSEO every 5s, writes results, scores, calls Haiku, writes opportunity cards + cache index

### Scripts
- `scripts/seed-suburbs.ts` — One-time ABS ASGS GeoJSON → Supabase suburb seed

---

## Database Setup (run once)
```bash
# 1. Apply schema
supabase db push
# or manually run: supabase/migrations/001_initial_schema.sql

# 2. Seed suburb coordinates
npx ts-node scripts/seed-suburbs.ts
```

---

## Environment Variables
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# APIs
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
GOOGLE_PLACES_API_KEY=
ANTHROPIC_API_KEY=
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=hello@serpmap.com.au

# App
NEXT_PUBLIC_APP_URL=https://serpmap.com.au
NEXT_PUBLIC_LEAD_CTA_BASE_URL=https://dotmappers.in/waitlist
LEAD_CTA_BASE_URL=https://dotmappers.in/waitlist
```

---

## Visibility Score Formula
```
score = sum(rank_weight[suburb] × normalised_search_volume[suburb]) / sum(normalised_search_volume)

Rank weights:
  Top 3     → 1.0
  Page 1    → 0.6
  Page 2    → 0.3
  Missing   → 0.0
```

---

## User Flow
```
Landing (URL + keyword + city)
  → POST /api/analyze
  → ProcessingState (Supabase Realtime fills map live)
  → Partial report: score + 10 suburbs + blurred map
  → EmailGate: enter email → POST /api/lead
  → Full report: all suburbs + opportunity cards + CTA
  → Share button → /report/[uuid] (public, no gate)
  → SendGrid: Email 1 (immediate) + Day 3 + Day 7 nurture
```

---

## 7-Day Cache
Cache key: `normalised_url|keyword|radius`
Stored in `serpmap_cache_index`. Prevents re-calling DataforSEO for the same
business+keyword+radius within 7 days. Checked in `/api/analyze` before any API calls.

---

## Cost Per Report
| Service | Cost |
|---|---|
| DataforSEO (50 suburbs) | ~AUD $0.025 |
| Google Places API | ~AUD $0.004 |
| Claude Haiku | ~AUD $0.0004 |
| Infra (Supabase/Vercel) | ~AUD $0.004 |
| **Total** | **~AUD $0.032** |

---

## CTA (Post-unlock)
Button: **"Book a Free Strategy Call"**
Subtitle: "Free 15-min call · No obligation"
Destination controlled by `NEXT_PUBLIC_LEAD_CTA_BASE_URL` env var.
**No code change needed** to point to a different product — update the env var only.

---

## Rules — DO NOT
- Add RankPilot references anywhere (fully decoupled; future integration via env var only)
- Commit `.env.local` or any API keys
- Use SSR for Leaflet — always `dynamic(() => import('./VisibilityMap'), { ssr: false })`
- Use `WidthType.PERCENTAGE` in any docx/table generation (breaks Google Docs)
- Add `\n` inside JSX — use separate `<Paragraph>` elements
- Skip the 7-day cache check in `/api/analyze`

---

## Deployment Checklist
```
1. vercel deploy (or push to GitHub → auto-deploy)
2. Set all env vars in Vercel dashboard
3. Run DB migration on Supabase
4. Seed suburbs: npx ts-node scripts/seed-suburbs.ts
5. Deploy Edge Function: supabase functions deploy poll-dataforseo
6. Test with one real AU business URL
```
