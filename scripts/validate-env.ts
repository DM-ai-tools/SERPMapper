/**
 * Environment Variable Validator
 *
 * Run before deployment to confirm all required env vars are set.
 * Catches missing keys before they cause silent runtime failures.
 *
 * Run: npx tsx scripts/validate-env.ts
 */

const REQUIRED: Array<{ key: string; description: string }> = [
  // Supabase
  { key: "NEXT_PUBLIC_SUPABASE_URL",    description: "Supabase project URL" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", description: "Supabase anon (public) key" },
  { key: "SUPABASE_SERVICE_ROLE_KEY",   description: "Supabase service role key (server-only)" },
  // DataforSEO
  { key: "DATAFORSEO_LOGIN",            description: "DataforSEO account email" },
  { key: "DATAFORSEO_PASSWORD",         description: "DataforSEO API password" },
  // Google
  { key: "GOOGLE_PLACES_API_KEY",       description: "Google Places Text Search API key" },
  // Anthropic
  { key: "ANTHROPIC_API_KEY",           description: "Claude API key" },
  // SendGrid
  { key: "SENDGRID_API_KEY",            description: "SendGrid API key" },
  { key: "SENDGRID_FROM_EMAIL",         description: "Verified sender email address" },
  { key: "SENDGRID_TEMPLATE_CONFIRMATION", description: "SendGrid template ID — confirmation email" },
  { key: "SENDGRID_TEMPLATE_DAY3",      description: "SendGrid template ID — Day 3 nurture" },
  { key: "SENDGRID_TEMPLATE_DAY7",      description: "SendGrid template ID — Day 7 nurture" },
  // Lead CTA
  { key: "LEAD_CTA_BASE_URL",           description: "CTA destination URL (waitlist or live product)" },
  { key: "NEXT_PUBLIC_LEAD_CTA_BASE_URL", description: "CTA URL (public — client-side fallback)" },
  // Webhook
  { key: "WEBHOOK_SECRET",              description: "Shared secret for /api/webhooks/conversion" },
  // App
  { key: "NEXT_PUBLIC_APP_URL",         description: "Public app URL (e.g. https://serpmap.com.au)" },
];

const OPTIONAL: Array<{ key: string; description: string; default?: string }> = [
  { key: "DAILY_REPORT_QUOTA",   description: "Max reports per day", default: "200" },
  { key: "NEXT_PUBLIC_WAITLIST_URL", description: "Nav waitlist link", default: "https://dotmappers.in/waitlist" },
];

// Load .env.local if running locally
try {
  const fs = await import("fs");
  const path = await import("path");
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const [key, ...rest] = line.split("=");
      if (key && !key.startsWith("#") && rest.length > 0) {
        process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
      }
    }
    console.log("Loaded .env.local\n");
  }
} catch {
  // Ignore — running in Vercel/CI where env is already set
}

let hasErrors = false;
const errors: string[] = [];
const warnings: string[] = [];

console.log("=".repeat(55));
console.log("  SERPMapper — Environment Variable Validation");
console.log("=".repeat(55));

// Check required vars
console.log("\n[ REQUIRED ]\n");
for (const { key, description } of REQUIRED) {
  const value = process.env[key];
  if (!value || value.includes("your-") || value === "generate-a-random-32-char-secret-here") {
    console.log(`  ✗  ${key}`);
    console.log(`     ${description}`);
    errors.push(key);
    hasErrors = true;
  } else {
    const masked = value.length > 8 ? value.slice(0, 4) + "****" + value.slice(-4) : "****";
    console.log(`  ✓  ${key} = ${masked}`);
  }
}

// Check optional vars
console.log("\n[ OPTIONAL ]\n");
for (const { key, description, default: defaultVal } of OPTIONAL) {
  const value = process.env[key];
  if (!value) {
    console.log(`  ⚠  ${key} — not set (default: ${defaultVal ?? "none"})`);
    warnings.push(key);
  } else {
    console.log(`  ✓  ${key} = ${value}`);
  }
}

// Check for placeholder SendGrid template IDs
const templateKeys = ["SENDGRID_TEMPLATE_CONFIRMATION", "SENDGRID_TEMPLATE_DAY3", "SENDGRID_TEMPLATE_DAY7"];
const unsetTemplates = templateKeys.filter((k) => {
  const v = process.env[k];
  return v && v === "d-your-template-id";
});
if (unsetTemplates.length > 0) {
  console.log("\n[ SENDGRID TEMPLATES — ACTION REQUIRED ]\n");
  console.log("  The following SendGrid template IDs are still placeholder values.");
  console.log("  Create templates in SendGrid dashboard → Email API → Dynamic Templates:\n");
  for (const k of unsetTemplates) {
    console.log(`    ${k}`);
  }
  errors.push(...unsetTemplates);
  hasErrors = true;
}

// Summary
console.log("\n" + "=".repeat(55));
if (hasErrors) {
  console.log(`\n  FAILED — ${errors.length} required variable(s) missing:\n`);
  for (const key of errors) console.log(`    • ${key}`);
  console.log("\n  Fill in .env.local (local) or Vercel Environment Variables (production).");
  console.log("  See .env.local.example for reference.\n");
  process.exit(1);
} else {
  console.log("\n  ALL CHECKS PASSED ✓");
  if (warnings.length > 0) {
    console.log(`  ${warnings.length} optional variable(s) using defaults — OK for launch.\n`);
  } else {
    console.log("  Ready for deployment.\n");
  }
  process.exit(0);
}
