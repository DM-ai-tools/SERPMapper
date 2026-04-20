/**
 * Confirms GOOGLE_PLACES_API_KEY works with Places API (New) — the only Google API
 * SERPMapper needs for business lookup (searchText + city anchor for bias).
 *
 * Run from serpmapper/:  npm run verify-places
 */
import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });
config({ path: join(root, ".env") });

const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
if (!key) {
  console.error("FAIL: GOOGLE_PLACES_API_KEY is not set in .env.local");
  process.exit(1);
}

async function searchText(textQuery) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri",
    },
    body: JSON.stringify({
      textQuery,
      regionCode: "AU",
      languageCode: "en",
      maxResultCount: 3,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

async function main() {
  console.log("1) Places API (New) — searchText (business-style query)…\n");

  const data = await searchText("cafe Melbourne Australia");
  const places = data.places ?? [];
  if (places.length === 0) {
    console.error("FAIL: zero places returned");
    process.exit(1);
  }
  const p = places[0];
  console.log("OK  searchText");
  console.log("   ", p.displayName?.text ?? "?");
  console.log("   ", p.location?.latitude, p.location?.longitude);

  console.log("\n2) City anchor for map bias (same API as the app — no Geocoding API)…\n");

  const cityData = await searchText("Melbourne, Australia");
  const cp = cityData.places?.[0];
  if (!cp?.location?.latitude) {
    console.error("FAIL: could not anchor city via Places searchText");
    process.exit(1);
  }
  console.log("OK  city center anchor:", cp.displayName?.text ?? "Melbourne");
  console.log("   ", cp.location.latitude, cp.location.longitude);
  console.log("\n3) searchText with locationBias.circle (same shape as the app)…\n");

  const biasBody = {
    textQuery: "cafe Melbourne Australia",
    regionCode: "AU",
    languageCode: "en",
    maxResultCount: 3,
    locationBias: {
      circle: {
        center: { latitude: cp.location.latitude, longitude: cp.location.longitude },
        radius: 40_000,
      },
    },
  };
  const biasedRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri",
    },
    body: JSON.stringify(biasBody),
  });
  const biasedText = await biasedRes.text();
  if (!biasedRes.ok) {
    console.error("FAIL: biased searchText:", biasedRes.status, biasedText.slice(0, 400));
    process.exit(1);
  }
  const biasedData = JSON.parse(biasedText);
  if (!(biasedData.places?.length > 0)) {
    console.error("FAIL: biased searchText returned zero places");
    process.exit(1);
  }
  console.log("OK  searchText + locationBias.circle");
  console.log("   ", biasedData.places[0].displayName?.text ?? "?");

  console.log(
    "\nAll checks use Places API (New) only. You do not need Geocoding API enabled for SERPMapper."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
