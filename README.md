# SERPMapper — Local Search Visibility Heat Map

Free-to-use tool that checks a business's Google Maps rankings across 50 AU suburbs
and renders a colour-coded visibility map in under 60 seconds.

Built by Traffic Radius / DotMappers IT Pvt Ltd as the lead-generation engine for RankPilot.

---

## Architecture

```
serpmapper/
├── src/
│   ├── app/
│   │   ├── page.tsx                  Landing page (hero + how-it-works)
│   │   ├── tool/page.tsx             Main tool — processing + report view
│   │   ├── report/[id]/page.tsx      Shareable report (SSR + OG metadata)
│   │   └── api/
│   │       ├── analyze/route.ts      POST — start a new report
│   │       ├── report/[id]/route.ts  GET  — fetch report + results + cards
│   │       ├── lead/route.ts         POST — email capture + SendGrid trigger
│   │       └── webhooks/
│   │           └── rankpilot/route.ts  POST — conversion tracking from RankPilot
│   ├── components/
│   │   ├── InputForm.tsx             URL + keyword + city input
│   │   ├── ProcessingState.tsx       Progress bar with animated dots
│   │   ├── VisibilityMap.tsx         Leaflet map with suburb polygons
│   │   ├── EmailGate.tsx             Score teaser + email unlock form
│   │   ├── ReportView.tsx            Full report layout (score, map, cards, CTA)
│   │   ├── OpportunityCard.tsx       Per-suburb missed opportunity card
│   │   └── ScoreGauge.tsx            Animated circular score gauge
│   └── lib/
│       ├── types.ts                  Shared TypeScript interfaces
│       ├── supabase.ts               Supabase browser + admin clients
│       ├── dataforseo.ts             DataforSEO API client
│       ├── places.ts                 Google Places API — business resolver
│       ├── claude.ts                 Claude Haiku — summaries + cards + CTA
│       ├── sendgrid.ts               Email confirmation + nurture sequence
│       ├── scoring.ts                Visibility Score calculator
│       └── suburbs.ts               Suburb radius queries + cache key
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql    All tables, RLS policies, Realtime
│   │   └── 002_suburb_seed_script.sql  Verification queries
│   └── functions/
│       └── poll-dataforseo/
│           └── index.ts             Deno Edge Function — polls DataforSEO results
└── scripts/
    └── seed-suburbs.ts              One-time ABS suburb data loader
```

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/serpmapper.git
cd serpmapper
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
# Fill in all values in .env.local
```

Required keys:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`
- `GOOGLE_PLACES_API_KEY`
- `ANTHROPIC_API_KEY`
- `SENDGRID_API_KEY`

### 3. Run database migrations

In Supabase dashboard → SQL Editor, paste and run:
```
supabase/migrations/001_initial_schema.sql
```

### 4. Seed suburb data

```bash
# Download ABS ASGS suburb boundaries from abs.gov.au
# Simplify with Mapshaper: mapshaper input.geojson -simplify 10% -o data/aus_suburbs.geojson
npx tsx scripts/seed-suburbs.ts ./data/aus_suburbs.geojson
```

### 5. Deploy Supabase Edge Function

```bash
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy poll-dataforseo
```

Set Edge Function secrets:
```bash
supabase secrets set DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... ANTHROPIC_API_KEY=...
```

### 6. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

---

## Data Flow

```
User submits URL + keyword + city
       │
       ▼
POST /api/analyze
  ├─ Check daily quota (serpmap_quota)
  ├─ Check cache (serpmap_cache_index)
  ├─ Resolve business via Google Places API
  ├─ Build suburb grid (Supabase radius query)
  ├─ Create serpmap_reports row
  ├─ Create serpmap_results placeholder rows
  └─ POST 50 tasks to DataforSEO (async mode)
       │
       ▼
Supabase Edge Function (poll-dataforseo)
  ├─ Poll DataforSEO /tasks_ready every 5s
  ├─ Retrieve results for completed tasks
  ├─ Update serpmap_results rows
  └─ When ≥95% done (or 45s timeout):
      ├─ Calculate Visibility Score
      ├─ Generate Claude Haiku summaries + cards
      └─ Update serpmap_reports to "completed"
       │
       ▼
Next.js frontend (Supabase Realtime)
  ├─ Subscribes to serpmap_results INSERT/UPDATE
  ├─ Updates Leaflet polygon colours in real-time
  └─ Shows email gate at "partial" status
       │
       ▼
POST /api/lead (email capture)
  ├─ Insert serpmap_leads row
  ├─ Send confirmation email (SendGrid)
  ├─ Enrol in 3-email nurture sequence
  └─ Return pre-filled RankPilot trial URL
```

---

## Cost per Report

| Item | Cost (AUD) |
|------|-----------|
| DataforSEO (50 suburb tasks, async) | ~$0.025 |
| Google Places API | ~$0.004 |
| Claude Haiku API | ~$0.0004 |
| Supabase compute | ~$0.002 |
| Vercel serverless | ~$0.001 |
| SendGrid (3 emails @ 60% capture) | ~$0.001 |
| **Total** | **~$0.032** |

At 500 reports/month = AUD $16 infra cost → ~$1,188 attributed RankPilot MRR (74:1 ROI).

---

## Deployment

**Vercel (recommended):**
```bash
vercel deploy --prod
```
Set all environment variables in Vercel dashboard → Settings → Environment Variables.

**Domain:** Point `serpmap.com.au` to Vercel deployment.

---

## SendGrid Setup

1. Create 3 transactional email templates in SendGrid:
   - Confirmation (immediate) — link to full report
   - Day 3 — top 3 missed suburbs with volume
   - Day 7 — RankPilot trial offer with pre-filled URL

2. Set template IDs in `.env.local`:
   ```
   SENDGRID_TEMPLATE_CONFIRMATION=d-...
   SENDGRID_TEMPLATE_DAY3=d-...
   SENDGRID_TEMPLATE_DAY7=d-...
   ```

3. Configure DKIM/SPF/DMARC for `serpmap.com.au` in SendGrid.

---

## RankPilot Integration

When a SERPMapper lead converts to a RankPilot paying customer, RankPilot's Stripe
webhook handler POSTs to `/api/webhooks/rankpilot` with:
```json
{ "report_id": "uuid", "email": "user@example.com" }
```
Set `RANKPILOT_WEBHOOK_SECRET` in both services for auth.

---

## Success KPIs (Week 4 Targets)

| Metric | Target |
|--------|--------|
| Reports/month | 100 |
| Email capture rate | >40% |
| Report completion rate | >85% |
| Processing time (median) | <40s |
| DataforSEO accuracy | >88% |
| CTA click-through | >12% |
