// ============================================================
// Google Places API (New) — resolve URL to address + lat/lng
// ============================================================

export interface BusinessInfo {
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId: string;
  /** When present, prefer this for ranking vs user-typed URL. */
  websiteUri?: string | null;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function canonicalPlaceId(raw: string): string {
  if (!raw?.trim()) return "";
  const s = raw.trim();
  return s.startsWith("places/") ? s.slice("places/".length) : s;
}

// ─── Main: website → GBP (no “random first city result”) ───

/**
 * Resolve a business URL to its Google Places record.
 * Does NOT fall back to “first result for Melbourne” — that was wrong for every other domain.
 */
export async function resolveBusinessFromUrl(
  url: string,
  city: string
): Promise<BusinessInfo | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");

  const domain = normaliseDomain(url);
  const cityTrim = city.trim();
  const brandGuess = guessBrandFromDomain(domain);
  const labelTokens = tokensFromDomainLabel(domain.split(".")[0] ?? domain);
  const tokenPhrase = labelTokens.length ? labelTokens.join(" ") : brandGuess;

  const geo = await cityCenterForBias(cityTrim, apiKey);
  const bias =
    geo != null && isValidLatLng(geo.lat, geo.lng)
      ? {
          circle: {
            center: { latitude: geo.lat, longitude: geo.lng },
            // Meters; keep strictly below 50_000 — some keys reject the inclusive max.
            radius: 40_000,
          },
        }
      : undefined;

  const queries = [
    `${domain} ${cityTrim} Australia`,
    `${brandGuess} ${cityTrim} Australia`,
    `${domain} Australia`,
    ...(tokenPhrase !== brandGuess
      ? [`${tokenPhrase} ${cityTrim} Australia`, `${tokenPhrase} Australia`]
      : []),
  ];

  const byId = new Map<string, PlaceRow>();
  for (const q of queries) {
    const rows = await searchTextPlaces(q, apiKey, bias);
    for (const p of rows) {
      const k = canonicalPlaceId(p.id);
      if (k) byId.set(k, p);
    }
  }

  const candidates = Array.from(byId.values());
  const best = pickBestCandidate(candidates, domain, brandGuess, cityTrim, labelTokens);
  if (!best) return null;

  const lat = best.location?.latitude;
  const lng = best.location?.longitude;
  if (lat === undefined || lng === undefined) return null;

  return {
    name: best.displayName?.text ?? brandGuess,
    address: best.formattedAddress ?? `${cityTrim}, Australia`,
    lat,
    lng,
    placeId: canonicalPlaceId(best.id),
    websiteUri: best.websiteUri ?? null,
  };
}

interface PlaceRow {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  websiteUri?: string;
}

async function searchTextPlaces(
  textQuery: string,
  apiKey: string,
  locationBias?: {
    circle: {
      center: { latitude: number; longitude: number };
      radius: number;
    };
  }
): Promise<PlaceRow[]> {
  const body: Record<string, unknown> = {
    textQuery,
    regionCode: "AU",
    languageCode: "en",
    maxResultCount: 15,
  };
  if (locationBias) body.locationBias = locationBias;

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Google Places API (New) error: ${res.status} ${detail}`);
  }

  const data = (await res.json()) as {
    places?: Array<PlaceRow & { name?: string }>;
  };

  return (data.places ?? [])
    .filter((p) => p.location?.latitude !== undefined && p.location?.longitude !== undefined)
    .map((p) => {
      const raw = p.id ?? p.name?.replace(/^places\//, "");
      return { ...p, id: canonicalPlaceId(raw) };
    })
    .filter((p) => p.id);
}

/**
 * Approximate city center for locationBias — uses Places API (New) only.
 * Avoids the Geocoding API (often disabled or restricted on the same key).
 */
async function cityCenterForBias(
  city: string,
  apiKey: string
): Promise<{ lat: number; lng: number } | null> {
  const rows = await searchTextPlaces(`${city.trim()}, Australia`, apiKey, undefined);
  const p = rows[0];
  const lat = p?.location?.latitude;
  const lng = p?.location?.longitude;
  if (lat === undefined || lng === undefined) return null;
  return { lat, lng };
}

function normaliseDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .split("/")[0];
}

function guessBrandFromDomain(domain: string): string {
  const base = domain.split(".")[0] ?? domain;
  return base.replace(/[-_]+/g, " ").trim();
}

function tokensFromDomainLabel(label: string): string[] {
  const raw = label.toLowerCase().match(/[a-z]{2,}|\d+/g) ?? [];
  return Array.from(new Set(raw)).filter((t) => t.length >= 2);
}

function registrableDomain(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length <= 2) return domain;
  const tld2 = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  const auSecondLevel = new Set(["com.au", "net.au", "org.au", "edu.au", "gov.au", "asn.au", "id.au"]);
  if (auSecondLevel.has(tld2) && parts.length >= 3) {
    return `${parts[parts.length - 3]}.${tld2}`;
  }
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

function pickBestCandidate(
  candidates: PlaceRow[],
  targetDomain: string,
  brandGuess: string,
  city: string,
  labelTokens: string[]
): PlaceRow | null {
  if (candidates.length === 0) return null;

  const domain = normaliseDomain(targetDomain);
  const rootDomain = registrableDomain(domain);
  const brand = brandGuess.toLowerCase().trim();
  const brandSplit = brand.split(/\s+/).filter((t) => t.length >= 2);
  const tokens = Array.from(
    new Set([...brandSplit, ...labelTokens, brand].filter(Boolean))
  ).filter((t) => t.length >= 2);
  const cityLc = city.toLowerCase().trim();

  let best: PlaceRow | null = null;
  let bestScore = -1;

  for (const c of candidates) {
    let score = 0;
    const name = (c.displayName?.text ?? "").toLowerCase();
    const address = (c.formattedAddress ?? "").toLowerCase();
    const websiteDomain = c.websiteUri ? normaliseDomain(c.websiteUri) : "";
    const websiteRoot = websiteDomain ? registrableDomain(websiteDomain) : "";

    if (websiteDomain && domain) {
      if (websiteDomain === domain) score += 120;
      else if (websiteDomain.endsWith(`.${domain}`) || domain.endsWith(`.${websiteDomain}`)) score += 100;
      else if (websiteRoot && websiteRoot === rootDomain) score += 90;
    }

    if (brand && name.includes(brand)) score += 35;
    const matched = tokens.filter((t) => name.includes(t)).length;
    score += matched * 8;
    if (matched >= 2) score += 10;
    if (matched >= 3) score += 12;
    if (cityLc && address.includes(cityLc)) score += 8;

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  if (!best) return null;

  const bestWd = best.websiteUri ? normaliseDomain(best.websiteUri) : "";
  const bestRoot = bestWd ? registrableDomain(bestWd) : "";
  const siteMatch = Boolean(
    bestWd && domain && (bestWd === domain || bestRoot === rootDomain)
  );
  if (siteMatch) return best;

  const nameOne = (best.displayName?.text ?? "").toLowerCase();
  const matchedOne = tokens.filter((t) => nameOne.includes(t)).length;
  if (candidates.length === 1 && matchedOne >= 3) return best;

  if (bestScore < 12) return null;
  if (bestScore >= 20) return best;
  if (bestScore >= 16 && matchedOne >= 4) return best;
  return null;
}
