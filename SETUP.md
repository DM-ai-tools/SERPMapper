# SERPMapper — Infrastructure Setup Checklist

Complete these steps in order. Each section maps to one day of the project plan.

---

## Day 1 — Accounts & Credentials (PM)

### 1.1 Domain
- [ ] Register **serpmap.com.au** via GoDaddy, Namecheap, or Crazy Domains (~AUD $15/yr)
- [ ] Note: DNS will be pointed to Vercel in Day 4

### 1.2 Supabase Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Name: `serpmapper-prod` | Region: **ap-southeast-2 (Sydney)**
3. Save the generated password somewhere secure
4. From Project Settings → API:
   - Copy `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy `SUPABASE_SERVICE_ROLE_KEY`

### 1.3 DataforSEO Account
1. Sign up at [dataforseo.com](https://dataforseo.com)
2. Top up with AUD $50 credit (covers ~1,500 reports)
3. From Dashboard → API Access: copy login email + password
4. Set a **daily budget limit** of AUD $10 in DataforSEO settings

### 1.4 Google Cloud APIs
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create project: `serpmapper`
3. Enable APIs: **Places API** + **Geocoding API**
4. Create an API key → restrict to these 2 APIs + your domain
5. Copy `GOOGLE_PLACES_API_KEY`

### 1.5 Anthropic API Key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create API key: `serpmapper-prod`
3. Set usage limit: USD $20/month
4. Copy `ANTHROPIC_API_KEY`

### 1.6 SendGrid Account
1. Sign up at [sendgrid.com](https://sendgrid.com) (free tier: 100 emails/day)
2. Domain Authentication:
   - Settings → Sender Authentication → Authenticate Your Domain
   - Domain: `serpmap.com.au`
   - Add the provided DNS records to your domain registrar
   - Wait for verification (usually 24-48 hours)
3. Copy `SENDGRID_API_KEY` from Settings → API Keys

---

## Day 2 — Database Setup (Engineer 1)

### 2.1 Run Migration
1. In Supabase dashboard → SQL Editor → New query
2. Open `supabase/migrations/001_initial_schema.sql`
3. Paste entire file and click **Run**
4. Verify tables appear in Table Editor: `suburb_coordinates`, `serpmap_reports`, `serpmap_results`, `serpmap_leads`, `serpmap_cache_index`, `serpmap_quota`, `opportunity_cards`

### 2.2 Enable Realtime (verify migration did this)
- Go to Database → Replication
- Confirm `serpmap_results` and `serpmap_reports` appear in the publication list
- If not: run the Realtime section of the migration again

### 2.3 Seed Suburb Data
```bash
# Download ABS ASGS Edition 3 suburb boundaries
# URL: https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files
# Download: "Suburb and Locality" → GeoJSON format → SAL_2021_AUST_GDA2020.geojson

# Install Mapshaper (one-time)
npm install -g mapshaper

# Simplify polygons from ~300MB to ~8MB
mkdir -p data
mapshaper SAL_2021_AUST_GDA2020.geojson -simplify 10% -o data/aus_suburbs.geojson

# Seed to Supabase (takes ~5 minutes)
cp .env.local.example .env.local    # Fill in Supabase vars first
npx tsx scripts/seed-suburbs.ts ./data/aus_suburbs.geojson
```

Expected output: `Done. ~15,000 suburbs seeded.`

### 2.4 Seed Search Volumes (run immediately after suburb seed)
```bash
# Quick estimation mode (free, runs in ~2 minutes)
npx tsx scripts/seed-search-volumes.ts --mode=estimate

# Optional: accurate mode using DataforSEO (costs ~AUD $5, takes ~15 minutes)
# Run this after launch when you have real usage data to justify the cost
# npx tsx scripts/seed-search-volumes.ts --mode=dataforseo
```

### 2.5 Deploy Supabase Edge Function
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project (find project ref in Settings → General)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the polling function
supabase functions deploy poll-dataforseo

# Set Edge Function secrets (copy from your .env.local)
supabase secrets set \
  DATAFORSEO_LOGIN=your@email.com \
  DATAFORSEO_PASSWORD=your-password \
  ANTHROPIC_API_KEY=sk-ant-xxx \
  SUPABASE_URL=https://xxx.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=eyJxxx
```

### 2.6 Set Up pg_cron (trigger Edge Function every 5 seconds)
1. In Supabase → SQL Editor → Run:
```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Call the Edge Function every minute (pg_cron minimum is 1 minute)
-- The Edge Function itself loops internally every 5 seconds
SELECT cron.schedule(
  'poll-dataforseo',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.functions.supabase.co/poll-dataforseo',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```
Replace `YOUR_PROJECT_REF` and `YOUR_ANON_KEY` with your actual values.

---

## Day 3 — SendGrid Email Templates

Create 3 transactional templates in SendGrid → Email API → Dynamic Templates.

### Template 1: Confirmation (immediate)
**Subject:** Your SERPMapper report is ready

**Variables used:** `{{business_name}}`, `{{primary_keyword}}`, `{{visibility_score}}`, `{{report_url}}`

**Copy:**
> Hi,
>
> Your Google Maps visibility report for **{{business_name}}** is ready.
>
> Your visibility score: **{{visibility_score}}/100**
>
> [View Your Full Report]({{report_url}})
>
> — The SERPMapper Team

### Template 2: Day 3 — "Your invisible suburbs"
**Subject:** The suburbs costing {{business_name}} the most leads

**Variables used:** `{{business_name}}`, `{{top_missed_suburb}}`, `{{primary_keyword}}`, `{{cta_url}}`, `{{report_url}}`

**Copy:**
> Your report showed that **{{business_name}}** isn't ranking for {{primary_keyword}} in {{top_missed_suburb}} — and suburbs like that can be worth hundreds of leads a month.
>
> [See your full missed-opportunity list]({{report_url}})
>
> We're building a tool that fixes exactly this.
> [Join the waitlist]({{cta_url}})

### Template 3: Day 7 — Waitlist CTA
**Subject:** You asked — here's how we fix your invisible zones

**Variables used:** `{{business_name}}`, `{{primary_keyword}}`, `{{top_missed_suburb}}`, `{{cta_url}}`

**Copy:**
> A week ago, you checked your Google Maps visibility for {{primary_keyword}}.
>
> We're building an AI SEO tool specifically for Australian local businesses like {{business_name}} — one that fixes the invisible suburbs automatically.
>
> Be first to know when it launches:
> [Join the Waitlist]({{cta_url}})

**After creating each template:** Copy the `d-xxxx` template ID and add it to `.env.local`:
```
SENDGRID_TEMPLATE_CONFIRMATION=d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_TEMPLATE_DAY3=d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_TEMPLATE_DAY7=d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Day 4 — Vercel Deployment

### 4.1 Install Vercel CLI and Deploy
```bash
npm install -g vercel

# From the serpmapper/ directory:
vercel deploy --prod
```

Follow the prompts:
- Link to existing project? → No, create new
- Project name: `serpmapper`
- Root directory: `.` (current directory)

### 4.2 Add Environment Variables in Vercel
1. Go to vercel.com → serpmapper project → Settings → Environment Variables
2. Add **all** variables from `.env.local` (both Production and Preview)
3. Critical: set `NEXT_PUBLIC_APP_URL=https://serpmap.com.au`

### 4.3 Configure Custom Domain
1. In Vercel → Settings → Domains → Add `serpmap.com.au`
2. Vercel will show you DNS records to add
3. Go to your domain registrar → DNS settings
4. Add the CNAME record Vercel provides
5. Wait for DNS propagation (usually 5–30 minutes)

### 4.4 Verify SSL
- Visit https://serpmap.com.au — should show padlock
- Vercel auto-provisions Let's Encrypt certificates

---

## Day 5 — Google Analytics 4

### 5.1 Create GA4 Property
1. Go to [analytics.google.com](https://analytics.google.com)
2. Admin → Create Property → Property name: `SERPMapper`
3. Business size: Small, Industry: Technology
4. Copy the Measurement ID (G-XXXXXXXXXX)

### 5.2 Add GA4 to Next.js
Install:
```bash
npm install @next/third-parties
```

In `src/app/layout.tsx`, add inside `<head>`:
```tsx
import { GoogleAnalytics } from '@next/third-parties/google'
// ...
<GoogleAnalytics gaId="G-XXXXXXXXXX" />
```

### 5.3 Configure Custom Events
In your GA4 property → Configure → Events → Create event:

| Event Name | Trigger |
|---|---|
| `report_started` | Form submission on homepage |
| `report_completed` | Status changes to `completed` |
| `email_captured` | Email gate form submitted |
| `cta_clicked` | "Join the Waitlist" button clicked |
| `waitlist_joined` | Confirmed redirect to waitlist page |

---

## Day 5 — Pre-Launch Validation

```bash
# 1. Validate all env vars are set
npx tsx scripts/validate-env.ts

# 2. TypeScript type-check
npm run typecheck

# 3. Build check
npm run build
```

### Manual QA checklist
- [ ] Submit form with a real AU business URL (e.g. a plumber in Melbourne)
- [ ] Processing state shows animated dots + progress bar
- [ ] At least 1 suburb result arrives within 10 seconds (Realtime working)
- [ ] Email gate appears with score visible
- [ ] Enter test email — full map unlocks
- [ ] Check SendGrid Activity → confirmation email sent
- [ ] Share button copies link correctly
- [ ] Shareable report URL opens correctly (SSR + OG metadata)
- [ ] Test on mobile viewport (375px)
- [ ] DataforSEO accuracy: manually cross-check 3 suburb results in Google Maps

### DataforSEO accuracy validation
For each result where the tool says "Position #X in [Suburb]":
1. Open Google Maps on desktop (logged out / incognito)
2. Search: `[keyword] [suburb] Australia`
3. Count position in local pack results
4. Target: >88% match within ±2 positions

---

## Switching CTA to Live Product (Future)

When a DotMappers product launches, update **two** environment variables in Vercel:
```
LEAD_CTA_BASE_URL=https://app.[product].com.au/trial
NEXT_PUBLIC_LEAD_CTA_BASE_URL=https://app.[product].com.au/trial
```

No code changes. No redeployment needed. All pre-collected leads in SendGrid will
automatically start receiving the live product CTA on the next email send.

---

## Cost Summary at Launch

| Service | Monthly Cost |
|---|---|
| Vercel Pro | USD $20 |
| Supabase Pro | USD $25 |
| DataforSEO (100 reports) | AUD ~$3 |
| Google Places API (100 reports) | AUD ~$0.40 |
| Claude Haiku (100 reports) | AUD ~$0.04 |
| SendGrid (60 emails @ 60% capture) | Free tier |
| **Total at 100 reports/month** | **~AUD $75** |
| **At 500 reports/month** | **~AUD $95** |
