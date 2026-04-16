// ============================================================
// Google Places API (New) — resolve URL to address + lat/lng
// ============================================================

export interface BusinessInfo {
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId: string;
}

/**
 * Resolve a business URL to its Google Places record.
 * Strategy:
 *   1. Search by domain + city
 *   2. Fallback to a human-friendly brand guess + city
 *   3. Fallback to city center using Places API (New) searchText
 */
export async function resolveBusinessFromUrl(
  url: string,
  city: string
): Promise<BusinessInfo | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");

  const domain = normaliseDomain(url);

  // 1) Best-effort: domain + city
  const byDomain = await searchTextPlace(`${domain} ${city} Australia`, apiKey);
  if (byDomain) return byDomain;

  // 2) Fallback: human-readable brand guess + city
  const brandGuess = guessBrandFromDomain(domain);
  const byBrand = await searchTextPlace(`${brandGuess} ${city} Australia`, apiKey);
  if (byBrand) return byBrand;

  // 3) Fallback: city center (still via Places API New, no Geocoding dependency)
  return searchTextPlace(`${city} Australia`, apiKey);
}

async function searchTextPlace(textQuery: string, apiKey: string): Promise<BusinessInfo | null> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery,
      regionCode: "AU",
      languageCode: "en",
      maxResultCount: 5,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Google Places API (New) error: ${res.status} ${detail}`);
  }

  const data = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }>;
  };

  const place = data.places?.[0];
  const lat = place?.location?.latitude;
  const lng = place?.location?.longitude;
  if (!place || lat === undefined || lng === undefined) return null;

  return {
    name: place.displayName?.text ?? textQuery,
    address: place.formattedAddress ?? textQuery,
    lat,
    lng,
    placeId: place.id ?? "",
  };
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
