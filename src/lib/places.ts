// ============================================================
// Google Places API — resolve business URL to address + lat/lng
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
 *   1. Extract the domain from the URL.
 *   2. Search Google Places "findplacefromtext" with the domain as query.
 *   3. Return the first match's name, address, and coordinates.
 *
 * Falls back to geocoding the `city` string if Places can't find the business.
 */
export async function resolveBusinessFromUrl(
  url: string,
  city: string
): Promise<BusinessInfo | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");

  const domain = normaliseDomain(url);

  // Try Places Text Search first (most accurate for AU SMBs)
  const searchUrl =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(domain + " " + city)}` +
    `&region=au` +
    `&key=${apiKey}`;

  const res = await fetch(searchUrl);
  if (!res.ok) throw new Error(`Google Places API error: ${res.status}`);

  const data = (await res.json()) as {
    status: string;
    results: Array<{
      name: string;
      formatted_address: string;
      place_id: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };

  if (data.status === "OK" && data.results.length > 0) {
    const place = data.results[0];
    return {
      name: place.name,
      address: place.formatted_address,
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
      placeId: place.place_id,
    };
  }

  // Fallback: geocode the city to get a central lat/lng
  return geocodeCity(city, apiKey);
}

async function geocodeCity(city: string, apiKey: string): Promise<BusinessInfo | null> {
  const geocodeUrl =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(city + ", Australia")}` +
    `&key=${apiKey}`;

  const res = await fetch(geocodeUrl);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status: string;
    results: Array<{
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };

  if (data.status === "OK" && data.results.length > 0) {
    const r = data.results[0];
    return {
      name: city,
      address: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      placeId: "",
    };
  }

  return null;
}

function normaliseDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .split("/")[0];
}
