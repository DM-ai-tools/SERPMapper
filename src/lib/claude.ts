import Anthropic from "@anthropic-ai/sdk";


const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export interface ReportSummaryInput {
  businessName: string;
  keyword: string;
  score: number;
  total: number;
  rankingCount: number;
  top3Count: number;
  missedCount: number;
  topMissedSuburbs: Array<{ name: string }>;
  topRankedSuburbs: Array<{ name: string; position: number | null }>;
}

// ──────────────────────────────────────────────
// Generate plain-English visibility summary paragraph
// ──────────────────────────────────────────────
export async function generateVisibilitySummary(
  input: ReportSummaryInput
): Promise<string> {
  const client = getClient();

  const prompt = `You are writing a concise visibility summary for a local business owner.
Be specific, use their business name and keyword, and keep it to 2-3 sentences.
Tone: direct, empathetic, data-driven. No marketing fluff.

CRITICAL: Use ONLY the businessName value from the JSON below as the client's name. Do not substitute "Traffic Radius", "DotMappers", "SERPMapper", or any other agency or tool name as if it were this business.

Business data:
${JSON.stringify(input, null, 2)}

Write a 2-3 sentence plain-English summary of their Google Maps visibility.
Mention their score, how many suburbs they rank in vs total checked, and name 1-2 specific missed suburbs if available.
Do not use the phrase "Local Pack". Do not use asterisks or markdown.

CRITICAL: Do not mention search volume, "monthly searches", keyword demand counts, or any numbers in parentheses next to suburb names. Suburb names only (e.g. "areas such as Melbourne and Dandenong"). The UI shows city search volume elsewhere; this paragraph must not contradict it or invent figures.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  return extractText(message.content);
}

// ──────────────────────────────────────────────
// Generate top-5 opportunity cards
// One sentence per missed suburb
// ──────────────────────────────────────────────
export async function generateOpportunityCards(
  businessName: string,
  keyword: string,
  missedSuburbs: Array<{ name: string }>
): Promise<string[]> {
  if (missedSuburbs.length === 0) return [];

  const client = getClient();

  const prompt = `You are a local SEO advisor. Write exactly ${missedSuburbs.length} short, compelling opportunity statements (numbered 1-${missedSuburbs.length}).

Business: "${businessName}"
Keyword: "${keyword}"
These are top suburbs where this business is NOT ranking on Google Maps.

Suburbs:
${missedSuburbs.map((s, i) => `${i + 1}. ${s.name}`).join("\n")}

For each suburb write ONE sentence (max 20 words) that:
- Mentions the suburb name
- Frames the lack of visibility as a missed opportunity
- Creates urgency or emotional resonance
- Does NOT mention any numbers (no population, no search volume, no "residents", no "searches/mo")
- Use varied wording across all lines — never repeat the same sentence structure or phrasing
- Make each suburb feel distinct and important

Example format:
1. Box Hill residents are actively searching — but none of them can find your business on Google Maps yet.
2. You're invisible in Footscray, and every day that continues, competitors win the local customers.
3. Preston has strong local demand — right now, you're not even on their radar.

Write only the ${missedSuburbs.length} numbered lines. No intro. No explanation. No markdown. No asterisks.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = extractText(message.content);
  return text
    .split("\n")
    .filter((line) => line.match(/^\d+\./))
    .map((line) => line.replace(/^\d+\.\s*/, "").trim());
}

// ──────────────────────────────────────────────
// Generate personalised CTA copy
// ──────────────────────────────────────────────
export async function generateCtaCopy(
  businessName: string,
  keyword: string,
  topMissedSuburb: string | null
): Promise<string> {
  const client = getClient();

  const prompt = `Write a single, compelling CTA sentence encouraging a local business owner to improve their Google Maps visibility.
Use ONLY the business name below (never Traffic Radius, DotMappers, or SERPMapper as the client's name). Use the keyword and suburb. Be specific and direct.
Max 20 words. No exclamation marks. No markdown. No asterisks.

Business: ${businessName}
Keyword: ${keyword}
Top missed suburb: ${topMissedSuburb ?? "your area"}

Write the CTA sentence only.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 80,
    messages: [{ role: "user", content: prompt }],
  });

  return extractText(message.content);
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
