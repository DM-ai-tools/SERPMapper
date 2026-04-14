import Anthropic from "@anthropic-ai/sdk";

// claude-haiku-4-5 — cheapest capable model, ~$0.0004 per report
const MODEL = "claude-haiku-4-5-20251001";

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
  topMissedSuburbs: Array<{ name: string; volume: number }>;
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

Business data:
${JSON.stringify(input, null, 2)}

Write a 2-3 sentence plain-English summary of their Google Maps visibility.
Mention their score, how many suburbs they rank in vs total checked, and name 1-2 specific missed suburbs if available.
Do not use the phrase "Local Pack". Do not use asterisks or markdown.`;

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
  missedSuburbs: Array<{ name: string; volume: number }>
): Promise<string[]> {
  if (missedSuburbs.length === 0) return [];

  const client = getClient();

  const suburbList = missedSuburbs
    .map((s, i) => `${i + 1}. ${s.name} (${s.volume}/mo searches)`)
    .join("\n");

  const prompt = `You are writing opportunity cards for a local business. Each card is exactly one sentence.
Be specific: name the suburb, mention the search volume, frame it as a missed opportunity.
Tone: concrete, motivating, no hype.

Business: ${businessName}
Keyword: ${keyword}
Missed suburbs:
${suburbList}

Write exactly ${missedSuburbs.length} opportunity cards, one per line, numbered 1. 2. 3. etc.
Each card must be one sentence only. No markdown. No asterisks.`;

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
Use the business name, keyword, and suburb. Be specific and direct.
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
