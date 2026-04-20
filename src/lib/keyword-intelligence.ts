import Anthropic from "@anthropic-ai/sdk";
import { slugifyKeywordForVolume } from "@/lib/keyword-utils";

const MODEL = "claude-haiku-4-5-20251001";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export interface KeywordResolution {
  /** Phrase sent to DataForSEO Google Maps (what a user would type in the Maps search box; location is set separately). */
  mapsQuery: string;
  /** Slug matching keys in `suburb_coordinates.search_volumes` (derived from mapsQuery). */
  volumeKey: string;
  source: "llm" | "fallback";
}

function fallbackResolution(trimmed: string): KeywordResolution {
  const mapsQuery = trimmed.replace(/\s+/g, " ").trim();
  return {
    mapsQuery,
    volumeKey: slugifyKeywordForVolume(mapsQuery),
    source: "fallback",
  };
}

/**
 * Turn free-form user input into a concise Google Maps search query.
 * Uses Claude Haiku when ANTHROPIC_API_KEY is set; otherwise normalises text only.
 */
export async function resolveKeywordForMaps(
  rawKeyword: string,
  city?: string
): Promise<KeywordResolution> {
  const trimmed = rawKeyword.trim();
  if (!trimmed) {
    return { mapsQuery: "", volumeKey: "", source: "fallback" };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackResolution(trimmed);
  }

  try {
    const client = getClient();
    const areaHint = city?.trim()
      ? `\nThey also entered city/area: "${city.trim()}" — use only to interpret vague service wording; still do NOT put place names in maps_query.\n`
      : "\n";

    const prompt = `The user runs a local business and typed this in our "service keyword" field (any language, typos, or long phrases allowed):

"${trimmed}"
${areaHint}
Reply with ONE JSON object only, no markdown, no code fences:
{"maps_query":"<string>"}

Rules for maps_query:
- This is the exact phrase we will send to Google Maps search (location is applied separately — do NOT add city, suburb, or country names).
- Use the same language the user used unless they clearly want English search results.
- Turn vague or conversational input into the short phrase customers type in Maps (typically 1–6 words), e.g. "I fix blocked drains" → "blocked drain plumber", "Zahnarzt" → "Zahnarzt".
- If input is already a good Maps query, keep it short and clean.
- Never return an empty string.`;

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 120,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? "{}") as { maps_query?: string };
    const mq = typeof parsed.maps_query === "string" ? parsed.maps_query.trim() : "";
    if (!mq) return fallbackResolution(trimmed);

    return {
      mapsQuery: mq.replace(/\s+/g, " "),
      volumeKey: slugifyKeywordForVolume(mq),
      source: "llm",
    };
  } catch (e) {
    console.warn("[keyword-intelligence] LLM resolution failed, using fallback:", e);
    return fallbackResolution(trimmed);
  }
}
